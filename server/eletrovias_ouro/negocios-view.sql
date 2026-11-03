-- CANDIDATE ONLY: do not execute before publication approval. No facts are changed.
CREATE OR REPLACE VIEW ouro.vw_eletrovias_dashboard_negocios AS
-- Read-only candidate. One CRM deal, across all funnels/statuses, before any date slicing.
-- No eligibility/qualification flag filters the commercial population.
WITH latest AS MATERIALIZED (
 SELECT DISTINCT ON (conta_id, negocio_id)
  conta_id, negocio_id, marca, data_criacao_original,
  funil_id, nome_funil, status_atual, carregado_em,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term
 FROM ouro.negocios_ciclos_dashboard
 WHERE conta_id = 'wescale_principal_crm'
 ORDER BY conta_id, negocio_id, eh_ciclo_atual DESC NULLS LAST,
  eh_estado_atual DESC NULLS LAST, ciclo DESC, carregado_em DESC, negocio_ciclo_key
)
SELECT * FROM latest
WHERE marca = 'Eletrovias'
 -- Approved October creation window in Brasilia; no data_novo_mql or recycle date.
 AND data_criacao_original >= '2026-10-01 00:00:00-03'
 AND data_criacao_original < '2026-11-01 00:00:00-03';
GRANT SELECT ON ouro.vw_eletrovias_dashboard_negocios TO dashboard_eletrovias_ro;
