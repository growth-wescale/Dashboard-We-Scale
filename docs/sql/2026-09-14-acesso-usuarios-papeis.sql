-- Controle de acessos do dashboard — Supabase de MARKETING (jmuluoksnlqrvzbcltim),
-- onde vive o login. Papéis editáveis (telas + ações) e papel por usuário.
-- Aditivo: nenhuma tabela existente é alterada. Autorizado pelo Gabriel (dono do banco).
--
-- Rollback:
--   drop table public.acesso_usuarios, public.acesso_papel_permissoes, public.acesso_papeis cascade;
--   drop function public.tem_permissao(text), public.minhas_permissoes(), public.acesso_listar_usuarios(),
--     public.acesso_encerrar_sessoes(uuid), public.acesso_garantir_admin(),
--     public.acesso_proteger_papel_sistema(), public.acesso_tocar_atualizado_em();

create table public.acesso_papeis (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) > 0),
  descricao text,
  acesso_total boolean not null default false,
  sistema boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.acesso_papel_permissoes (
  papel_id uuid not null references public.acesso_papeis(id) on delete cascade,
  permissao text not null check (permissao ~ '^(aba|acao)\.[a-z0-9-]+$'),
  primary key (papel_id, permissao)
);

create table public.acesso_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel_id uuid not null references public.acesso_papeis(id) on delete restrict,
  marca text, -- slug de BRAND_LIST; preenchido = usuário travado nessa marca
  ativo boolean not null default true,
  convidado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index acesso_usuarios_papel_idx on public.acesso_usuarios(papel_id);

-- ── Funções ────────────────────────────────────────────────────────────────
create or replace function public.tem_permissao(chave text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.acesso_usuarios u
    join public.acesso_papeis p on p.id = u.papel_id
    where u.user_id = auth.uid() and u.ativo
      and (p.acesso_total or exists (
        select 1 from public.acesso_papel_permissoes pp where pp.papel_id = p.id and pp.permissao = chave))
  );
$$;

create or replace function public.minhas_permissoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
        'registrado', true, 'ativo', u.ativo, 'papel', p.nome,
        'acesso_total', p.acesso_total, 'marca', u.marca,
        'permissoes', coalesce((select jsonb_agg(pp.permissao order by pp.permissao)
                                from public.acesso_papel_permissoes pp where pp.papel_id = p.id), '[]'::jsonb))
     from public.acesso_usuarios u join public.acesso_papeis p on p.id = u.papel_id
     where u.user_id = auth.uid()),
    jsonb_build_object('registrado', false, 'ativo', false, 'papel', null,
                       'acesso_total', false, 'marca', null, 'permissoes', '[]'::jsonb));
$$;

create or replace function public.acesso_listar_usuarios()
returns table (usuario_id uuid, email text, criado_em timestamptz, ultimo_login timestamptz,
               convite_pendente boolean, papel_id uuid, papel_nome text, marca text, ativo boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.tem_permissao('acao.usuarios-gerenciar') then
    raise exception 'sem permissão para gerenciar usuários' using errcode = '42501';
  end if;
  return query
    select au.id, au.email::text, au.created_at, au.last_sign_in_at,
           (au.last_sign_in_at is null),
           acc.papel_id, p.nome, acc.marca, coalesce(acc.ativo, false)
    from auth.users au
    left join public.acesso_usuarios acc on acc.user_id = au.id
    left join public.acesso_papeis p on p.id = acc.papel_id
    order by lower(au.email::text);
end $$;

-- Encerra sessões abertas de um usuário desativado (só a Edge Function chama).
create or replace function public.acesso_encerrar_sessoes(alvo uuid) returns void
language sql security definer set search_path = auth, public as $$
  delete from auth.sessions where user_id = alvo;
$$;

-- ── Travas ─────────────────────────────────────────────────────────────────
create or replace function public.acesso_tocar_atualizado_em() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;

create trigger acesso_papeis_atualizado before update on public.acesso_papeis
  for each row execute function public.acesso_tocar_atualizado_em();
create trigger acesso_usuarios_atualizado before update on public.acesso_usuarios
  for each row execute function public.acesso_tocar_atualizado_em();

create or replace function public.acesso_proteger_papel_sistema() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then raise exception 'Tipo de acesso padrão não pode ser apagado.' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.sistema and (new.nome <> old.nome or new.acesso_total <> old.acesso_total or new.sistema <> old.sistema) then
    raise exception 'Tipo de acesso padrão não pode ser renomeado.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger acesso_papeis_protege before update or delete on public.acesso_papeis
  for each row execute function public.acesso_proteger_papel_sistema();

create or replace function public.acesso_garantir_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.acesso_usuarios u join public.acesso_papeis p on p.id = u.papel_id
                 where u.ativo and p.acesso_total) then
    raise exception 'Precisa sobrar pelo menos um administrador ativo.' using errcode = 'P0001';
  end if;
  return null;
