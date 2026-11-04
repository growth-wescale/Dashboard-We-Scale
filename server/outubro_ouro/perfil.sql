-- Prévia da projeção de leitura para a ouro. O marcador recebe o SELECT local de negocios.sql.
WITH negocios AS MATERIALIZED (
  /* negocios.sql */
), origem AS MATERIALIZED (
  SELECT DISTINCT ON (d.conta_id, d.negocio_id)
    d.conta_id, d.negocio_id, n.crm_key, n.api_version
  FROM negocios d
  JOIN prata.crm_negocios n ON n.account_id = d.conta_id AND n.id_origem = d.negocio_id
  WHERE NOT n.apenas_identificador
  ORDER BY d.conta_id, d.negocio_id, n.ultimo_observado_em DESC NULLS LAST, n.api_version DESC, n.crm_key
), contatos AS (
  SELECT o.conta_id, o.negocio_id, count(DISTINCT v.contato_id) AS contatos_vinculados
  FROM origem o
  JOIN prata.crm_negocio_contatos v
    ON v.account_id = o.conta_id AND v.api_version = o.api_version AND v.negocio_key = o.crm_key
  WHERE nullif(v.contato_id, '') IS NOT NULL
  GROUP BY o.conta_id, o.negocio_id
), valores AS (
  SELECT o.conta_id, o.negocio_id, f.nome,
    coalesce(nullif(trim(c.valor_texto), ''), c.valor_numero::text) AS valor
  FROM origem o
  JOIN prata.crm_negocio_campos c
    ON c.account_id = o.conta_id AND c.api_version = o.api_version AND c.parent_key = o.crm_key
  JOIN prata.crm_campos_definicoes f
    ON f.account_id = c.account_id AND f.api_version = c.api_version AND f.crm_key = c.definicao_key
  WHERE f.entidade = 'deal' AND f.nome IN ('Capital Disponível', 'Estado')
), unicos AS (
  SELECT conta_id, negocio_id, nome,
    CASE WHEN count(DISTINCT valor) = 1 THEN min(valor) END AS valor
  FROM valores
  GROUP BY conta_id, negocio_id, nome
)
SELECT d.*, coalesce(v.contatos_vinculados, 0) AS contatos_vinculados, c.valor AS capital,
  CASE
    WHEN upper(e.valor) IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') THEN upper(e.valor)
    WHEN lower(e.valor) IN ('são paulo','sao paulo') THEN 'SP'
  END AS uf
FROM negocios d
LEFT JOIN contatos v USING (conta_id, negocio_id)
LEFT JOIN unicos c ON c.conta_id = d.conta_id AND c.negocio_id = d.negocio_id AND c.nome = 'Capital Disponível'
LEFT JOIN unicos e ON e.conta_id = d.conta_id AND e.negocio_id = d.negocio_id AND e.nome = 'Estado'
