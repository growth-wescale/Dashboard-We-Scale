-- =============================================================================
-- Eco da retomada não conta como passagem — Supabase de Expansão (cygxmduuwlwfbodfrlkr)
-- Aplicado em 03/11/2026 como migration `eco_da_retomada_nao_conta_passagem`.
-- =============================================================================
--
-- O que acontecia: quando uma negociação perdida é retomada, o RD grava de novo a
-- entrada na etapa em que ela estava, no minuto da retomada. `registrar_stage_history`
-- transforma isso num `mudanca_etapa`, que abre o ciclo novo. Como a data de cada etapa
-- do ciclo é a da 1ª passagem nela, o ciclo 2 ganhava reunião realizada, SAL ou COF "no
-- minuto da retomada", sem reunião nenhuma. Na Corrida de Performance (retomada = 2 pts)
-- essa reunião fantasma valia 2 pts: Sarah set/26 (Leandro Rodrigues, 30/09), Sarah
-- out/26 (Francesco Martinenghi, 29/10) e Cassiana nov/26 (Rafael Alves Lustosa, 03/11).
--
-- Regra (eco): `mudanca_etapa` com o MESMO id_etapa da passagem anterior do negócio e
--   (a) uma perda entre as duas (de 1 min antes da anterior até o eco), ou
--   (b) um `deal_retomado` de 2 min antes até 1 h depois do eco
--       (cobre a perda do mesmo dia que foi substituída pela 2ª, ver 27/10).
-- Repetição na mesma etapa sem perda nem retomada perto (183 eventos em 03/11,
-- duplicatas antigas de origem variada) NÃO é tocada.
--
-- O eco continua no ciclo: dá presença ao ciclo (um ciclo só existe em vw_deal_ciclo se
-- tiver passagem), início do ciclo, etapa final, marca/funil, camada atual e dono. Ele só
-- deixa de contar como passagem, data de etapa e entrada na camada do Closer
-- (`ts_ini_closer`, que define o SDR do handoff).
--
-- A mudança é feita trocando trechos exatos da definição atual das views (pg_temp.troca
-- confere quantas vezes cada trecho aparece e para tudo se não bater).
-- =============================================================================

insert into public._backup_viewdefs (nome, criado_em, def) values
  ('vw_deal_eventos_ciclo_pre_eco_retomada_20261103', now(), pg_get_viewdef('public.vw_deal_eventos_ciclo'::regclass, true)),
  ('vw_deal_ciclo_pre_eco_retomada_20261103',         now(), pg_get_viewdef('public.vw_deal_ciclo'::regclass, true)),
  ('vw_funil_etapas_v2_pre_eco_retomada_20261103',    now(), pg_get_viewdef('public.vw_funil_etapas_v2'::regclass, true));

create or replace function pg_temp.troca(s text, de text, para text, esperado int) returns text
language plpgsql as $f$
declare n int := (length(s) - length(replace(s, de, ''))) / length(de);
begin
  if n <> esperado then raise exception 'trecho apareceu % vez(es), esperado %: %', n, esperado, left(de, 70); end if;
  return replace(s, de, para);
end $f$;

do $mig$
declare
  d_ev text := regexp_replace(pg_get_viewdef('public.vw_deal_eventos_ciclo'::regclass, true), ';\s*$', '');
  d_ci text := regexp_replace(pg_get_viewdef('public.vw_deal_ciclo'::regclass, true), ';\s*$', '');
  d_v2 text := regexp_replace(pg_get_viewdef('public.vw_funil_etapas_v2'::regclass, true), ';\s*$', '');
