BEGIN;
CREATE OR REPLACE VIEW ouro.vw_legacy_dashboard_funil AS
WITH atuais AS MATERIALIZED (
  SELECT DISTINCT ON (conta_id, negocio_id)
    marca, funil_id, etapa_canonica, status_atual, utm_source, data_perdido, carregado_em
  FROM ouro.negocios_ciclos_dashboard
  WHERE conta_id = 'wescale_principal_crm'
  ORDER BY conta_id, negocio_id, eh_ciclo_atual DESC NULLS LAST,
    eh_estado_atual DESC NULLS LAST, ciclo DESC, carregado_em DESC, negocio_ciclo_key
), legacy AS MATERIALIZED (
  SELECT * FROM atuais
  WHERE marca IN ('Odonto Scale','Odonto Legacy')
    AND funil_id IN ('69380917e00ed10014daaa62','69380937219fc3001702b9b5')
), referencia AS (
  SELECT max(carregado_em) AS carga FROM legacy
), grupos AS (
  SELECT 'aberto' AS tipo, coalesce(etapa_canonica,'Etapa não informada') AS etapa,
    utm_source AS fonte, NULL::date AS dia, count(*) AS total
  FROM legacy WHERE status_atual = 'Em andamento' GROUP BY 2,3
  UNION ALL
  SELECT 'perdido', NULL, utm_source, (data_perdido AT TIME ZONE 'America/Sao_Paulo')::date, count(*)
  FROM legacy WHERE status_atual = 'Perdido' AND data_perdido IS NOT NULL GROUP BY 3,4
  UNION ALL
  SELECT 'referencia', NULL, NULL, NULL::date, 0
)
SELECT grupos.*, referencia.carga AS carregado_em FROM grupos CROSS JOIN referencia;
REVOKE ALL ON ouro.vw_legacy_dashboard_funil FROM PUBLIC;
GRANT SELECT ON ouro.vw_legacy_dashboard_funil TO dashboard_legacy_ro;
COMMIT;
