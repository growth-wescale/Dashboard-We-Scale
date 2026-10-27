-- Contrato Marketing: todo deal criado no CRM é MQL (decisão de27/10).
-- SELECT somente ouro. Não exige passagem Novo MQL, capital ou status atual.
-- Um deal por conta; reciclagem não cria outro deal.
WITH atuais AS (
 SELECT DISTINCT ON (conta_id, negocio_id)
  conta_id, negocio_id, funil_id, nome_funil, marca,
  data_criacao_original, data_novo_mql, status_atual, carregado_em,
  utm_source,utm_medium,utm_campaign
 FROM ouro.negocios_ciclos_dashboard
 WHERE conta_id = 'wescale_principal_crm'
 ORDER BY conta_id, negocio_id, eh_ciclo_atual DESC NULLS LAST,
          eh_estado_atual DESC NULLS LAST, ciclo DESC, carregado_em DESC,
          negocio_ciclo_key
)
SELECT *, true AS mql_comercial, 'deal_criado_crm'::text AS qualificacao_proveniencia,
 CASE WHEN funil_id = '6ab14ed684645500206bee2e' THEN 'beauty'
      ELSE 'liso' END AS segmento,
 to_char(data_criacao_original AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia_criacao,
 -- Data MQL existente preservada; ausência não desqualifica deal.
 to_char(coalesce(data_novo_mql,data_criacao_original) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia_mql,
 CASE WHEN data_novo_mql IS NOT NULL THEN 'data_mql_crm'
      ELSE 'criacao_crm' END AS data_mql_proveniencia
FROM atuais
WHERE funil_id = '6ab14ed684645500206bee2e'
 OR (marca = 'Lisô Laser' AND funil_id IN (
 '69380917e00ed10014daaa62', -- SDR
 '69380937219fc3001702b9b5', -- Closer
 '68af3a1fe98420001a4aa383'  -- funil histórico Lisô
 ))
-- Recorte dos funis da transição; não reatribui deals Partner/prospecção.