begin
  -- 1) vw_deal_eventos_ciclo: CTE eco_retomada + coluna eh_eco_retomada no fim
  d_ev := pg_temp.troca(d_ev, '        ), base AS (',
    E'        ), eco_retomada AS (\n         SELECT m.id_evento\n           FROM ( SELECT e.id_evento,\n                    e.id_deal,\n                    e.id_etapa,\n                    e.data_evento,\n                    lag(e.id_etapa) OVER w AS id_etapa_ant,\n                    lag(e.data_evento) OVER w AS ts_ant\n                   FROM deal_eventos e\n                  WHERE e.tipo_evento = ''mudanca_etapa''::text\n                  WINDOW w AS (PARTITION BY e.id_deal ORDER BY e.data_evento, e.id_evento)) m\n          WHERE m.id_etapa = m.id_etapa_ant AND ((EXISTS ( SELECT 1\n                   FROM deal_eventos p\n                  WHERE p.id_deal = m.id_deal AND p.tipo_evento = ''perda''::text AND p.data_evento >= (m.ts_ant - ''00:01:00''::interval) AND p.data_evento <= m.data_evento)) OR (EXISTS ( SELECT 1\n                   FROM deal_eventos r\n                  WHERE r.id_deal = m.id_deal AND r.tipo_evento = ''deal_retomado''::text AND r.data_evento >= (m.data_evento - ''00:02:00''::interval) AND r.data_evento <= (m.data_evento + ''01:00:00''::interval))))\n        ), base AS (', 1);
  d_ev := pg_temp.troca(d_ev, E'    r.telefone\n   FROM resolvido r\n',
    E'    r.telefone,\n    eco.id_evento IS NOT NULL AS eh_eco_retomada\n   FROM resolvido r\n     LEFT JOIN eco_retomada eco ON eco.id_evento = r.id_evento\n', 1);

  -- 2) vw_deal_ciclo: o eco não vira data de etapa, passagem nem entrada na camada do Closer
  d_ci := pg_temp.troca(d_ci, E'            vw_deal_eventos_ciclo.telefone\n           FROM vw_deal_eventos_ciclo\n',
    E'            vw_deal_eventos_ciclo.telefone,\n            vw_deal_eventos_ciclo.eh_eco_retomada\n           FROM vw_deal_eventos_ciclo\n', 1);
  d_ci := pg_temp.troca(d_ci, E'            evt.atribuicao_confiavel\n           FROM evt\n',
    E'            evt.atribuicao_confiavel,\n            evt.eh_eco_retomada\n           FROM evt\n', 1);
  d_ci := pg_temp.troca(d_ci, 'FILTER (WHERE et.etapa_canonica = ', 'FILTER (WHERE NOT et.eh_eco_retomada AND et.etapa_canonica = ', 14);
  d_ci := pg_temp.troca(d_ci, 'min(et.data_evento) FILTER (WHERE et.camada = ''Closer''::text) AS ts_ini_closer',
    'min(et.data_evento) FILTER (WHERE et.camada = ''Closer''::text AND NOT et.eh_eco_retomada) AS ts_ini_closer', 1);
  d_ci := pg_temp.troca(d_ci, 'count(*) AS passagens_no_ciclo', 'count(*) FILTER (WHERE NOT et.eh_eco_retomada) AS passagens_no_ciclo', 1);

  -- 3) vw_funil_etapas_v2: o eco não conta como passagem
  d_v2 := pg_temp.troca(d_v2, 'WHERE v.tipo_evento = ''mudanca_etapa''::text AND v.etapa_canonica IS NOT NULL',
    'WHERE v.tipo_evento = ''mudanca_etapa''::text AND NOT v.eh_eco_retomada AND v.etapa_canonica IS NOT NULL', 1);

  execute 'CREATE OR REPLACE VIEW public.vw_deal_eventos_ciclo AS ' || d_ev;
  execute 'CREATE OR REPLACE VIEW public.vw_deal_ciclo AS ' || d_ci;
  execute 'CREATE OR REPLACE VIEW public.vw_funil_etapas_v2 AS ' || d_v2;
end $mig$;

comment on column public.vw_deal_eventos_ciclo.eh_eco_retomada is
  'Passagem repetida na mesma etapa (mesmo id_etapa da passagem anterior) logo depois de uma perda ou de uma retomada: o RD grava de novo a etapa em que a negociação estava. Não conta como passagem nem data de etapa (03/11/2026).';

