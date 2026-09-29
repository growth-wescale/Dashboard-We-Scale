-- ============================================================================
-- 2026-09-29 — Supabase de EXPANSÃO (cygxmduuwlwfbodfrlkr)
--
-- Parte 1 · Etapa contada 2x ("repetidos" falsos)
--   A Edge Function espelhar-rd chama registrar_stage_history (grava a etapa
--   pelo histórico do RD) e depois processar_deal_evento. Essa segunda função
--   só pula a etapa quando p_origem está em ('api_sync', 'api_backfill', ...).
--   'api_espelho_edge' e 'api_espelho' ficaram de fora, então ela grava a
--   MESMA passagem de novo, com data = updated_at (ms a minutos depois).
--   Resultado: ~2,5 mil passagens fantasmas desde 15/09, que aparecem como
--   "repetidos" no modo Passagens (ex.: deal 6a9d7aa4eeed3c00017bea5c,
--   Pré-Contrato 2x sendo que no RD passou 1x).
--
-- Parte 2 · Deal sem SDR
--   vw_deal_ciclo não achava SDR em 2 casos:
--   a) deal que passou do Closer para um SDR (No Show, redistribuição) e foi
--      perdido na camada SDR: posse_atual só vale pra deal ABERTO, então o SDR
--      sumia no momento da perda (ex.: 6a9ade29b3f58200254ce47e, Thiago).
--   b) dono SDR/Closer (Vanessa Daniel, Odonto Legacy) que faz os dois papéis:
--      a fonte 'posse' descartava o nome por ser igual ao Closer eleito.
--   Os dois ramos novos entram no FIM da cadeia (só preenchem vazio).
--   Simulado na base inteira: exatamente 5 ciclos mudam, todos de NULL → nome.
--
-- Rodar tudo de uma vez. Cada passo aborta se o trecho esperado não existir.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- backups ---
INSERT INTO _backup_viewdefs (nome, criado_em, def) VALUES
  ('fn_processar_deal_evento_pre_espelho_20260929', now(), pg_get_functiondef('processar_deal_evento'::regproc)),
  ('vw_deal_ciclo_pre_sdr_final_20260929',          now(), pg_get_viewdef('vw_deal_ciclo'::regclass, true));

CREATE TABLE _backup_funil_pre_20260929 AS
SELECT id_lead, ciclo, eh_ciclo_atual, status_atual, nome_sdr, nome_closer, marca, origem_comercial
FROM vw_funil_vendas;

-- ------------------------------------- Parte 1a · para de gerar duplicata ---
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('processar_deal_evento'::regproc);
  IF strpos(d, $q$p_origem IN ('api_sync','api_backfill','api_backfill_stage_history')$q$) = 0 THEN
    RAISE EXCEPTION 'processar_deal_evento: trecho v_etapa_vem_do_historico não encontrado';
  END IF;
  d := replace(d,
    $q$p_origem IN ('api_sync','api_backfill','api_backfill_stage_history')$q$,
    $q$p_origem IN ('api_sync','api_backfill','api_backfill_stage_history','api_espelho_edge','api_espelho')$q$);
  EXECUTE d;
END $$;

-- ------------------------------------ Parte 1b · limpa as já gravadas -------
-- Duplicata = mudanca_etapa de origem espelho cuja passagem anterior (mesma
-- etapa) já está gravada, sem outra etapa, sem deal_retomado e sem outra
-- etapa no histórico do RD entre as duas. Se houve perda/ganho no meio, só
-- conta como duplicata se a diferença for < 1 min (senão é ambíguo, fica).
CREATE TABLE _backup_etapa_duplicada_espelho_20260929 AS
SELECT e.*
FROM deal_eventos e
CROSS JOIN LATERAL (
  SELECT t.data_evento FROM deal_eventos t
  WHERE t.id_deal = e.id_deal AND t.tipo_evento = 'mudanca_etapa' AND t.id_etapa = e.id_etapa
    AND t.id_evento <> e.id_evento
    AND (t.data_evento < e.data_evento OR (t.data_evento = e.data_evento AND t.id_evento < e.id_evento))
  ORDER BY t.data_evento DESC, t.id_evento DESC LIMIT 1
) t
WHERE e.tipo_evento = 'mudanca_etapa'
  AND e.origem IN ('api_espelho_edge', 'api_espelho')
  AND NOT EXISTS (
    SELECT 1 FROM deal_eventos x
    WHERE x.id_deal = e.id_deal AND x.data_evento > t.data_evento AND x.data_evento < e.data_evento
      AND ((x.tipo_evento = 'mudanca_etapa' AND x.id_etapa IS DISTINCT FROM e.id_etapa) OR x.tipo_evento = 'deal_retomado'))
  AND NOT EXISTS (
    SELECT 1 FROM deal_stage_historico h
    WHERE h.id_deal = e.id_deal AND h.deal_stage_id IS DISTINCT FROM e.id_etapa
      AND h.start_date > t.data_evento AND h.start_date < e.data_evento)
  AND (e.data_evento - t.data_evento < interval '1 minute'
       OR NOT EXISTS (
         SELECT 1 FROM deal_eventos x
         WHERE x.id_deal = e.id_deal AND x.tipo_evento IN ('perda', 'ganho')
           AND x.data_evento > t.data_evento AND x.data_evento < e.data_evento));

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _backup_etapa_duplicada_espelho_20260929;
  -- medido em 29/09 ~15h: 2.552. Margem pra novos syncs até a hora de rodar.
  IF n < 2000 OR n > 3500 THEN
    RAISE EXCEPTION 'quantidade inesperada de duplicatas: %', n;
  END IF;
