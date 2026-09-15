-- Controle de acessos — pessoa pode ser limitada a VÁRIAS marcas (antes era uma só).
-- Rodar no SQL Editor do Supabase de MARKETING (jmuluoksnlqrvzbcltim), uma vez.
-- Os 2 usuários da Inpot migram de marca = 'inpot' para marcas = {inpot}.

alter table public.acesso_usuarios
  add column marcas text[] check (marcas is null or cardinality(marcas) > 0);

update public.acesso_usuarios set marcas = array[marca] where marca is not null;

create or replace function public.minhas_permissoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
        'registrado', true, 'ativo', u.ativo, 'papel', p.nome,
        'acesso_total', p.acesso_total,
        'marcas', to_jsonb(u.marcas),
        -- 'marca' (1ª da lista) só pra versão anterior do dashboard, até a nova ser publicada.
        'marca', u.marcas[1],
        'permissoes', coalesce((select jsonb_agg(pp.permissao order by pp.permissao)
                                from public.acesso_papel_permissoes pp where pp.papel_id = p.id), '[]'::jsonb))
     from public.acesso_usuarios u join public.acesso_papeis p on p.id = u.papel_id
     where u.user_id = auth.uid()),
    jsonb_build_object('registrado', false, 'ativo', false, 'papel', null,
                       'acesso_total', false, 'marcas', null, 'marca', null, 'permissoes', '[]'::jsonb));
$$;

drop function public.acesso_listar_usuarios();
create function public.acesso_listar_usuarios()
returns table (usuario_id uuid, email text, criado_em timestamptz, ultimo_login timestamptz,
               convite_pendente boolean, papel_id uuid, papel_nome text, marcas text[], ativo boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.tem_permissao('acao.usuarios-gerenciar') then
    raise exception 'sem permissão para gerenciar usuários' using errcode = '42501';
  end if;
  return query
    select au.id, au.email::text, au.created_at, au.last_sign_in_at,
           (au.last_sign_in_at is null),
           acc.papel_id, p.nome, acc.marcas, coalesce(acc.ativo, false)
    from auth.users au
    left join public.acesso_usuarios acc on acc.user_id = au.id
    left join public.acesso_papeis p on p.id = acc.papel_id
    order by lower(au.email::text);
end $$;
revoke all on function public.acesso_listar_usuarios() from public, anon, authenticated;
grant execute on function public.acesso_listar_usuarios() to authenticated;

grant update (marcas) on public.acesso_usuarios to authenticated;
alter table public.acesso_usuarios drop column marca;

update public.acesso_papeis
set descricao = 'Visão Geral e Saúde da Marca, só das marcas definidas na pessoa. Para franqueados e parceiros de fora.'
where nome = 'Cliente da marca';
