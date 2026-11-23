-- 2026-11-23 (2) — Bloqueio de Leads: ajustes da revisão independente (Supabase de Expansão)
-- Aplicado depois de docs/sql/2026-11-23-bloqueio-de-leads.sql. Testado antes em pg_temp.
--
-- 1. Negócios do lead por RPC, não por view: a vw_distribuicao_lead_negocios deixava a chave anon
--    (pública, está no JS do dashboard) baixar todos os contatos do CRM. A RPC só responde a quem
--    já sabe o e-mail exato.
-- 2. distribuicao_bloqueio_salvar recebe as marcas que a tela mostrava (p_marcas_antes) e recusa se
--    o bloqueio mudou nesse meio-tempo. Sem isso, duas pessoas salvando o mesmo e-mail com a tela
--    desatualizada (recarga de 60 s) desfaziam a mudança uma da outra sem ninguém ver, e o histórico
--    atribuía a mudança a quem nunca viu a marca marcada.

-- ## 1. Negócios do lead (RPC no lugar da view)
create or replace function public.distribuicao_lead_negocios(p_email text)
returns table (email text, id_deal text, nome_contato text, marca text, nome_funil text, nome_etapa text, status text,
               responsavel text, criado_em timestamptz, fechado_em timestamptz, deleted_at timestamptz, motivo_perda text)
language sql stable security definer set search_path = public, pg_temp as $fn$
  select
    lower(btrim(c.email)),
    c.id_deal,
    c.nome_contato,
    s.marca,
    s.nome_funil,
    s.nome_etapa,
    s.status,
    s.responsavel,
    case when s.payload->>'_created_at' ~ '^\d{4}-\d{2}-\d{2}' then (s.payload->>'_created_at')::timestamptz end,
    case when s.payload->>'_closed_at' ~ '^\d{4}-\d{2}-\d{2}' then (s.payload->>'_closed_at')::timestamptz end,
    s.deleted_at,
    (select e.motivo_perda
       from eventos_ativos.deal_eventos e
      where e.id_deal = c.id_deal and e.tipo_evento = 'perda'
      order by e.data_evento desc
      limit 1)
  from deal_contatos c
  left join deal_snapshot s on s.id_deal = c.id_deal
  where nullif(btrim(coalesce(p_email, '')), '') is not null
    and lower(btrim(c.email)) = lower(btrim(p_email))
  order by c.id_deal
  limit 200
$fn$;
revoke execute on function public.distribuicao_lead_negocios(text) from public;
grant execute on function public.distribuicao_lead_negocios(text) to anon, authenticated, service_role;

-- A view sai de uso (o conector do Supabase recusa DROP): ninguém além do dono lê mais.
-- Apagar de vez, se quiser, no SQL Editor: drop view public.vw_distribuicao_lead_negocios;
revoke select on public.vw_distribuicao_lead_negocios from anon, authenticated;

-- ## 2. Escrita com conferência do que a tela mostrava
create or replace function public.distribuicao_bloqueio_salvar(p_email text, p_marcas text[], p_motivo text, p_autor text, p_marcas_antes text[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_autor  text := nullif(btrim(coalesce(p_autor, '')), '');
  v_depois text[];
  v_visto  text[];
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
  if p_marcas_antes is null then
    raise exception 'Faltou informar as marcas que a tela mostrava.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}'::text[]) into v_depois
  from unnest(coalesce(p_marcas, '{}'::text[])) x
  where btrim(x) <> '';
  select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}'::text[]) into v_visto
  from unnest(p_marcas_antes) x
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

  if not (v_antes @> v_visto and v_visto @> v_antes) then
    raise exception 'O bloqueio deste e-mail mudou desde que você abriu a tela (agora: %). Confira e salve de novo.',
      case when cardinality(v_antes) = 0 then 'nenhuma marca' else array_to_string(v_antes, ', ') end
      using errcode = '40001';
  end if;

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
revoke execute on function public.distribuicao_bloqueio_salvar(text, text[], text, text, text[]) from public, anon, authenticated;
grant execute on function public.distribuicao_bloqueio_salvar(text, text[], text, text, text[]) to service_role;

-- A versão de 4 parâmetros (sem a conferência) sai de uso: ninguém além do dono executa.
-- Apagar de vez, se quiser, no SQL Editor: drop function public.distribuicao_bloqueio_salvar(text, text[], text, text);
revoke execute on function public.distribuicao_bloqueio_salvar(text, text[], text, text) from public, anon, authenticated, service_role;