insert into public._backup_viewdefs (nome, criado_em, def) values
  ('vw_deal_eventos_ciclo_pos_eco_retomada_20261103', now(), pg_get_viewdef('public.vw_deal_eventos_ciclo'::regclass, true)),
  ('vw_deal_ciclo_pos_eco_retomada_20261103',         now(), pg_get_viewdef('public.vw_deal_ciclo'::regclass, true)),
  ('vw_funil_etapas_v2_pos_eco_retomada_20261103',    now(), pg_get_viewdef('public.vw_funil_etapas_v2'::regclass, true));

-- A matview mv_deal_ciclo_enriquecido e as cópias dash_vendas/dash_etapas se refazem
-- sozinhas: dash_impressao_fontes() inclui a regra (xmin) de todas as views da cadeia.
-- Em 03/11 a rodada das 18h24 (versão 39) pegou a mudança: 85 linhas de vendas e 175 de
-- etapas, refresh 5,2 s, sem erro.


-- =============================================================================
-- Conferência (só leitura)
-- =============================================================================

-- Quantos ecos estão marcados (225 em 03/11, dentro das regras de visibilidade da view)
select count(*) from public.vw_deal_eventos_ciclo where eh_eco_retomada;

-- Conferência de que nada além das datas de etapa mudou (rodar antes e depois):
-- 9.342 linhas, 9.221 ciclo atual, 75 ganhos, R$ 3.625.328,98, 6.915 perdidos e 2.352 em
-- andamento nos dois lados, em 03/11.
select count(*) as linhas,
       count(*) filter (where eh_ciclo_atual) as ciclo_atual,
       count(*) filter (where status_atual = 'Ganho') as ganhos,
       sum(valor_contrato) as receita,
       count(*) filter (where status_atual = 'Perdido') as perdidos,
       count(*) filter (where status_atual = 'Em andamento') as em_andamento
from public.vw_funil_vendas;

-- Os 4 casos que motivaram a correção (ciclo 2):
--   Rafael Alves Lustosa (Cassiana)  6a06f45bd33228000172371a  RR 03/11 11:47 -> nula
--   Ricardo Balslaobre               6a1b2363e91568000152e3ce  RR 31/10 10:33 -> 14:05 (reunião real); SDR Thiago -> Cassiana Lavall
--   Leandro Rodrigues Lamac Brites   6ab78f84ce3149000143e546  RR 30/09 16:12 -> nula
--   Francesco Martinenghi            6ad26d723fb4c2000125c028  RR 29/10 11:12 -> nula (o SAL das 11:12:56 é real e fica)
select id_lead, ciclo, nome_sdr, data_agendamento_reuniao_sql, data_reuniao_realizada, data_sal
from public.vw_funil_vendas
where (id_lead, ciclo) in (('6a06f45bd33228000172371a', 2), ('6a1b2363e91568000152e3ce', 2),
                           ('6ab78f84ce3149000143e546', 2), ('6ad26d723fb4c2000125c028', 2));


-- =============================================================================
-- Voltar atrás (se precisar)
-- =============================================================================
-- vw_deal_eventos_ciclo fica com a coluna nova (CREATE OR REPLACE não remove coluna e as
-- outras views dependem dela); restaurar vw_deal_ciclo e vw_funil_etapas_v2 basta para
-- voltar ao comportamento antigo. A sincronização das abas pega sozinha na rodada seguinte.
--
-- do $volta$ begin
--   execute 'CREATE OR REPLACE VIEW public.vw_deal_ciclo AS ' || regexp_replace(
--     (select def from public._backup_viewdefs where nome = 'vw_deal_ciclo_pre_eco_retomada_20261103'), ';\s*$', '');
--   execute 'CREATE OR REPLACE VIEW public.vw_funil_etapas_v2 AS ' || regexp_replace(
--     (select def from public._backup_viewdefs where nome = 'vw_funil_etapas_v2_pre_eco_retomada_20261103'), ';\s*$', '');
-- end $volta$;
