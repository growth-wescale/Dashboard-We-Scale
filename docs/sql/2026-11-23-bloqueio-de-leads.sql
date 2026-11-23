-- 2026-11-23 — Bloqueio de Leads (Supabase de Expansão, cygxmduuwlwfbodfrlkr)
-- Spec: docs/superpowers/specs/2026-11-23-bloqueio-de-leads-design.md
--
-- E-mail bloqueado para uma marca: a conversão não vira deal, não dispara COF e não conta no
-- rodízio. Fica no registro (distribuicao_atribuicao) com resultado 'bloqueado'.
-- Escrita só pela Edge Function gravar-bloqueio-lead (sessão do Marketing + aba.bloqueio-leads),
-- que chama distribuicao_bloqueio_salvar com a service_role.
-- Testado antes em pg_temp (tabelas temporárias, cópia de distribuicao_processar), sem gravar nada.

-- ## 1. Estado atual: 1 linha por e-mail. marcas vazio = desbloqueado. Nunca apagada.
create table if not exists public.distribuicao_bloqueio (email text primary key, marcas text[] not null default '{}', motivo text, criado_em timestamptz not null default now(), criado_por text not null, atualizado_em timestamptz not null default now(), atualizado_por text not null, constraint distribuicao_bloqueio_email_normalizado check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
alter table public.distribuicao_bloqueio enable row level security;
revoke all on table public.distribuicao_bloqueio from anon, authenticated;

-- ## 2. Histórico: append-only (bloqueio, alteração de marcas, desbloqueio), com quem e quando.
create table if not exists public.distribuicao_bloqueio_log (id bigint generated always as identity primary key, email text not null, acao text not null check (acao in ('bloqueio', 'alteracao', 'desbloqueio')), marcas_antes text[] not null, marcas_depois text[] not null, motivo text not null, autor text not null, em timestamptz not null default now());
create index if not exists ix_distribuicao_bloqueio_log_email on public.distribuicao_bloqueio_log (email, em desc);
alter table public.distribuicao_bloqueio_log enable row level security;
revoke all on table public.distribuicao_bloqueio_log from anon, authenticated;

create or replace function public.distribuicao_bloqueio_log_imutavel() returns trigger
language plpgsql set search_path = public, pg_temp as $fn$
begin
  raise exception 'O histórico de bloqueio de leads não pode ser alterado nem apagado.';
end $fn$;
create trigger distribuicao_bloqueio_log_imutavel before update or delete on public.distribuicao_bloqueio_log for each row execute function public.distribuicao_bloqueio_log_imutavel();
create trigger distribuicao_bloqueio_log_sem_truncate before truncate on public.distribuicao_bloqueio_log for each statement execute function public.distribuicao_bloqueio_log_imutavel();

-- ## 3. Única escrita: troca as marcas bloqueadas do e-mail e registra no histórico.
-- Ação: bloqueio (de nenhuma para alguma marca), alteracao, desbloqueio (para nenhuma).
create or replace function public.distribuicao_bloqueio_salvar(p_email text, p_marcas text[], p_motivo text, p_autor text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_autor  text := nullif(btrim(coalesce(p_autor, '')), '');
  v_depois text[];
  v_antes  text[];
  v_fora   text[];
  v_acao   text;
  v_log    bigint;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido: %', coalesce(nullif(btrim(p_email), ''), '(vazio)') using errcode = '22023';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Escreva o motivo (pelo menos 3 letras).' using errcode = '22023';
  end if;
  if v_autor is null then
    raise exception 'Autor obrigatório.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}'::text[]) into v_depois
  from unnest(coalesce(p_marcas, '{}'::text[])) x
  where btrim(x) <> '';

  select array_agg(m order by m) into v_fora
  from unnest(v_depois) m
  where not exists (select 1 from distribuicao_regra r where r.marca = m);
  if v_fora is not null then
    raise exception 'Marca desconhecida: %', array_to_string(v_fora, ', ') using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('distribuicao_bloqueio:' || v_email));
  select b.marcas into v_antes from distribuicao_bloqueio b where b.email = v_email for update;
  v_antes := coalesce(v_antes, '{}'::text[]);

  if v_antes @> v_depois and v_depois @> v_antes then
    raise exception '%', case when cardinality(v_depois) = 0 then 'Este e-mail não está bloqueado.'
                              else 'Nada mudou: o e-mail já está bloqueado exatamente nessas marcas.' end
      using errcode = '22023';
  end if;

  v_acao := case when cardinality(v_antes) = 0 then 'bloqueio'
                 when cardinality(v_depois) = 0 then 'desbloqueio'
                 else 'alteracao' end;

  insert into distribuicao_bloqueio as b (email, marcas, motivo, criado_por, atualizado_por)
  values (v_email, v_depois, v_motivo, v_autor, v_autor)
  on conflict (email) do update
    set marcas = excluded.marcas, motivo = excluded.motivo, atualizado_em = now(), atualizado_por = excluded.atualizado_por;

  insert into distribuicao_bloqueio_log (email, acao, marcas_antes, marcas_depois, motivo, autor)
  values (v_email, v_acao, v_antes, v_depois, v_motivo, v_autor)
  returning id into v_log;

  return jsonb_build_object('email', v_email, 'acao', v_acao, 'marcas', to_jsonb(v_depois), 'log_id', v_log);
