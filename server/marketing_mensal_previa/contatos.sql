WITH negocios AS MATERIALIZED (/* negocios.sql */), origem AS (
 SELECT DISTINCT ON (d.conta_id,d.negocio_id) d.*,n.crm_key,n.api_version
 FROM negocios d JOIN prata.crm_negocios n ON n.account_id=d.conta_id AND n.id_origem=d.negocio_id
 WHERE NOT n.apenas_identificador AND d.marca IN ('Eletrovias','Oral Unic','Lisô Laser','Beauty Connection','Odonto Scale')
 ORDER BY d.conta_id,d.negocio_id,n.ultimo_observado_em DESC NULLS LAST,n.api_version DESC,n.crm_key
)
SELECT DISTINCT ON (o.conta_id,o.negocio_id,v.contato_id)
 'crm-contact:'||o.negocio_id||':'||v.contato_id AS id,o.dia,o.marca,c.nome,e.email,t.telefone,
 NULL::text AS uf,NULL::text AS cidade,NULL::text AS formulario,o.utm_source,o.utm_medium,o.utm_campaign,o.criado_em,NULL::text AS row_hash,
 jsonb_build_object('metric_grain','contact_only','id_deal',o.negocio_id,'contato_id',v.contato_id,
   'segmento',CASE WHEN o.marca='Oral Unic' THEN 'oral-unic' WHEN o.marca='Beauty Connection' THEN 'beauty' END) AS dados_extras
FROM origem o JOIN prata.crm_negocio_contatos v ON v.negocio_key=o.crm_key AND v.account_id=o.conta_id AND v.api_version=o.api_version
JOIN prata.crm_contatos c ON c.crm_key=v.contato_key AND c.account_id=v.account_id AND c.api_version=v.api_version
LEFT JOIN LATERAL (SELECT email FROM prata.crm_contato_emails WHERE parent_key=c.crm_key AND account_id=c.account_id AND api_version=c.api_version AND nullif(trim(email),'') IS NOT NULL ORDER BY ordinal,crm_key LIMIT 1) e ON true
LEFT JOIN LATERAL (SELECT telefone FROM prata.crm_contato_telefones WHERE parent_key=c.crm_key AND account_id=c.account_id AND api_version=c.api_version AND nullif(trim(telefone),'') IS NOT NULL ORDER BY ordinal,crm_key LIMIT 1) t ON true
WHERE v.contato_id IS NOT NULL AND (e.email IS NOT NULL OR t.telefone IS NOT NULL)
ORDER BY o.conta_id,o.negocio_id,v.contato_id,v.crm_key
