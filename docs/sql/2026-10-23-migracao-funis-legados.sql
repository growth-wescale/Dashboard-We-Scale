-- Migração dos funis de marca para SDR/Closer (23–25/10/2026) — SQL aplicado no Supabase de Expansão (cygxmduuwlwfbodfrlkr)
-- Gerado a partir do banco em 2026-10-24 23:06 (definições vivas). Desenho: docs/superpowers/specs/2026-10-21-migracao-funis-legados-design.md
-- Plano: docs/superpowers/plans/2026-10-23-migracao-funis-legados.md. Histórico narrativo: CLAUDE.md, entradas de 24/10/2026.

-- ============ 1. Tabelas de apoio (DDL reconstruído das colunas) ============
create table if not exists public.dashboard_deal_oculto (
  id_deal text not null,
  lote text not null,
  funil_origem text,
  motivo text,
  ocultado_em timestamp with time zone default now() not null,
  liberado_em timestamp with time zone
);
alter table public.dashboard_deal_oculto enable row level security;

create table if not exists public._migracao_funis_plano (
  id bigint default nextval('_migracao_funis_plano_id_seq'::regclass) not null,
  id_deal text not null,
  onda text not null,
  funil_origem text,
  id_etapa_origem text,
  nome_etapa_origem text,
  status_origem text,
  id_etapa_destino text,
  campos jsonb,
  closed_at_antes timestamp with time zone,
  win_antes boolean,
  perdido_em timestamp with time zone,
  aplicado_em timestamp with time zone,
  http integer,
  resultado text,
  exclusao_em timestamp with time zone,
  historico_novo jsonb,
  criado_em timestamp with time zone default now()
);
alter table public._migracao_funis_plano enable row level security;

create table if not exists public._migracao_funis_checksum (
  rotulo text not null,
  bateria text not null,
  chave text not null,
  valor numeric,
  criado_em timestamp with time zone default now() not null
);
alter table public._migracao_funis_checksum enable row level security;

create table if not exists public._migracao_funis_disparo (
  onda text not null,
  acao text not null,
  ultimo_req bigint,
  disparado_em timestamp with time zone,
  disparos integer default 0 not null
);
alter table public._migracao_funis_disparo enable row level security;

create table if not exists public._migracao_funis_disparo_log (
  id bigint default nextval('_migracao_funis_disparo_log_id_seq'::regclass) not null,
  em timestamp with time zone default now() not null,
  onda text,
  acao text,
  resultado text
);
alter table public._migracao_funis_disparo_log enable row level security;

create table if not exists public._migracao_funis_backup_cadencia_20261023 (
  tabela text not null,
  id bigint not null,
  linha jsonb not null,
  salvo_em timestamp with time zone default now() not null
);
alter table public._migracao_funis_backup_cadencia_20261023 enable row level security;

create table if not exists public._migracao_funis_backup_viewdefs_20261024 (
  nome text not null,
  definicao text not null,
  salvo_em timestamp with time zone default now() not null
);
alter table public._migracao_funis_backup_viewdefs_20261024 enable row level security;

-- Backups de dados: _migracao_funis_backup_snapshot_20261023 (deal_snapshot dos ids do plano), _migracao_funis_backup_eventos_20261023 (deal_eventos dos mesmos ids + 2 passagens removidas), _migracao_funis_backup_viewdefs_20261023 (5 definições pré-ocultação).

