-- Outubro de 2026, horário de Brasília. Atribuir marca após escolher o ciclo vigente.
WITH atual AS MATERIALIZED (
  SELECT DISTINCT ON (conta_id, negocio_id)
    conta_id, negocio_id, marca, data_criacao_original, fonte_macro, nome_funil,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  FROM ouro.negocios_ciclos_dashboard
  WHERE conta_id = 'wescale_principal_crm'
  ORDER BY conta_id, negocio_id, eh_ciclo_atual DESC NULLS LAST,
    eh_estado_atual DESC NULLS LAST, ciclo DESC, carregado_em DESC, negocio_ciclo_key
)
SELECT marca, conta_id, negocio_id,
  (data_criacao_original AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  data_criacao_original AS criado_em, fonte_macro, nome_funil,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term
FROM atual
WHERE marca IN ('Inpot', 'B2Case', 'Viva')
  AND data_criacao_original >= TIMESTAMPTZ '2026-10-01 00:00:00-03'
  AND data_criacao_original < TIMESTAMPTZ '2026-11-01 00:00:00-03'
