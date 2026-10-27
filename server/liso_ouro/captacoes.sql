-- Prévia somente leitura; não cria objetos, classifica MQL ou altera fatos.
-- Classificação registrada pela origem. Capital não preenche valores ausentes.
-- Qualificação comercial e captação conservam suas datas e grãos próprios.
SELECT registro_key, data_evento, data_evento_em, marca,
       lead_ocorrencia_id, lead_contato_id, lead_event_identifier,
       lead_capital_texto, lead_mql_observado, lead_classificacao_origem,
       negocio_id, carregado_em,
       lead_mql_observado AS mql_captacao,
       CASE WHEN lead_mql_observado IS NOT NULL THEN 'classificacao_observada'
            ELSE 'sem_classificacao_origem' END AS qualificacao_proveniencia
FROM ouro.vw_leads_candidatos
WHERE marca = 'Lisô Laser'
  AND lead_event_identifier = 'lisolaser_multistep'
