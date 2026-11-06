WITH atual AS MATERIALIZED (
  SELECT DISTINCT ON (conta_id, negocio_id) conta_id, negocio_id, marca, funil_id, nome_funil,
    data_criacao_original, fonte_macro, utm_source, utm_medium, utm_campaign, utm_content, utm_term
  FROM ouro.negocios_ciclos_dashboard WHERE conta_id = 'wescale_principal_crm'
  ORDER BY conta_id, negocio_id, eh_ciclo_atual DESC NULLS LAST, eh_estado_atual DESC NULLS LAST,
    ciclo DESC, carregado_em DESC, negocio_ciclo_key
)
SELECT CASE WHEN funil_id = '6ab14ed684645500206bee2e' THEN 'Beauty Connection'
            WHEN marca = 'Odonto Legacy' THEN 'Odonto Scale' ELSE marca END AS marca,
  conta_id, negocio_id, to_char(data_criacao_original AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia,
  data_criacao_original AS criado_em, fonte_macro, nome_funil, utm_source, utm_medium, utm_campaign, utm_content, utm_term
FROM atual WHERE data_criacao_original >= TIMESTAMPTZ '{inicio} 00:00:00-03'
  AND data_criacao_original < TIMESTAMPTZ '{fim_exclusivo} 00:00:00-03'
  AND (marca IS DISTINCT FROM 'Oral Unic' OR upper(coalesce(utm_campaign,'')) NOT LIKE '%[V4]%')
  AND (marca IN ('Inpot','B2Case','Viva','Oral Unic')
    OR (marca='Eletrovias' AND negocio_id NOT IN ('6adbb24ffe6c3900293048dc','6adbbe360085d5002083f991','6ae35e54aefc9100238e22e7'))
    OR funil_id='6ab14ed684645500206bee2e'
    OR (marca='Lisô Laser' AND funil_id IN ('69380917e00ed10014daaa62','69380937219fc3001702b9b5','68af3a1fe98420001a4aa383'))
    OR (marca IN ('Odonto Scale','Odonto Legacy') AND funil_id IN ('69380917e00ed10014daaa62','69380937219fc3001702b9b5')))