end $fn$;
revoke execute on function public.distribuicao_bloqueio_salvar(text, text[], text, text) from public, anon, authenticated;
grant execute on function public.distribuicao_bloqueio_salvar(text, text[], text, text) to service_role;

-- ## 4. Consulta da distribuição: o e-mail está bloqueado para esta marca? null = não.
-- "desde"/"por" = a ação mais recente que colocou a marca na lista.
create or replace function public.distribuicao_bloqueio_vigente(p_email text, p_marca text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'desde', d.em,
    'por', d.autor,
    'motivo_registro', 'e-mail bloqueado para ' || p_marca
      || coalesce(' desde ' || to_char(d.em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '')
      || coalesce(' (por ' || d.autor || ')', ''))
  from distribuicao_bloqueio b
  left join lateral (
    select l.em, l.autor
    from distribuicao_bloqueio_log l
    where l.email = b.email and p_marca = any(l.marcas_depois) and not (p_marca = any(l.marcas_antes))
    order by l.em desc, l.id desc
    limit 1
  ) d on true
  where b.email = lower(btrim(p_email)) and p_marca = any(b.marcas)
$fn$;
revoke execute on function public.distribuicao_bloqueio_vigente(text, text) from public, anon, authenticated;
grant execute on function public.distribuicao_bloqueio_vigente(text, text) to service_role;

-- ## 5. Leitura da tela (anon, como as outras vw_distribuicao_*).
create or replace view public.vw_distribuicao_bloqueios as
select
  b.email,
  b.marcas,
  cardinality(b.marcas) > 0 as bloqueado,
  b.motivo,
  b.criado_em,
  b.criado_por,
  b.atualizado_em,
  b.atualizado_por,
  ub.em as bloqueado_desde,
  ub.autor as bloqueado_por,
  coalesce(cv.tentativas_bloqueadas, 0) as tentativas_bloqueadas,
  cv.ultima_tentativa_bloqueada,
  coalesce(cv.conversoes, 0) as conversoes,
  cv.ultima_conversao,
  coalesce(ng.negocios_crm, 0) as negocios_crm,
  coalesce(cv.nome, ng.nome) as nome
from distribuicao_bloqueio b
left join lateral (
  select l.em, l.autor
  from distribuicao_bloqueio_log l
  where l.email = b.email and l.acao = 'bloqueio'
  order by l.em desc, l.id desc
  limit 1
) ub on true
left join lateral (
  select
    (count(*) filter (where a.resultado = 'bloqueado'))::int as tentativas_bloqueadas,
    max(a.recebido_em) filter (where a.resultado = 'bloqueado') as ultima_tentativa_bloqueada,
    count(*)::int as conversoes,
    max(a.recebido_em) as ultima_conversao,
    (array_agg(a.lead_nome order by a.recebido_em desc) filter (where nullif(btrim(a.lead_nome), '') is not null))[1] as nome
  from distribuicao_atribuicao a
  where a.lead_email = b.email
) cv on true
left join lateral (
  select count(*)::int as negocios_crm, max(c.nome_contato) as nome
  from deal_contatos c
  where lower(btrim(c.email)) = b.email
) ng on true;

create or replace view public.vw_distribuicao_bloqueio_log as
select l.id, l.email, l.acao, l.marcas_antes, l.marcas_depois, l.motivo, l.autor, l.em
from distribuicao_bloqueio_log l;

-- Negócios do e-mail no RD CRM (espelho), com o último motivo de perda (eventos ativos).
create or replace view public.vw_distribuicao_lead_negocios as
select
  lower(btrim(c.email)) as email,
  c.id_deal,
  c.nome_contato,
  s.marca,
  s.nome_funil,
  s.nome_etapa,
  s.status,
  s.responsavel,
  case when s.payload->>'_created_at' ~ '^\d{4}-\d{2}-\d{2}' then (s.payload->>'_created_at')::timestamptz end as criado_em,
  case when s.payload->>'_closed_at' ~ '^\d{4}-\d{2}-\d{2}' then (s.payload->>'_closed_at')::timestamptz end as fechado_em,
  s.deleted_at,
  (select e.motivo_perda
     from eventos_ativos.deal_eventos e
    where e.id_deal = c.id_deal and e.tipo_evento = 'perda'
    order by e.data_evento desc
    limit 1) as motivo_perda
from deal_contatos c
left join deal_snapshot s on s.id_deal = c.id_deal
where nullif(btrim(c.email), '') is not null;

grant select on public.vw_distribuicao_bloqueios, public.vw_distribuicao_bloqueio_log, public.vw_distribuicao_lead_negocios to anon, authenticated;

-- ## 6. Resultado novo no registro de conversões.
alter table public.distribuicao_atribuicao drop constraint distribuicao_atribuicao_resultado_check;
alter table public.distribuicao_atribuicao add constraint distribuicao_atribuicao_resultado_check check (resultado = any (array['atribuido', 'barrado', 'duplicado', 'simulado', 'fallback', 'erro', 'bloqueado']));

-- ## 7. distribuicao_processar: checagem logo depois de achar a regra (e o e-mail), antes da trava
-- de reenvio; a trava de reenvio passa a ignorar conversões bloqueadas (desbloqueou e converteu de
-- novo em < 10 min = segue o fluxo). Patch por trechos sobre a definição viva (md5 conferido), pra
-- não reescrever o resto da função à mão.
do $do$
declare
  v_def  text := pg_get_functiondef('public.distribuicao_processar(jsonb, timestamptz)'::regprocedure);
  v_novo text;
begin
  if md5(v_def) <> '8450dba3c1e2847be0784cd1f52b1a2b' then
    raise exception 'distribuicao_processar mudou desde o teste (md5 %): revisar o patch', md5(v_def);
  end if;

  v_novo := replace(v_def, $a$
begin
  if v_evento is null then$a$, $b$
  v_bloqueio   jsonb;
begin
  if v_evento is null then$b$);

  v_novo := replace(v_novo, $a$'sem e-mail no payload', 'marca', v_regra.marca);
  end if;
$a$, $b$'sem e-mail no payload', 'marca', v_regra.marca);
  end if;

  -- Bloqueio de Leads (23/11/2026): e-mail bloqueado para esta marca não vira deal, não dispara
  -- COF e não conta no rodízio. Fica no registro como 'bloqueado'.
  v_bloqueio := public.distribuicao_bloqueio_vigente(v_email, v_regra.marca);
  if v_bloqueio is not null then
    insert into public.distribuicao_atribuicao (recebido_em, marca, evento_identificador, regra_id, lead_email, lead_uuid, lead_nome, payload, resultado, motivo)
    values (p_recebido_em, v_regra.marca, v_evento, v_regra.id, v_email, v_contact->>'uuid', v_contact->>'name', p_payload,
            'bloqueado', v_bloqueio->>'motivo_registro')
    returning id into v_id;
    return jsonb_build_object('atribuicao_id', v_id, 'resultado', 'bloqueado', 'motivo', v_bloqueio->>'motivo_registro',
                              'marca', v_regra.marca, 'regra_id', v_regra.id, 'modo', v_regra.modo);
  end if;
$b$);

  v_novo := replace(v_novo, $a$      and a.resultado <> 'duplicado'
$a$, $b$      and a.resultado not in ('duplicado', 'bloqueado')
$b$);

  if position('v_bloqueio   jsonb;' in v_novo) = 0
     or position('public.distribuicao_bloqueio_vigente(v_email, v_regra.marca)' in v_novo) = 0
     or position($x$a.resultado not in ('duplicado', 'bloqueado')$x$ in v_novo) = 0 then
    raise exception 'patch de distribuicao_processar não aplicou';
  end if;

  execute v_novo;
end $do$;
