-- =====================================================================
-- Abas de Vendas instantâneas e ao vivo (03/11/2026)
-- Supabase de Expansão (cygxmduuwlwfbodfrlkr)
--
-- Antes: o navegador baixava `vw_funil_vendas` (8 páginas) e
-- `vw_funil_etapas_v2` (25 páginas) inteiras ao abrir a aba e de novo a cada
-- 5 min. Cada página recalculava a view inteira: ~0,9 s por página de eventos
-- com o banco ocioso, até 2,7 s com carga. Visão Macro levava ~14 s e a 1ª
-- página às vezes estourava o limite de 3 s do anon.
--
-- Agora o banco mantém as duas bases prontas (`dash_vendas`, `dash_etapas`),
-- uma linha por linha da view, com a versão em que ela mudou pela última vez.
-- `dash_sincronizar()` roda a cada minuto (pg_cron, substitui o job 19 que só
-- dava REFRESH a cada 2 min):
--   1. compara os contadores de escrita (pg_stat_user_tables) das tabelas de
--      que as views dependem e a definição das views; se nada mudou, sai em
--      milissegundos;
--   2. se mudou (ou passaram 30 min), atualiza `mv_deal_ciclo_enriquecido`;
--   3. grava em `dash_*` só as linhas que mudaram, com a versão nova; linha
--      que sumiu da view vira lápide (`removido`) por 30 dias;
--   4. avisa os navegadores pelo Realtime: canal público `dashboard-vendas`,
--      evento `versao`, payload só com o número da versão (nenhum dado).
-- O navegador guarda a base no IndexedDB, abre na hora e pede só o que mudou
-- desde a versão que tem (`dash_mudancas`).
--
-- As views continuam sendo a fonte da verdade: `dash_*` é cópia delas,
-- conferida linha a linha no fim deste arquivo. Rollback: reativar o job 19
-- (`select cron.alter_job(19, active := true)`), desagendar
-- `dash_sincronizar` e reverter o PR do front.
-- =====================================================================

-- 1. Estado da sincronização (uma linha só) -------------------------------
create table if not exists public.dash_estado (
  id                int primary key default 1 check (id = 1),
  -- Trocar a época obriga todo navegador a baixar a base inteira de novo.
  epoca             int not null default 1,
  -- Última versão publicada (sobe só quando alguma linha mudou).
  versao            bigint not null default 0,
  -- Maior versão de lápide já apagada: quem está atrás dela recarrega tudo.
  purgado_ate       bigint not null default 0,
  -- Contadores de escrita das tabelas-fonte na última sincronização.
  impressao         text,
  sincronizado_em   timestamptz,
  mudou_em          timestamptz,
  ultima_duracao_ms int,
  ultimo_resultado  jsonb,
  ultimo_erro       text,
  ultimo_erro_em    timestamptz,
  -- Falha do aviso pelo Realtime (o navegador ainda confere sozinho).
  aviso_erro        text,
  aviso_erro_em     timestamptz
);
insert into public.dash_estado (id) values (1) on conflict (id) do nothing;

-- 2. Bases prontas --------------------------------------------------------
-- `dados` é a linha da view como array, na ordem de dash_colunas(): o
-- navegador mapeia por nome (a resposta traz `cols`).
create table if not exists public.dash_vendas (
  id_lead     text not null,
  ciclo       bigint not null,
  dados       jsonb not null,
  hash        text not null,
  versao      bigint not null,
  removido    boolean not null default false,
  removido_em timestamptz,
  primary key (id_lead, ciclo)
);
create index if not exists dash_vendas_versao_idx on public.dash_vendas (versao);

create table if not exists public.dash_etapas (
  id_evento   bigint primary key,
  dados       jsonb not null,
  hash        text not null,
  versao      bigint not null,
  removido    boolean not null default false,
  removido_em timestamptz
);
create index if not exists dash_etapas_versao_idx on public.dash_etapas (versao);

-- Leitura só pelas funções abaixo (mesmo padrão de deal_eventos: RLS sem policy).
alter table public.dash_estado enable row level security;
alter table public.dash_vendas enable row level security;
alter table public.dash_etapas enable row level security;
revoke all on public.dash_estado, public.dash_vendas, public.dash_etapas from anon, authenticated;