-- ============ 2. Funções ============
CREATE OR REPLACE FUNCTION public.migracao_funis_etapa_destino(p_id_etapa text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case
    when f.stage_nome in ('Novos Leads') then '69380917e00ed10014daaa64'
    when f.stage_nome ilike 'Tentando contato%' then '69380917e00ed10014daaa65'
    when f.stage_nome = 'Contato Efetivo' then '69380917e00ed10014daaa66'
    when f.stage_nome = 'Interesse Reunião' then '6a29ca1adb44a7001fd4893c'
    when f.stage_nome = 'Conexão' then '6a3036b47638b0001eedc614'
    when f.stage_nome = 'No Show' then '6938240e1ae9c10015956c34'
    when f.stage_nome in ('Reunião Agendada SQL','Reunião Agendada') then '69b1badfe1def700137f1b89'
    when f.stage_nome in ('Diagnóstico','Diagnostico') then '69380937219fc3001702b9b7'
    when f.stage_nome = 'Negociação SAL' then '69380937219fc3001702b9b8'
    when f.stage_nome in ('Oportunidade COF','Oportunidade') then '69380937219fc3001702b9b9'
    when f.stage_nome = 'Comitê' then '69380937219fc3001702b9ba'
    when f.stage_nome in ('Pré-Contrato enviado','Pre-Contrato enviado','Documentação') then '69380937219fc3001702b9bb'
  end from rd_funis_etapas f where f.stage_id = p_id_etapa limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.migracao_funis_checksum(p_rotulo text, p_ref date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer; v_ontem date := p_ref - 1; v_mtd_ini date := date_trunc('month', p_ref - 1)::date;
begin
  delete from _migracao_funis_checksum where rotulo = p_rotulo;
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  select p_rotulo,'vfv_total',k,v from (
    select 'linhas'::text k, count(*)::numeric v from vw_funil_vendas
    union all select 'ciclo_atual', count(*) filter (where eh_ciclo_atual) from vw_funil_vendas
    union all select 'ganhos', count(*) filter (where status_atual='Ganho') from vw_funil_vendas
    union all select 'receita', coalesce(sum(valor_contrato) filter (where status_atual='Ganho'),0) from vw_funil_vendas
    union all select 'perdidos', count(*) filter (where status_atual='Perdido') from vw_funil_vendas
    union all select 'em_andamento', count(*) filter (where status_atual='Em andamento') from vw_funil_vendas) x;
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  select p_rotulo,'vfv_marca', coalesce(marca,'?')||'|'||coalesce(status_atual,'?')||'|'||origem_comercial||'|'||k, v from (
    select marca, status_atual, origem_comercial, 'n' k, count(*)::numeric v from vw_funil_vendas group by 1,2,3
    union all select marca, status_atual, origem_comercial, 'receita', coalesce(sum(valor_contrato),0) from vw_funil_vendas group by 1,2,3
    union all select marca, status_atual, origem_comercial, 'unidades', coalesce(sum(quantidade_unidades),0) from vw_funil_vendas group by 1,2,3
    union all select marca, status_atual, origem_comercial, 'sdr '||coalesce(nome_sdr,'-'), count(*) from vw_funil_vendas group by 1,2,3,4
    union all select marca, status_atual, origem_comercial, 'closer '||coalesce(nome_closer,'-'), count(*) from vw_funil_vendas group by 1,2,3,4
    union all select marca, status_atual, origem_comercial, 'fonte '||coalesce(fonte_macro,'-'), count(*) from vw_funil_vendas group by 1,2,3,4
    union all select marca, status_atual, origem_comercial, 'perda '||to_char(data_perdido at time zone 'America/Sao_Paulo','YYYY-MM')||' '||coalesce(motivo_perda,'-'), count(*) from vw_funil_vendas where data_perdido is not null group by 1,2,3,4
    union all select marca, status_atual, origem_comercial, 'venda '||to_char(data_venda at time zone 'America/Sao_Paulo','YYYY-MM'), count(*) from vw_funil_vendas where data_venda is not null group by 1,2,3,4) x;
  -- eventos com o MESMO recorte do front (noEscopoDoCiclo): só (deal, ciclo) presentes em vw_funil_vendas
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  select p_rotulo,'etapas_passagens', to_char(e.mes,'YYYY-MM')||'|'||e.etapa_canonica||'|'||coalesce(e.id_etapa,'?')||'|'||coalesce(e.marca_deal,'?')||'|'||e.origem_comercial, count(*)
  from vw_funil_etapas_v2 e join vw_funil_vendas f on f.id_lead = e.id_deal and f.ciclo = e.ciclo where e.mes >= date '2025-09-01' group by 1,2,3;
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  select p_rotulo,'etapas_unicos', to_char(e.mes,'YYYY-MM')||'|'||e.etapa_canonica||'|'||coalesce(e.id_etapa,'?')||'|'||coalesce(e.marca_deal,'?')||'|'||e.origem_comercial, count(distinct e.id_deal||':'||coalesce(e.ciclo::text,''))
  from vw_funil_etapas_v2 e join vw_funil_vendas f on f.id_lead = e.id_deal and f.ciclo = e.ciclo where e.mes >= date '2025-09-01' group by 1,2,3;
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  select p_rotulo,'atual', coalesce(etapa_funil,'?')||'|'||coalesce(id_etapa_atual,'?')||'|'||coalesce(marca,'?')||'|'||origem_comercial, count(*)
  from vw_funil_vendas where eh_ciclo_atual and status_atual='Em andamento' group by 1,2,3;
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  values (p_rotulo,'relatorio','ontem '||v_ontem||' md5='||md5(relatorio_expansao_metricas(v_ontem, v_ontem)::text), length(relatorio_expansao_metricas(v_ontem, v_ontem)::text)),
         (p_rotulo,'relatorio','mtd '||v_mtd_ini||'..'||v_ontem||' md5='||md5(relatorio_expansao_metricas(v_mtd_ini, v_ontem)::text), length(relatorio_expansao_metricas(v_mtd_ini, v_ontem)::text)),
         (p_rotulo,'relatorio','sdr_marcas '||v_ontem||' md5='||md5(relatorio_sdr_marcas(v_ontem)::text), length(relatorio_sdr_marcas(v_ontem)::text));
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  select p_rotulo,'reunioes', to_char(call_timestamp at time zone 'America/Sao_Paulo','YYYY-MM')||'|'||coalesce(deal_no_funil::text,'?')||'|'||coalesce(marca,'?'), count(*) from vw_closer_reunioes group by 1,2,3;
  insert into _migracao_funis_checksum(rotulo,bateria,chave,valor)
  select p_rotulo,'marketing',k,v from (
    select 'linhas'::text k, count(*)::numeric v from vw_marketing_funil where funil in ('SDR','Closer','Prospecção Ativa','Odonto Scale')
    union all select 'mql '||to_char(data_mql at time zone 'America/Sao_Paulo','YYYY-MM')||'|'||marca, count(*) from vw_marketing_funil where funil in ('SDR','Closer','Prospecção Ativa','Odonto Scale') and data_mql is not null group by 1
    union all select 'ganho '||to_char(data_venda at time zone 'America/Sao_Paulo','YYYY-MM')||'|'||marca, count(*) from vw_marketing_funil where funil in ('SDR','Closer','Prospecção Ativa','Odonto Scale') and status_atual='Ganho' and data_venda is not null group by 1
    union all select 'receita '||to_char(data_venda at time zone 'America/Sao_Paulo','YYYY-MM')||'|'||marca, coalesce(sum(valor_contrato),0) from vw_marketing_funil where funil in ('SDR','Closer','Prospecção Ativa','Odonto Scale') and status_atual='Ganho' and data_venda is not null group by 1) x;
  select count(*) into v_n from _migracao_funis_checksum where rotulo = p_rotulo;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.migracao_funis_diff(p_a text, p_b text)
 RETURNS TABLE(bateria text, chave text, valor_a numeric, valor_b numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(a.bateria,b.bateria), coalesce(a.chave,b.chave), a.valor, b.valor
  from (select * from _migracao_funis_checksum where rotulo = p_a) a
  full outer join (select * from _migracao_funis_checksum where rotulo = p_b) b on a.bateria=b.bateria and a.chave=b.chave
  where a.valor is distinct from b.valor
  order by 1,2;
$function$
;

CREATE OR REPLACE FUNCTION public.invocar_migrar_funis(p_acao text, p_onda text DEFAULT NULL::text, p_max integer DEFAULT 40)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_key text := public.get_secret('service_role_key'); v_req bigint;
begin
  select net.http_post(
    url := 'https://cygxmduuwlwfbodfrlkr.supabase.co/functions/v1/migrar-funis?acao=' || p_acao || coalesce('&onda=' || p_onda, '') || '&max=' || p_max,
    headers := jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 150000) into v_req;
  return v_req;
end $function$
;

CREATE OR REPLACE FUNCTION public.migracao_funis_proximo_lote(p_acao text, p_onda text, p_max integer, p_job text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pend int; v_d public._migracao_funis_disparo%rowtype; v_req bigint; v_res text; v_park int := 0;
begin
  if p_acao = 'mover' then
    -- Falha definitiva (4xx que não é limite de taxa) sai da fila: senão a Edge Function repete os mesmos
    -- deals em todo lote (seleciona aplicado_em is null por id) e a onda nunca zera.
    update public._migracao_funis_plano set onda = p_onda || '_falha'
     where onda = p_onda and aplicado_em is null and http is not null and http between 400 and 499 and http <> 429 and resultado like 'PUT 4%';
    get diagnostics v_park = row_count;
  end if;
  if p_acao = 'perder' then
    select count(*) into v_pend from public._migracao_funis_plano where onda = p_onda and status_origem = 'open' and perdido_em is null;
  else
    select count(*) into v_pend from public._migracao_funis_plano where onda = p_onda and aplicado_em is null
      and (p_onda <> 'onda2' or status_origem <> 'open' or perdido_em is not null);
  end if;
  if v_pend = 0 then
    perform cron.unschedule(p_job);
    v_res := 'fim: 0 pendentes, job ' || p_job || ' removido';
  elsif exists (select 1 from net.http_request_queue where url like '%migrar-funis%') then
    v_res := 'na fila do pg_net';
  else
    select * into v_d from public._migracao_funis_disparo where onda = p_onda;
    if v_d.ultimo_req is not null and v_d.acao = p_acao
       and not exists (select 1 from net._http_response where id = v_d.ultimo_req)
       and v_d.disparado_em > now() - interval '6 minutes' then
      v_res := 'em voo req ' || v_d.ultimo_req;
    elsif exists (select 1 from public._migracao_funis_plano where onda = p_onda
                  and greatest(coalesce(aplicado_em, '-infinity'), coalesce(perdido_em, '-infinity')) > now() - interval '25 seconds') then
      v_res := 'ainda aplicando';
    else
      v_req := public.invocar_migrar_funis(p_acao, p_onda, p_max);
      insert into public._migracao_funis_disparo (onda, acao, ultimo_req, disparado_em, disparos) values (p_onda, p_acao, v_req, now(), 1)
      on conflict (onda) do update set acao = excluded.acao, ultimo_req = excluded.ultimo_req, disparado_em = now(), disparos = public._migracao_funis_disparo.disparos + 1;
      v_res := 'disparado req ' || v_req || ' (' || v_pend || ' pendentes antes)';
    end if;
  end if;
  if v_park > 0 then v_res := v_res || '; ' || v_park || ' falha(s) 4xx movida(s) para ' || p_onda || '_falha'; end if;
  insert into public._migracao_funis_disparo_log (onda, acao, resultado) values (p_onda, p_acao, v_res);
  return v_res;
end $function$
;

-- ============ 3. Views com a lista de ocultação / funil de origem ============
create or replace view public.vw_funil_vendas as
 SELECT d.id_lead,
    d.ciclo,
    d.eh_reciclagem,
    d.eh_ciclo_atual,
    COALESCE(NULLIF(s.marca, ''::text), NULLIF(d.marca, ''::text),
        CASE
            WHEN s.id_funil = '68b84341646c55001ed64e4f'::text THEN 'Odonto Legacy'::text
            ELSE NULL::text
        END) AS marca,
    d.nome_funil,
    d.etapa_funil,
    d.status_atual,
    d.nome_sdr,
    d.nome_closer,
    d.fonte_macro,
    d.sub_fonte,
    d.utm_source,
    d.utm_medium,
    d.utm_campaign,
    d.valor_contrato,
    d.quantidade_unidades,
    d.motivo_perda,
    d.data_criacao_negociacao,
    d.data_criacao_original,
    d.data_novo_mql,
    d.data_tentando_contato,
    d.data_contato_efetivo,
    d.data_interesse_reuniao,
    d.data_conexao,
    d.data_agendamento_reuniao_sql,
    d.data_reuniao_realizada,
    d.data_no_show,
    d.data_sal,
    d.data_oportunidade,
    d.data_comite,
    d.data_pre_contrato,
        CASE
            WHEN d.data_venda IS NULL AND d.status_atual = 'Ganho'::text AND d.eh_ciclo_atual AND NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone > d.data_criacao_negociacao THEN NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone
            ELSE d.data_venda
        END AS data_venda,
        CASE
            WHEN d.data_perdido IS NULL AND d.status_atual = 'Perdido'::text AND d.eh_ciclo_atual AND NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone > d.data_criacao_negociacao THEN NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone
            ELSE d.data_perdido
        END AS data_perdido,
    d.nome_negociacao,
    COALESCE(o.origem_comercial, 'Inbound'::text) AS origem_comercial,
    NULLIF(btrim(s.payload ->> 'Sub-Fonte'::text), ''::text) AS sub_fonte_crm,
    s.id_etapa AS id_etapa_atual,
    COALESCE(NULLIF(NULLIF(regexp_replace(COALESCE(s.payload ->> '_valor_contrato'::text, ''::text), '[^0-9.]'::text, ''::text, 'g'::text), ''::text)::numeric, 0::numeric), d.valor_contrato) AS valor_produto
   FROM vw_deal_ciclo_enriquecido d
     LEFT JOIN vw_deal_origem_comercial o ON o.id_deal = d.id_lead
     LEFT JOIN deal_snapshot s ON s.id_deal = d.id_lead
  WHERE ((d.nome_funil = ANY (ARRAY['SDR'::text, 'Closer'::text, 'Prospecção Ativa'::text, 'Odonto Scale'::text, 'Odonto Legacy'::text])) OR d.id_funil = '6a99b60d62f84e00234789da'::text) AND (d.marca IS NOT NULL AND d.marca <> ''::text OR s.id_funil = '68b84341646c55001ed64e4f'::text) AND d.status_atual IS DISTINCT FROM 'Excluído'::text AND s.deleted_at IS NULL AND (d.nome_negociacao IS NULL OR lower(d.nome_negociacao) !~~ '%test%'::text) AND NOT (EXISTS ( SELECT 1
           FROM dashboard_deal_oculto oc
          WHERE oc.id_deal = d.id_lead AND oc.liberado_em IS NULL));

create or replace view public.vw_funil_etapas_v2 as
 SELECT v.id_evento,
    v.id_deal,
    v.tipo_evento,
    v.id_funil,
    v.nome_funil,
    v.id_etapa,
    v.nome_etapa,
    v.nome_etapa_anterior,
    v.etapa_canonica,
    v.ordem_funil,
    v.camada,
    v.etapa_canonica_anterior,
    v.ordem_funil_anterior,
    v.marca,
    v.responsavel_bruto,
    v.responsavel,
    v.papel_responsavel,
    v.fonte_atribuicao,
    v.atribuicao_confiavel,
    v.motivo_perda,
    v.anotacao_perda,
    v.tem_anotacao_perda,
    v.valor_anterior,
    v.valor_novo,
    v.data_evento,
    v.dia,
    v.mes,
    v.origem,
    v.ciclo,
    v.nome_contato,
    v.email,
    v.telefone,
    row_number() OVER (PARTITION BY v.id_deal, v.etapa_canonica, v.mes ORDER BY v.data_evento, v.ordem_funil, v.id_evento) AS rn_deal_etapa_mes,
    row_number() OVER (PARTITION BY v.id_deal, v.etapa_canonica, v.nome_funil, v.mes ORDER BY v.data_evento, v.ordem_funil, v.id_evento) AS rn_deal_etapa_funil_mes,
    row_number() OVER (PARTITION BY v.id_deal, v.etapa_canonica, v.ciclo ORDER BY v.data_evento, v.ordem_funil, v.id_evento) AS rn_deal_etapa_ciclo,
    row_number() OVER (PARTITION BY v.id_deal ORDER BY v.data_evento, v.ordem_funil, v.id_evento) AS seq_no_deal,
    COALESCE(o.origem_comercial, 'Inbound'::text) AS origem_comercial,
    COALESCE(NULLIF(ds.marca, ''::text),
        CASE
            WHEN ds.id_funil = '68b84341646c55001ed64e4f'::text THEN 'Odonto Legacy'::text
            ELSE NULL::text
        END) AS marca_deal
   FROM vw_deal_eventos_ciclo v
     LEFT JOIN vw_deal_origem_comercial o ON o.id_deal = v.id_deal
     LEFT JOIN deal_snapshot ds ON ds.id_deal = v.id_deal
  WHERE v.tipo_evento = 'mudanca_etapa'::text AND v.etapa_canonica IS NOT NULL AND ds.deleted_at IS NULL AND NOT (EXISTS ( SELECT 1
           FROM dashboard_deal_oculto oc
          WHERE oc.id_deal = v.id_deal AND oc.liberado_em IS NULL));

create or replace view public.vw_marketing_funil as
 SELECT d.id_lead,
    COALESCE(NULLIF(d.marca, ''::text), 'Sem marca'::text) AS marca,
    d.data_criacao_negociacao,
    d.data_novo_mql AS data_mql,
    d.data_tentando_contato,
    d.data_contato_efetivo,
    d.data_agendamento_reuniao_sql AS data_sql,
    d.data_reuniao_realizada AS data_diagnostico,
    d.data_sal,
    d.data_oportunidade,
    d.data_venda,
    d.data_perdido,
    d.data_no_show,
    d.status_atual,
    d.motivo_perda,
    d.valor_contrato,
    d.quantidade_unidades,
    d.fonte,
    d.fonte_macro,
    d.sub_fonte,
    d.utm_source,
    d.utm_medium,
    d.utm_campaign,
    d.utm_term,
    d.utm_content,
    COALESCE(mp.funil_origem, d.funil::text)::character varying AS funil,
    d.etapa_funil::character varying AS etapa_funil,
    d.ciclo,
    d.eh_reciclagem,
    COALESCE(o.origem_comercial, 'Inbound'::text) AS origem_comercial
   FROM vw_deal_ciclo_enriquecido d
     LEFT JOIN vw_deal_origem_comercial o ON o.id_deal = d.id_lead
     LEFT JOIN _migracao_funis_plano mp ON mp.id_deal = d.id_lead AND mp.aplicado_em IS NOT NULL
  WHERE (d.nome_negociacao IS NULL OR lower(d.nome_negociacao) !~~ '%test%'::text) AND d.status_atual IS DISTINCT FROM 'Excluído'::text AND NOT (EXISTS ( SELECT 1
           FROM dashboard_deal_oculto oc
          WHERE oc.id_deal = d.id_lead AND oc.liberado_em IS NULL));

-- ============ 4. Relatório diário (ligações de deal migrado antes da migração ficam fora) ============
CREATE OR REPLACE FUNCTION public.relatorio_expansao_metricas(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH par AS (
  SELECT p_inicio AS d1, p_fim AS d2, (p_fim - p_inicio + 1) AS dias,
         date_trunc('month', p_inicio)::date AS mtd_ini,
         p_fim AS mtd_fim
),
-- ==================== ESCOPO ====================
-- Funis que entram no relatorio. "Prospeccao Ativa" fica de fora de proposito
-- (decisao do Junior, 21/08/2026): e outra operacao, nao o inbound do dia.
cfg AS (
  SELECT ARRAY['SDR','Closer','Odonto Scale']::text[] AS funis,
         -- "Reuniao Agendada SQL" existe no SDR e no Closer: o handoff
         -- SDR->Closer gera dois eventos para a MESMA reuniao, e vale o do
         -- Closer. O funil Odonto Scale e fechado (MQL->venda no mesmo funil),
         -- nao tem handoff, entao a etapa de agendamento dele tambem vale.
         ARRAY['69b1badfe1def700137f1b89',  -- Reuniao Agendada SQL (Closer)
               '68b84341646c55001ed64e53'   -- Reuniao Agendada (Odonto Scale)
              ]::text[] AS etapas_agendamento
),
funis_ok     AS (SELECT unnest(funis) AS nome_funil FROM cfg),
etapas_ag_ok AS (SELECT unnest(etapas_agendamento) AS id_etapa FROM cfg),
bd_periodo AS (
  SELECT count(*) AS n FROM generate_series((SELECT d1 FROM par),(SELECT d2 FROM par),interval '1 day') d
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
),
bd_mes AS (
  SELECT count(*) AS n FROM generate_series(
    date_trunc('month',(SELECT d1 FROM par))::date,
    (date_trunc('month',(SELECT d1 FROM par))+interval '1 month'-interval '1 day')::date, interval '1 day') d
  WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
),
-- Ancorada em SDR/Closer de proposito: so serve para filtrar metas, e a marca
-- "Odonto Scale" ja entra por aqui. Ampliar para o funil da marca traria
-- marcas sem meta (ex.: Premium Club) para dentro da soma de metas_geral.
marcas_validas AS (
  SELECT DISTINCT NULLIF(TRIM(marca),'') AS marca FROM deal_snapshot WHERE nome_funil IN ('SDR','Closer')
),
-- ==================== FILTRO "TESTE" (igual dashboard: nome do contato) ====================
deals_teste AS (
  SELECT DISTINCT id_deal FROM deal_contatos
  WHERE COALESCE(nome_contato,'') ILIKE '%teste%'
  UNION SELECT id_deal FROM dashboard_deal_oculto WHERE liberado_em IS NULL
),

-- ==================== LIGACOES ====================
lig AS (
  SELECT NULLIF(TRIM(s.marca),'') AS marca,
         (t.done_date AT TIME ZONE 'America/Sao_Paulo')::date AS dia
  FROM db_tarefas_sdr t
  JOIN deal_snapshot s ON s.id_deal = t.deal_id
  WHERE t.type='call' AND t.done IS TRUE
    AND s.nome_funil IN (SELECT nome_funil FROM funis_ok)
    AND t.deal_id NOT IN (SELECT id_deal FROM deals_teste)
    -- Migração dos funis de marca (24/10/2026): ligações dos deals do funil Odonto Legacy feitas ANTES da
    -- migração ficam fora, como estavam (o filtro é por nome do funil e o Legacy estava fora desde 21/09);
    -- dali em diante contam normalmente, igual às passagens de etapa. Zero mudança retroativa no MTD.
    AND NOT (t.done_date < '2026-10-24T04:30:00Z' AND t.deal_id IN (SELECT id_deal FROM _migracao_funis_plano WHERE onda LIKE 'onda1%' AND aplicado_em IS NOT NULL))
    AND (t.done_date AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN (SELECT mtd_ini FROM par) AND (SELECT mtd_fim FROM par)
),
lig_dia_geral AS (SELECT count(*) AS n FROM lig WHERE dia BETWEEN (SELECT d1 FROM par) AND (SELECT d2 FROM par)),
lig_mtd_geral AS (SELECT count(*) AS n FROM lig),
lig_dia_marca AS (
  SELECT marca, count(*) AS n FROM lig
  WHERE dia BETWEEN (SELECT d1 FROM par) AND (SELECT d2 FROM par) AND marca IS NOT NULL GROUP BY marca
),
lig_mtd_marca AS (
  SELECT marca, count(*) AS n FROM lig WHERE marca IS NOT NULL GROUP BY marca
),

-- ==================== PARTE 1: DIA ====================
-- Passagens do periodo, NAO "primeira passagem da vida do deal".
-- Duas passagens pela mesma etapa no MESMO dia sao erro de operacao no CRM e
-- contam uma vez so — e o que o DISTINCT (id_deal, ind, dia) resolve.
dia_pass AS (
  SELECT DISTINCT
    e.id_deal,
    CASE ec.etapa_canonica
      WHEN 'Reunião Agendada SQL' THEN 'ag'
      WHEN 'Diagnóstico'          THEN 'diag'
      WHEN 'Negociação SAL'       THEN 'sal'
    END AS ind,
    (e.data_evento AT TIME ZONE 'America/Sao_Paulo')::date AS dia
  FROM deal_eventos e
  JOIN etapa_canonica ec ON ec.nome_etapa_raw = e.nome_etapa
  WHERE e.tipo_evento='mudanca_etapa'
    AND e.nome_funil IN (SELECT nome_funil FROM funis_ok)
    AND e.id_deal NOT IN (SELECT id_deal FROM deals_teste)
    AND ec.etapa_canonica IN ('Reunião Agendada SQL','Diagnóstico','Negociação SAL')
    AND (ec.etapa_canonica <> 'Reunião Agendada SQL'
         OR e.id_etapa IN (SELECT id_etapa FROM etapas_ag_ok))
    AND (e.data_evento AT TIME ZONE 'America/Sao_Paulo')::date
        BETWEEN (SELECT d1 FROM par) AND (SELECT d2 FROM par)
),
dia_j AS (
  SELECT NULLIF(TRIM(s.marca),'') AS marca, p.ind
  FROM dia_pass p
  LEFT JOIN deal_snapshot s ON s.id_deal = p.id_deal
),
dia_geral AS (
  SELECT count(*) FILTER (WHERE ind='ag') AS agendamentos,
         count(*) FILTER (WHERE ind='diag') AS diagnosticos,
         count(*) FILTER (WHERE ind='sal') AS sal
  FROM dia_j
),
dia_marca AS (
  SELECT marca, count(*) FILTER (WHERE ind='ag') AS agendamentos,
         count(*) FILTER (WHERE ind='diag') AS diagnosticos,
         count(*) FILTER (WHERE ind='sal') AS sal
  FROM dia_j WHERE marca IS NOT NULL GROUP BY marca
),
metas_sdr AS (
  SELECT mp.marca,
    SUM(mp.meta_agendamento) AS meta_ag_mes
  FROM "DB_Metas_Performance" mp
  WHERE mp.funcao='SDR' AND mp.mes_referencia=date_trunc('month',(SELECT d1 FROM par))::date
    AND mp.marca IN (SELECT marca FROM marcas_validas)
  GROUP BY mp.marca
),
metas_closer AS (
  SELECT mp.marca,
    SUM(mp.meta_reuniao_realizada) AS meta_diag_mes,
    SUM(NULLIF(mp.meta_volume_sal,'')::numeric) AS meta_sal_mes
  FROM "DB_Metas_Performance" mp
  WHERE mp.funcao='Closer' AND mp.mes_referencia=date_trunc('month',(SELECT d1 FROM par))::date
    AND mp.marca IN (SELECT marca FROM marcas_validas)
  GROUP BY mp.marca
),
metas_marca AS (
  SELECT COALESCE(s.marca, c.marca) AS marca,
    s.meta_ag_mes,
    c.meta_diag_mes,
    c.meta_sal_mes
  FROM metas_sdr s
  FULL OUTER JOIN metas_closer c ON c.marca = s.marca
),
metas_geral AS (SELECT SUM(meta_ag_mes) AS meta_ag_mes, SUM(meta_diag_mes) AS meta_diag_mes, SUM(meta_sal_mes) AS meta_sal_mes FROM metas_marca),
dia_marcas_todas AS (SELECT marca FROM dia_marca UNION SELECT marca FROM metas_marca UNION SELECT marca FROM lig_dia_marca),
dia_por_marca AS (
  SELECT jsonb_agg(x ORDER BY x.agendamentos DESC, x.diagnosticos DESC, x.marca) AS j
  FROM (
    SELECT m.marca,
      COALESCE(d.agendamentos,0) AS agendamentos,
      COALESCE(d.diagnosticos,0) AS diagnosticos,
      COALESCE(d.sal,0) AS sal,
      COALESCE(l.n,0) AS ligacoes,
      floor(mm.meta_ag_mes/NULLIF((SELECT n FROM bd_mes),0)*(SELECT n FROM bd_periodo)+0.5) AS meta_agendamentos,
      floor(mm.meta_diag_mes/NULLIF((SELECT n FROM bd_mes),0)*(SELECT n FROM bd_periodo)+0.5) AS meta_diagnosticos,
      floor(mm.meta_sal_mes/NULLIF((SELECT n FROM bd_mes),0)*(SELECT n FROM bd_periodo)+0.5) AS meta_sal
    FROM dia_marcas_todas m
    LEFT JOIN dia_marca d ON d.marca=m.marca
    LEFT JOIN metas_marca mm ON mm.marca=m.marca
    LEFT JOIN lig_dia_marca l ON l.marca=m.marca
    WHERE m.marca IS NOT NULL
      AND (COALESCE(d.agendamentos,0)+COALESCE(d.diagnosticos,0)+COALESCE(d.sal,0)+COALESCE(l.n,0) > 0 OR mm.marca IS NOT NULL)
  ) x
),

-- ==================== PARTE 2: MTD ====================
-- Segue contando deal unico por etapa no mes (nao passagens) — mudanca de
-- escopo pedida so para o bloco do DIA. O DISTINCT tambem e o que ja neutraliza
-- o handoff SDR->Closer aqui, sem precisar da trava por id_etapa.
mtd_ev AS (
  SELECT DISTINCT e.id_deal, ec.etapa_canonica, NULLIF(TRIM(s.marca),'') AS marca
  FROM deal_eventos e
  JOIN etapa_canonica ec ON ec.nome_etapa_raw=e.nome_etapa
  LEFT JOIN deal_snapshot s ON s.id_deal=e.id_deal
  WHERE e.tipo_evento='mudanca_etapa' AND e.nome_funil IN (SELECT nome_funil FROM funis_ok)
    AND e.id_deal NOT IN (SELECT id_deal FROM deals_teste)
    AND (e.data_evento AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN (SELECT mtd_ini FROM par) AND (SELECT mtd_fim FROM par)
),
mtd_ganho AS (
  SELECT DISTINCT e.id_deal, NULLIF(TRIM(s.marca),'') AS marca
  FROM deal_eventos e LEFT JOIN deal_snapshot s ON s.id_deal=e.id_deal
  WHERE e.tipo_evento='ganho' AND e.nome_funil IN (SELECT nome_funil FROM funis_ok)
    AND e.id_deal NOT IN (SELECT id_deal FROM deals_teste)
    AND (e.data_evento AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN (SELECT mtd_ini FROM par) AND (SELECT mtd_fim FROM par)
),
mtd_cont AS (
  SELECT
    count(*) FILTER (WHERE etapa_canonica='Novo MQL') AS mql,
    count(*) FILTER (WHERE etapa_canonica='Tentando Contato') AS tc,
    count(*) FILTER (WHERE etapa_canonica='Contato Efetivo') AS ce,
    count(*) FILTER (WHERE etapa_canonica='Interesse Reunião') AS ir,
    count(*) FILTER (WHERE etapa_canonica='Conexão') AS con,
    count(*) FILTER (WHERE etapa_canonica='No Show') AS ns,
    count(*) FILTER (WHERE etapa_canonica='Reunião Agendada SQL') AS ag,
    count(*) FILTER (WHERE etapa_canonica='Diagnóstico') AS diag,
    count(*) FILTER (WHERE etapa_canonica='Negociação SAL') AS sal,
    count(*) FILTER (WHERE etapa_canonica='Oportunidade COF') AS oport,
    count(*) FILTER (WHERE etapa_canonica='Comitê') AS com,
    count(*) FILTER (WHERE etapa_canonica='Pré-Contrato') AS pre
  FROM mtd_ev
),
mtd_fech AS (SELECT count(*) AS fech FROM mtd_ganho),
mtd_marca_cont AS (
  SELECT marca,
    count(*) FILTER (WHERE etapa_canonica='Novo MQL') AS mql,
    count(*) FILTER (WHERE etapa_canonica='No Show') AS ns,
    count(*) FILTER (WHERE etapa_canonica='Reunião Agendada SQL') AS ag,
    count(*) FILTER (WHERE etapa_canonica='Diagnóstico') AS diag,
    count(*) FILTER (WHERE etapa_canonica='Negociação SAL') AS sal,
    count(*) FILTER (WHERE etapa_canonica='Oportunidade COF') AS oport,
    count(*) FILTER (WHERE etapa_canonica='Conexão') AS con
  FROM mtd_ev WHERE marca IS NOT NULL GROUP BY marca
),
mtd_marca_fech AS (SELECT marca, count(*) AS fech FROM mtd_ganho WHERE marca IS NOT NULL GROUP BY marca),
mtd_marcas_todas AS (SELECT marca FROM mtd_marca_cont UNION SELECT marca FROM lig_mtd_marca),
mtd_por_marca AS (
  SELECT jsonb_agg(x ORDER BY x.agendamentos DESC, x.diagnosticos DESC, x.marca) AS j
  FROM (
    SELECT m.marca,
      COALESCE(c.ag,0) AS agendamentos, COALESCE(c.diag,0) AS diagnosticos,
      COALESCE(c.sal,0) AS sal, COALESCE(c.oport,0) AS oportunidades,
      COALESCE(l.n,0) AS ligacoes,
      jsonb_build_object(
        'mql_con',    round(100.0*c.con/NULLIF(c.mql,0),1),
        'mql_ag',     round(100.0*c.ag/NULLIF(c.mql,0),1),
        'pct_noshow', round(100.0*c.ns/NULLIF(c.ag,0),1),
        'mql_fech',   round(100.0*COALESCE(f.fech,0)/NULLIF(c.mql,0),1),
        'sal_fech',   round(100.0*COALESCE(f.fech,0)/NULLIF(c.sal,0),1),
        'oport_fech', round(100.0*COALESCE(f.fech,0)/NULLIF(c.oport,0),1)
      ) AS conversoes_chave
    FROM mtd_marcas_todas m
    LEFT JOIN mtd_marca_cont c ON c.marca=m.marca
    LEFT JOIN mtd_marca_fech f ON f.marca=m.marca
    LEFT JOIN lig_mtd_marca l ON l.marca=m.marca
    WHERE m.marca IS NOT NULL
      AND (COALESCE(c.ag,0)+COALESCE(c.diag,0)+COALESCE(c.sal,0)+COALESCE(c.oport,0)+COALESCE(l.n,0) > 0)
  ) x
)

SELECT jsonb_build_object(
  'periodo', jsonb_build_object(
      'inicio', par.d1, 'fim', par.d2,
      'label_inicio', to_char(par.d1,'DD/MM/YYYY'),
      'label_fim', to_char(par.d2,'DD/MM/YYYY'),
      'dias', par.dias, 'dias_uteis', (SELECT n FROM bd_periodo),
      'mtd_label', to_char(par.mtd_ini,'DD/MM') || ' a ' || to_char(par.mtd_fim,'DD/MM/YYYY')
  ),
  'dia', jsonb_build_object(
      'geral', jsonb_build_object(
        'agendamentos', (SELECT agendamentos FROM dia_geral),
        'diagnosticos', (SELECT diagnosticos FROM dia_geral),
        'sal', (SELECT sal FROM dia_geral),
        'ligacoes', (SELECT n FROM lig_dia_geral),
        'meta_agendamentos', floor((SELECT meta_ag_mes FROM metas_geral)/NULLIF((SELECT n FROM bd_mes),0)*(SELECT n FROM bd_periodo)+0.5),
        'meta_diagnosticos', floor((SELECT meta_diag_mes FROM metas_geral)/NULLIF((SELECT n FROM bd_mes),0)*(SELECT n FROM bd_periodo)+0.5),
        'meta_sal', floor((SELECT meta_sal_mes FROM metas_geral)/NULLIF((SELECT n FROM bd_mes),0)*(SELECT n FROM bd_periodo)+0.5)
      ),
      'por_marca', COALESCE((SELECT j FROM dia_por_marca),'[]'::jsonb)
  ),
  'mtd', jsonb_build_object(
      'geral', jsonb_build_object(
        'agendamentos', (SELECT ag FROM mtd_cont),
        'diagnosticos', (SELECT diag FROM mtd_cont),
        'sal', (SELECT sal FROM mtd_cont),
        'oportunidades', (SELECT oport FROM mtd_cont),
        'ligacoes', (SELECT n FROM lig_mtd_geral)
      ),
      'conversoes_seq', jsonb_build_object(
        'mql_tc',    round(100.0*(SELECT tc FROM mtd_cont)/NULLIF((SELECT mql FROM mtd_cont),0),1),
        'tc_ce',     round(100.0*(SELECT ce FROM mtd_cont)/NULLIF((SELECT tc FROM mtd_cont),0),1),
        'ce_ir',     round(100.0*(SELECT ir FROM mtd_cont)/NULLIF((SELECT ce FROM mtd_cont),0),1),
        'ir_con',    round(100.0*(SELECT con FROM mtd_cont)/NULLIF((SELECT ir FROM mtd_cont),0),1),
        'con_ag',    round(100.0*(SELECT ag FROM mtd_cont)/NULLIF((SELECT con FROM mtd_cont),0),1),
        'ag_diag',   round(100.0*(SELECT diag FROM mtd_cont)/NULLIF((SELECT ag FROM mtd_cont),0),1),
        'diag_sal',  round(100.0*(SELECT sal FROM mtd_cont)/NULLIF((SELECT diag FROM mtd_cont),0),1),
        'sal_oport', round(100.0*(SELECT oport FROM mtd_cont)/NULLIF((SELECT sal FROM mtd_cont),0),1),
        'oport_com', round(100.0*(SELECT com FROM mtd_cont)/NULLIF((SELECT oport FROM mtd_cont),0),1),
        'com_pre',   round(100.0*(SELECT pre FROM mtd_cont)/NULLIF((SELECT com FROM mtd_cont),0),1),
        'pre_fech',  round(100.0*(SELECT fech FROM mtd_fech)/NULLIF((SELECT pre FROM mtd_cont),0),1)
      ),
      'conversoes_chave', jsonb_build_object(
        'mql_con',    round(100.0*(SELECT con FROM mtd_cont)/NULLIF((SELECT mql FROM mtd_cont),0),1),
        'mql_ag',     round(100.0*(SELECT ag FROM mtd_cont)/NULLIF((SELECT mql FROM mtd_cont),0),1),
        'pct_noshow', round(100.0*(SELECT ns FROM mtd_cont)/NULLIF((SELECT ag FROM mtd_cont),0),1),
        'mql_fech',   round(100.0*(SELECT fech FROM mtd_fech)/NULLIF((SELECT mql FROM mtd_cont),0),1),
        'sal_fech',   round(100.0*(SELECT fech FROM mtd_fech)/NULLIF((SELECT sal FROM mtd_cont),0),1),
        'oport_fech', round(100.0*(SELECT fech FROM mtd_fech)/NULLIF((SELECT oport FROM mtd_cont),0),1)
      ),
      'por_marca', COALESCE((SELECT j FROM mtd_por_marca),'[]'::jsonb)
  )
)
FROM par;
$function$
;

-- ============ 5. Cadência 3 (Legacy) reapontada e cadência 13 com filtro de marca (23/10 21h50) ============
update public.cadencia_etapas set pipeline_id='69380917e00ed10014daaa62', stage_id='69380917e00ed10014daaa64', rotulo='SDR / Novo MQL' where id=7;
update public.cadencia_etapas set pipeline_id='69380917e00ed10014daaa62', stage_id='69380917e00ed10014daaa65', rotulo='SDR / Tentando Contato' where id=8;
update public.cadencia_etapas set pipeline_id='69380917e00ed10014daaa62', stage_id='69380917e00ed10014daaa66', rotulo='SDR / Contato Efetivo' where id=27;
update public.cadencia_condicoes set valor='69380917e00ed10014daaa62', campo='Funil SDR' where id=14;
update public.cadencia_condicoes set valor='69380917e00ed10014daaa64,69380917e00ed10014daaa65,69380917e00ed10014daaa66', campo='Etapa Novo MQL, Tentando Contato ou Contato Efetivo' where id=15;
insert into public.cadencia_condicoes (cadencia_id, campo, origem_campo, operador, valor, grupo) values (3, 'Marca', 'custom_field_label', 'equals', 'Odonto Legacy', 1); -- id 197
insert into public.cadencia_condicoes (cadencia_id, campo, origem_campo, operador, valor, grupo) values (13, 'Marca', 'custom_field_label', 'not_equals', 'Odonto Legacy', 1); -- id 198
update public.cadencias set mover_no_disparo_de='69380917e00ed10014daaa64', mover_no_disparo_para='69380917e00ed10014daaa65' where id=3;

-- ============ 6. Regra de distribuição do Odonto Legacy v3 (cria no SDR / Novo MQL) ============
-- distribuicao_publicar_regra(jsonb da regra 58 com id_funil='69380917e00ed10014daaa62', id_etapa='69380917e00ed10014daaa64', modo='ativo'), autor claude@sessao-23-10 -> regra id 59

-- ============ 7. Operação das ondas ============
-- update public.webhook_controle set habilitado=false, bloqueado_em=now(), motivo=... where id=1;  select cron.unschedule(<job do REFRESH da matview>);
-- select public.migracao_funis_checksum('onda1_antes', '2026-10-23');
-- select cron.schedule('migracao_funis_onda1', '* * * * *', $$select public.migracao_funis_proximo_lote('mover','onda1',55,'migracao_funis_onda1')$$);  -- idem onda1b; onda2: 'perder' depois 'mover'
-- select cron.schedule('*/2 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_deal_ciclo_enriquecido');  refresh materialized view concurrently public.mv_deal_ciclo_enriquecido;
-- select public.migracao_funis_checksum('onda1_depois', '2026-10-23');  select * from public.migracao_funis_diff('onda1_antes','onda1_depois');
-- select public.webhook_religar();  update public.webhook_controle set habilitado=true, motivo=null, bloqueado_em=null where id=1;

-- ============ 8. Passagens históricas suprimidas na onda 1 (2) ============
-- exclusão id 1386: deal 6aa356eaefd6d4000159789c, etapa 6a22e058892e160021c1700c, data 2026-09-14 12:08:25.429+00 (evento removido; linha no backup de eventos)
-- exclusão id 1387: deal 698a58261cd2ef0015b4b768, etapa 68b84341646c55001ed64e53, data 2026-05-30 15:35:01.479+00 (evento removido; linha no backup de eventos)

-- ============ 9. Liberar um lote para o dashboard ============
-- update public.dashboard_deal_oculto set liberado_em = now() where lote = 'Inpot' and liberado_em is null;  -- Get it | Inpot | Lisô Laser | Oral Unic | Rota´s
