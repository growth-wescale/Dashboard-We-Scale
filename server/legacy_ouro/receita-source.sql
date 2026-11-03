-- Uma linha por venda (conta/ID). Um novo ciclo ou múltiplos itens não multiplicam o contrato.
WITH atuais AS MATERIALIZED (
 SELECT DISTINCT ON (conta_id,negocio_id) conta_id,negocio_id,api_version,marca,status_atual,data_venda,valor_contrato,sub_fonte_crm,carregado_em
 FROM ouro.negocios_ciclos_dashboard WHERE conta_id='wescale_principal_crm'
 ORDER BY conta_id,negocio_id,eh_ciclo_atual DESC NULLS LAST,eh_estado_atual DESC NULLS LAST,ciclo DESC,carregado_em DESC,negocio_ciclo_key
), ganhos AS (
 SELECT *, lower(coalesce(marca,'')) IN ('odonto scale','odonto legacy','odontoclub','odonto club') AS marca_legacy
 FROM atuais WHERE status_atual='Ganho' AND data_venda>='2026-01-01 00:00-03'
), itens AS (
 SELECT g.*, f.nome AS fonte, p.nome produto,p.total_item,
   lower(trim(p.nome)) ~ '^(odonto ?club|odonto legacy|odonto scale)( |$)' AS produto_legacy
 FROM ganhos g
 LEFT JOIN prata.crm_negocios origem ON origem.id_origem=g.negocio_id AND origem.account_id=g.conta_id AND origem.api_version=g.api_version
 LEFT JOIN prata.crm_fontes f ON f.crm_key=origem.fonte_key
 LEFT JOIN prata.crm_negocio_produtos p ON p.account_id=g.conta_id AND p.negocio_id=g.negocio_id AND p.api_version=g.api_version
), grupos AS (
 SELECT conta_id,negocio_id,data_venda,fonte,carregado_em,valor_contrato,marca_legacy,
   coalesce(nullif(trim(produto),''),'Produto não informado') AS produto,
   CASE WHEN count(*)=count(total_item) THEN sum(total_item) END AS valor_itens
 FROM itens WHERE marca_legacy OR produto_legacy
 GROUP BY conta_id,negocio_id,data_venda,fonte,carregado_em,valor_contrato,marca_legacy,coalesce(nullif(trim(produto),''),'Produto não informado')
)
SELECT conta_id||':'||negocio_id AS id,'Odonto Scale'::text AS marca,
 to_char(data_venda AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') dia,fonte,carregado_em,
 CASE WHEN marca_legacy THEN valor_contrato WHEN count(*)=count(valor_itens) THEN sum(valor_itens) END AS valor,
 jsonb_agg(jsonb_build_object('nome',produto,'valor',valor_itens) ORDER BY produto) produtos
FROM grupos GROUP BY conta_id,negocio_id,data_venda,fonte,carregado_em,valor_contrato,marca_legacy