END $$;

DELETE FROM deal_eventos
WHERE id_evento IN (SELECT id_evento FROM _backup_etapa_duplicada_espelho_20260929);

-- ------------------------------------------ Parte 2 · SDR que ficava vazio --
DO $$
DECLARE d text; a text; b text;
BEGIN
  d := pg_get_viewdef('vw_deal_ciclo'::regclass, true);

  -- 2.1 flag: ciclo corrente, deal numa etapa SDR e dono atual com cargo de SDR
  a := 'pn.dono AS posse_atual,';
  b := 'pn.dono AS posse_atual, '
    || $q$d_1.ciclo = cm.ciclo_max AND d_1.camada_atual = 'SDR'::text AND (pn.dono_cargo = ANY (ARRAY['SDR'::text, 'SDR/Closer'::text])) AS final_sdr,$q$;
  IF strpos(d, a) = 0 THEN RAISE EXCEPTION 'vw_deal_ciclo: trecho 2.1 não encontrado'; END IF;
  d := replace(d, a, b);

  -- 2.2 dois fallbacks no fim da cadeia do nome
  a := 'END, pre.sdr_rd) AS sdr_ciclo';
  b := $q$END, pre.sdr_rd,
                CASE WHEN pre.sdr_po_cargo = 'SDR/Closer'::text THEN pre.sdr_po ELSE NULL::text END,
                CASE WHEN pre.final_sdr THEN pre.posse_atual ELSE NULL::text END) AS sdr_ciclo$q$;
  IF strpos(d, a) = 0 THEN RAISE EXCEPTION 'vw_deal_ciclo: trecho 2.2 não encontrado'; END IF;
  d := replace(d, a, b);

  -- 2.3 mesma ordem na coluna de fonte
  a := $q$WHEN pre.sdr_rd IS NOT NULL THEN 'campo_rd'::text$q$;
  b := $q$WHEN pre.sdr_rd IS NOT NULL THEN 'campo_rd'::text
                    WHEN pre.sdr_po_cargo = 'SDR/Closer'::text AND pre.sdr_po IS NOT NULL THEN 'posse'::text
                    WHEN pre.final_sdr AND pre.posse_atual IS NOT NULL THEN 'posse_final'::text$q$;
  IF strpos(d, a) = 0 THEN RAISE EXCEPTION 'vw_deal_ciclo: trecho 2.3 não encontrado'; END IF;
  d := replace(d, a, b);

  EXECUTE 'CREATE OR REPLACE VIEW vw_deal_ciclo AS ' || d;
END $$;

COMMIT;

REFRESH MATERIALIZED VIEW mv_deal_ciclo_enriquecido;

-- ------------------------------------------------------------- conferência --
-- Esperado: linhas iguais ou poucas a menos (ciclo fantasma de duplicata pós-
-- perda some), ganhos 61 e receita 2.780.776,98 iguais, sem_sdr 154 → ~149.
SELECT count(*) linhas,
       count(*) FILTER (WHERE status_atual = 'Ganho') ganhos,
       sum(valor_contrato) FILTER (WHERE status_atual = 'Ganho') receita,
       count(*) FILTER (WHERE nome_sdr IS NULL) sem_sdr
FROM vw_funil_vendas;

-- Quem mudou de SDR/Closer (esperado: só NULL → nome nos 5 deals)
SELECT a.id_lead, a.ciclo, a.nome_sdr AS sdr_antes, f.nome_sdr AS sdr_depois,
       a.nome_closer AS closer_antes, f.nome_closer AS closer_depois
FROM _backup_funil_pre_20260929 a
JOIN vw_funil_vendas f USING (id_lead, ciclo)
WHERE a.nome_sdr IS DISTINCT FROM f.nome_sdr OR a.nome_closer IS DISTINCT FROM f.nome_closer;

-- Deal do print: Pré-Contrato agora 1x
SELECT nome_etapa, count(*) FROM deal_eventos
WHERE id_deal = '6a9d7aa4eeed3c00017bea5c' AND tipo_evento = 'mudanca_etapa'
GROUP BY nome_etapa ORDER BY min(data_evento);

-- ============================================================================
-- APLICADO em 29/09/2026 — ajuste pós-conferência
--
-- A regra da Parte 1b apagou 2.552 linhas. A conferência mostrou 3 ciclos
-- sumindo: deals da era do webhook em que a perda tem o MESMO timestamp da
-- passagem gêmea (não cai "entre" as duas), e a linha de origem api_espelho
-- (script de 11/08) era o ÚNICO registro da reabertura seguinte. Restauradas
-- as 4 linhas nesse padrão (126790, 126791, 126857, 127369):
--
--   INSERT INTO deal_eventos OVERRIDING SYSTEM VALUE
--   SELECT * FROM _backup_etapa_duplicada_espelho_20260929
--   WHERE id_evento IN (126790,126791,126857,127369);
--   DELETE FROM _backup_etapa_duplicada_espelho_20260929
--   WHERE id_evento IN (126790,126791,126857,127369);
--   REFRESH MATERIALIZED VIEW mv_deal_ciclo_enriquecido;
--
-- Resultado final: 2.548 linhas apagadas (backup em
-- _backup_etapa_duplicada_espelho_20260929), 0 ciclos perdidos, ganhos 61 e
-- receita R$ 2.780.776,98 iguais, sem SDR 154 → 149, 6 ciclos mudam de SDR
-- (5 NULL → nome + 6a8b3353… Vanessa → Sarah, que era efeito da duplicata).
-- ============================================================================