end $$;
create trigger acesso_usuarios_garante_admin after update or delete on public.acesso_usuarios
  for each statement execute function public.acesso_garantir_admin();

-- ── RLS: só quem gerencia usuários lê/escreve; o próprio usuário usa minhas_permissoes() ──
alter table public.acesso_papeis enable row level security;
alter table public.acesso_papel_permissoes enable row level security;
alter table public.acesso_usuarios enable row level security;

revoke all on public.acesso_papeis, public.acesso_papel_permissoes, public.acesso_usuarios from anon, authenticated;
grant select, delete on public.acesso_papeis to authenticated;
grant insert (nome, descricao), update (nome, descricao) on public.acesso_papeis to authenticated;
grant select, insert, delete on public.acesso_papel_permissoes to authenticated;
grant select on public.acesso_usuarios to authenticated;
grant update (papel_id, marca) on public.acesso_usuarios to authenticated;

create policy acesso_papeis_gerenciar on public.acesso_papeis for all to authenticated
  using (public.tem_permissao('acao.usuarios-gerenciar')) with check (public.tem_permissao('acao.usuarios-gerenciar'));
create policy acesso_papel_permissoes_gerenciar on public.acesso_papel_permissoes for all to authenticated
  using (public.tem_permissao('acao.usuarios-gerenciar')) with check (public.tem_permissao('acao.usuarios-gerenciar'));
create policy acesso_usuarios_gerenciar on public.acesso_usuarios for all to authenticated
  using (public.tem_permissao('acao.usuarios-gerenciar')) with check (public.tem_permissao('acao.usuarios-gerenciar'));

revoke all on function public.tem_permissao(text), public.minhas_permissoes(), public.acesso_listar_usuarios(),
  public.acesso_encerrar_sessoes(uuid), public.acesso_garantir_admin(), public.acesso_proteger_papel_sistema(),
  public.acesso_tocar_atualizado_em() from public, anon, authenticated;
grant execute on function public.tem_permissao(text), public.minhas_permissoes(), public.acesso_listar_usuarios() to authenticated;
grant execute on function public.acesso_encerrar_sessoes(uuid) to service_role;

-- ── Carga inicial: ninguém perde acesso ────────────────────────────────────
insert into public.acesso_papeis (nome, descricao, acesso_total, sistema) values
  ('Administrador', 'Vê e faz tudo, inclusive gerenciar usuários e tipos de acesso.', true, true),
  ('Acesso total (legado)', 'Todas as telas e ações, menos gerenciar usuários. Quem já tinha conta antes do controle de acessos começou aqui.', false, true),
  ('Cliente da marca', 'Visão Geral e Saúde da Marca, só da marca definida na pessoa. Para franqueados e parceiros de fora.', false, false);

insert into public.acesso_papel_permissoes (papel_id, permissao)
select p.id, x.perm
from public.acesso_papeis p
cross join unnest(array[
  'aba.visao-geral','aba.saude-marca','aba.okrs','aba.sop-marketing','aba.visao-macro','aba.performance',
  'aba.analise-perda','aba.analise-objecoes','aba.campanha-metas','aba.metas',
  'acao.metas-publicar','acao.okrs-editar','acao.assistente-ia']) as x(perm)
where p.nome = 'Acesso total (legado)'
union all
select p.id, x.perm
from public.acesso_papeis p
cross join unnest(array['aba.visao-geral','aba.saude-marca']) as x(perm)
where p.nome = 'Cliente da marca';

-- Os 2 usuários da Inpot (app_metadata role=marca) viram "Cliente da marca";
-- Junior e Gabriel viram Administrador; o resto, Acesso total (legado).
insert into public.acesso_usuarios (user_id, papel_id, marca)
select au.id,
  (select id from public.acesso_papeis where nome = case
     when lower(au.email) in ('marcio.coninck@wescale.com.br', 'gabriel.limas@wescale.com.br') then 'Administrador'
     when au.raw_app_meta_data->>'role' = 'marca' and coalesce(au.raw_app_meta_data->>'marca', '') <> '' then 'Cliente da marca'
     else 'Acesso total (legado)' end),
  case when au.raw_app_meta_data->>'role' = 'marca'
        and lower(au.email) not in ('marcio.coninck@wescale.com.br', 'gabriel.limas@wescale.com.br')
       then nullif(au.raw_app_meta_data->>'marca', '') end
from auth.users au;
