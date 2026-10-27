-- Prévia de captação com precedência CRM; nunca publicada.
-- Ligação exclusivamente por ID de negócio já exposto pela ouro.
WITH crm AS (
-- Contrato Marketing: todo deal criado no CRM é MQL (decisão de27/10).
-- SELECT somente ouro. Não exige passagem Novo MQL, capital ou status atual.
-- Um deal por conta; reciclagem não cria outro deal.
WITH atuais AS (
 SELECT DISTINCT ON (conta_id, negocio_id)
  conta_id, negocio_id, funil_id, nome_funil, marca,
  data_criacao_original, data_novo_mql, status_atual, carregado_em
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

), captacoes AS (
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

)
SELECT c.*, r.segmento AS segmento_crm, r.dia_criacao, r.dia_mql,
       r.data_mql_proveniencia,
       CASE WHEN r.negocio_id IS NOT NULL THEN true
            ELSE c.mql_captacao END AS mql_marketing,
       CASE WHEN r.negocio_id IS NOT NULL THEN 'deal_criado_crm'
            ELSE c.qualificacao_proveniencia END AS mql_marketing_proveniencia
FROM captacoes c
LEFT JOIN crm r ON r.negocio_id=c.negocio_id
-- CRM restringe a conta; não ligar por nome, capital ou proximidade de datas.