-- 3. Colunas de cada base (ordem do array `dados`) -------------------------
-- Mesmas colunas que os hooks liam das views. `id_evento` entra em etapas
-- para o navegador saber qual linha atualizar ou remover.
create or replace function public.dash_colunas(p_base text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_base
    when 'vendas' then array[
      'id_lead', 'ciclo', 'eh_reciclagem', 'eh_ciclo_atual',
      'marca', 'nome_funil', 'etapa_funil', 'id_etapa_atual', 'status_atual',
      'nome_sdr', 'nome_closer', 'nome_negociacao',
      'fonte_macro', 'sub_fonte', 'sub_fonte_crm', 'utm_source', 'utm_medium', 'utm_campaign',
      'valor_contrato', 'quantidade_unidades', 'valor_produto', 'motivo_perda',
      'data_criacao_negociacao', 'data_criacao_original',
      'data_novo_mql', 'data_tentando_contato', 'data_contato_efetivo',
      'data_interesse_reuniao', 'data_conexao',
      'data_agendamento_reuniao_sql', 'data_reuniao_realizada', 'data_no_show',
      'data_sal', 'data_oportunidade', 'data_comite', 'data_pre_contrato',
      'data_venda', 'data_perdido', 'origem_comercial']
    when 'etapas' then array[
      'id_evento', 'id_deal', 'dia', 'etapa_canonica', 'id_etapa', 'nome_funil',
      'ciclo', 'rn_deal_etapa_mes', 'marca_deal', 'origem_comercial']
  end
$$;

-- 4. "Impressão digital" das fontes ------------------------------------------
-- Junta (a) os contadores de inserção/update/delete (pg_stat_user_tables) de
-- toda tabela de que a matview e as duas views dependem e (b) a versão da
-- definição de cada view/matview (CREATE OR REPLACE VIEW grava a regra de
-- novo, com outro xmin). As dependências são achadas pelo catálogo a cada
-- chamada: view nova que leia outra tabela entra sozinha. Os contadores só
-- sobem depois do commit, então nada se perde: no pior caso a rodada seguinte
-- refaz o trabalho. A matview fica de fora dos contadores (o próprio REFRESH
-- mexe neles).
-- Não enxerga: tabela lida dentro de função usada numa view, TRUNCATE,
-- partição e tabela estrangeira (em 03/11 a cadeia não tinha nenhum desses).
-- Para esses casos existe a rodada forçada de 30 min.
create or replace function public.dash_impressao_fontes()
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  with recursive deps(oid) as (
    select c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('mv_deal_ciclo_enriquecido', 'vw_funil_vendas', 'vw_funil_etapas_v2')
    union
    select d.refobjid
    from deps
    join pg_rewrite r on r.ev_class = deps.oid
    join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
                    and d.refclassid = 'pg_class'::regclass and d.refobjid <> deps.oid
  )
  select concat_ws('|',
    -- escrita nas tabelas
    (select string_agg(format('%s:%s:%s:%s', s.relid, s.n_tup_ins, s.n_tup_upd, s.n_tup_del), ',' order by s.relid)
       from pg_stat_user_tables s
       join pg_class c on c.oid = s.relid
      where s.relid in (select oid from deps) and c.relkind in ('r', 'p')),
    -- definição das views/matview (CREATE OR REPLACE VIEW grava a regra de novo)
    (select string_agg(format('%s:%s', r.ev_class, r.xmin), ',' order by r.ev_class)
       from pg_rewrite r
      where r.ev_class in (select oid from deps)))
$$;

-- 5. Sincronização ----------------------------------------------------------
create or replace function public.dash_sincronizar(p_forcar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
-- Datas saem em UTC no array (mesmo formato que o PostgREST devolvia).
set "TimeZone" = 'UTC'
as $fn$
declare
  v_estado      public.dash_estado%rowtype;
  v_impressao   text;
  v_versao      bigint;
  v_t0          timestamptz := clock_timestamp();
  v_t_refresh   timestamptz;
  n_vendas      bigint := 0;
  n_etapas      bigint := 0;
  v_purgado     bigint;
  v_cols_vendas text;
  v_cols_etapas text;
  v_resultado   jsonb;
begin
  -- Uma por vez (cron a cada minuto + chamada manual).
  if not pg_try_advisory_xact_lock(hashtext('public.dash_sincronizar')) then
    return jsonb_build_object('pulado', 'outra sincronização em andamento');
  end if;

  select * into v_estado from public.dash_estado where id = 1 for update;
  v_impressao := public.dash_impressao_fontes();

  if not p_forcar
     and v_estado.impressao is not distinct from v_impressao
     and v_estado.sincronizado_em > now() - interval '30 minutes' then
    return jsonb_build_object('pulado', 'sem mudança nas fontes');
  end if;

  refresh materialized view concurrently public.mv_deal_ciclo_enriquecido;
  v_t_refresh := clock_timestamp();
  v_versao := v_estado.versao + 1;

  -- Falha daqui pra baixo não desfaz o REFRESH acima (o resto do dashboard
  -- continua atualizado) e fica registrada em dash_estado.ultimo_erro.
  begin
    select string_agg(format('v.%I', c), ', ' order by o) into v_cols_vendas
    from unnest(public.dash_colunas('vendas')) with ordinality as t(c, o);
    select string_agg(format('v.%I', c), ', ' order by o) into v_cols_etapas
    from unnest(public.dash_colunas('etapas')) with ordinality as t(c, o);

    execute format($q$
      merge into public.dash_vendas t
      using (
        select v.id_lead, v.ciclo, x.dados, md5(x.dados::text) as hash
        from public.vw_funil_vendas v
        cross join lateral (select jsonb_build_array(%s) as dados) x
      ) s
      on t.id_lead = s.id_lead and t.ciclo = s.ciclo
      when matched and (t.removido or t.hash <> s.hash) then
        update set dados = s.dados, hash = s.hash, versao = $1, removido = false, removido_em = null
      when not matched by target then
        insert (id_lead, ciclo, dados, hash, versao) values (s.id_lead, s.ciclo, s.dados, s.hash, $1)
      when not matched by source and not t.removido then
        update set removido = true, removido_em = now(), versao = $1
    $q$, v_cols_vendas) using v_versao;
    get diagnostics n_vendas = row_count;

    execute format($q$
      merge into public.dash_etapas t
      using (
        select v.id_evento, x.dados, md5(x.dados::text) as hash
        from public.vw_funil_etapas_v2 v
        cross join lateral (select jsonb_build_array(%s) as dados) x
      ) s
      on t.id_evento = s.id_evento
      when matched and (t.removido or t.hash <> s.hash) then
        update set dados = s.dados, hash = s.hash, versao = $1, removido = false, removido_em = null
      when not matched by target then
        insert (id_evento, dados, hash, versao) values (s.id_evento, s.dados, s.hash, $1)
      when not matched by source and not t.removido then
        update set removido = true, removido_em = now(), versao = $1
    $q$, v_cols_etapas) using v_versao;
    get diagnostics n_etapas = row_count;

    -- Lápides ficam 30 dias. Quem está com versão anterior à maior lápide
    -- apagada recebe `reset` em dash_mudancas e baixa a base inteira.
    with a as (
      delete from public.dash_vendas
      where removido and removido_em < now() - interval '30 days'
      returning versao
    ), b as (
      delete from public.dash_etapas
      where removido and removido_em < now() - interval '30 days'
      returning versao
    )
    select max(versao) into v_purgado from (select versao from a union all select versao from b) x;
  exception when others then
    -- Grava a impressão mesmo com erro para não repetir o REFRESH a cada
    -- minuto; a rodada forçada de 30 min tenta de novo.
    update public.dash_estado
       set ultimo_erro = sqlerrm, ultimo_erro_em = now(),
           impressao = v_impressao, sincronizado_em = now(),
           ultima_duracao_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::int
     where id = 1;
    return jsonb_build_object('erro', sqlerrm);
  end;

  v_resultado := jsonb_build_object(
    'versao', case when n_vendas + n_etapas > 0 then v_versao else v_estado.versao end,
    'vendas', n_vendas,
    'etapas', n_etapas,
    'refresh_ms', (extract(epoch from v_t_refresh - v_t0) * 1000)::int,
    'total_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
    'motivo', case when p_forcar then 'forçado'
                   when v_estado.impressao is not distinct from v_impressao then '30 min sem mudança'
                   else 'fonte mudou' end);

  update public.dash_estado
     set versao = case when n_vendas + n_etapas > 0 then v_versao else versao end,
         mudou_em = case when n_vendas + n_etapas > 0 then now() else mudou_em end,
         purgado_ate = greatest(purgado_ate, coalesce(v_purgado, 0)),
         impressao = v_impressao,
         sincronizado_em = now(),
         ultima_duracao_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
         ultimo_resultado = v_resultado,
         ultimo_erro = null
   where id = 1;

  if n_vendas + n_etapas > 0 then
    -- Só o número da versão vai no aviso. O navegador também confere sozinho
    -- de tempos em tempos, então falha aqui não perde atualização.
    begin
      perform realtime.send(
        jsonb_build_object('versao', v_versao, 'epoca', v_estado.epoca),
        'versao', 'dashboard-vendas', false);
    exception when others then
      update public.dash_estado set aviso_erro = sqlerrm, aviso_erro_em = now() where id = 1;
    end;
  end if;

  return v_resultado;
end
$fn$;

-- 6. Leitura pelo navegador (chave anon) ------------------------------------
-- Uma chamada só por base, num único snapshot: versão e linhas sempre batem.
-- `sincronizado_em`/`atraso_s`/`ultimo_erro` deixam o selo da tela mostrar
-- "Atrasado" quando a sincronização para ou falha (rodada sem mudança não
-- grava `sincronizado_em`; a forçada roda a cada 30 min).
create or replace function public.dash_base(p_base text)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r json;
begin
  if p_base = 'vendas' then
    select json_build_object(
             'base', p_base, 'epoca', e.epoca, 'versao', e.versao, 'atualizado_em', e.mudou_em,
             'sincronizado_em', e.sincronizado_em,
             'atraso_s', floor(extract(epoch from now() - e.sincronizado_em))::int,
             'ultimo_erro', e.ultimo_erro,
             'cols', to_json(public.dash_colunas(p_base)),
             'linhas', coalesce((select json_agg(d.dados) from public.dash_vendas d where not d.removido), '[]'::json))
      into r
      from public.dash_estado e where e.id = 1;
  elsif p_base = 'etapas' then
    select json_build_object(
             'base', p_base, 'epoca', e.epoca, 'versao', e.versao, 'atualizado_em', e.mudou_em,
             'sincronizado_em', e.sincronizado_em,
             'atraso_s', floor(extract(epoch from now() - e.sincronizado_em))::int,
             'ultimo_erro', e.ultimo_erro,
             'cols', to_json(public.dash_colunas(p_base)),
             'linhas', coalesce((select json_agg(d.dados) from public.dash_etapas d where not d.removido), '[]'::json))
      into r
      from public.dash_estado e where e.id = 1;
  else
    raise exception 'base desconhecida: %', p_base using errcode = '22023';
  end if;
  return r;
end
$fn$;

-- Só o que mudou depois de `p_desde`. `reset: true` quando não dá para
-- garantir a conta (época trocada, lápide já apagada, versão do navegador à
-- frente do banco): o navegador baixa a base inteira.
create or replace function public.dash_mudancas(p_base text, p_desde bigint, p_epoca int)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  r json;
begin
  if p_base = 'vendas' then
    select case
             when p_desde is null or p_epoca is distinct from e.epoca
                  or p_desde < e.purgado_ate or p_desde > e.versao then
               json_build_object('base', p_base, 'epoca', e.epoca, 'versao', e.versao, 'atualizado_em', e.mudou_em,
                 'sincronizado_em', e.sincronizado_em,
                 'atraso_s', floor(extract(epoch from now() - e.sincronizado_em))::int,
                 'ultimo_erro', e.ultimo_erro, 'reset', true)
             else json_build_object(
               'base', p_base, 'epoca', e.epoca, 'versao', e.versao, 'atualizado_em', e.mudou_em,
               'sincronizado_em', e.sincronizado_em,
               'atraso_s', floor(extract(epoch from now() - e.sincronizado_em))::int,
               'ultimo_erro', e.ultimo_erro, 'reset', false,
               'cols', to_json(public.dash_colunas(p_base)),
               'linhas', coalesce((select json_agg(d.dados) from public.dash_vendas d
                                   where d.versao > p_desde and not d.removido), '[]'::json),
               'removidos', coalesce((select json_agg(json_build_array(d.id_lead, d.ciclo)) from public.dash_vendas d
                                      where d.versao > p_desde and d.removido), '[]'::json))
           end
      into r
      from public.dash_estado e where e.id = 1;
  elsif p_base = 'etapas' then
    select case
             when p_desde is null or p_epoca is distinct from e.epoca
                  or p_desde < e.purgado_ate or p_desde > e.versao then
               json_build_object('base', p_base, 'epoca', e.epoca, 'versao', e.versao, 'atualizado_em', e.mudou_em,
                 'sincronizado_em', e.sincronizado_em,
                 'atraso_s', floor(extract(epoch from now() - e.sincronizado_em))::int,
                 'ultimo_erro', e.ultimo_erro, 'reset', true)
             else json_build_object(
               'base', p_base, 'epoca', e.epoca, 'versao', e.versao, 'atualizado_em', e.mudou_em,
               'sincronizado_em', e.sincronizado_em,
               'atraso_s', floor(extract(epoch from now() - e.sincronizado_em))::int,
               'ultimo_erro', e.ultimo_erro, 'reset', false,
               'cols', to_json(public.dash_colunas(p_base)),
               'linhas', coalesce((select json_agg(d.dados) from public.dash_etapas d
                                   where d.versao > p_desde and not d.removido), '[]'::json),
               'removidos', coalesce((select json_agg(d.id_evento) from public.dash_etapas d
                                      where d.versao > p_desde and d.removido), '[]'::json))
           end
      into r
      from public.dash_estado e where e.id = 1;
  else
    raise exception 'base desconhecida: %', p_base using errcode = '22023';
  end if;
  return r;
end
$fn$;

-- Força todo navegador a baixar a base inteira (troca a época e avisa).
create or replace function public.dash_forcar_recarga()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_resultado jsonb;
  e public.dash_estado%rowtype;
begin
  update public.dash_estado set epoca = epoca + 1 where id = 1;
  v_resultado := public.dash_sincronizar(true);
  select * into e from public.dash_estado where id = 1;
  perform realtime.send(jsonb_build_object('versao', e.versao, 'epoca', e.epoca), 'versao', 'dashboard-vendas', false);
  return v_resultado || jsonb_build_object('epoca', e.epoca);
end
$fn$;

-- 7. Permissões -------------------------------------------------------------
-- Supabase concede EXECUTE a anon/authenticated em toda função nova do public:
-- as internas precisam de revoke explícito.
revoke all on function public.dash_sincronizar(boolean) from public, anon, authenticated;
revoke all on function public.dash_impressao_fontes() from public, anon, authenticated;
revoke all on function public.dash_forcar_recarga() from public, anon, authenticated;
grant execute on function public.dash_colunas(text) to anon, authenticated;
grant execute on function public.dash_base(text) to anon, authenticated;
grant execute on function public.dash_mudancas(text, bigint, int) to anon, authenticated;

-- Mudar `dash_colunas()`: na MESMA transação do `select dash_sincronizar(true)`
-- (senão, por até 1 min, os arrays velhos saem com os nomes novos). E mudar
-- `COLUNAS_*` em src/lib/aoVivo/definicoes.ts junto.

-- 8. Carga inicial (rodar uma vez) -----------------------------------------
-- select public.dash_sincronizar(true);

-- 9. Agendamento (substitui o job 19, que dava REFRESH a cada 2 min) --------
-- select cron.schedule('dash_sincronizar', '* * * * *', $$select public.dash_sincronizar()$$);
-- select cron.alter_job(19, active := false);

-- 10. Conferência: dash_* = views, linha a linha (tem que dar 0 nas duas) ---
-- select count(*) from public.vw_funil_vendas v
--   full join (select * from public.dash_vendas where not removido) d
--     on d.id_lead = v.id_lead and d.ciclo = v.ciclo
--  where d.id_lead is null or v.id_lead is null or d.dados <> jsonb_build_array(
--    v.id_lead, v.ciclo, v.eh_reciclagem, v.eh_ciclo_atual, v.marca, v.nome_funil, v.etapa_funil,
--    v.id_etapa_atual, v.status_atual, v.nome_sdr, v.nome_closer, v.nome_negociacao, v.fonte_macro,
--    v.sub_fonte, v.sub_fonte_crm, v.utm_source, v.utm_medium, v.utm_campaign, v.valor_contrato,
--    v.quantidade_unidades, v.valor_produto, v.motivo_perda, v.data_criacao_negociacao,
--    v.data_criacao_original, v.data_novo_mql, v.data_tentando_contato, v.data_contato_efetivo,
--    v.data_interesse_reuniao, v.data_conexao, v.data_agendamento_reuniao_sql, v.data_reuniao_realizada,
--    v.data_no_show, v.data_sal, v.data_oportunidade, v.data_comite, v.data_pre_contrato, v.data_venda,
--    v.data_perdido, v.origem_comercial);
