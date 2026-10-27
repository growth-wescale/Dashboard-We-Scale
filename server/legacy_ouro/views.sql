BEGIN;
CREATE VIEW ouro.vw_legacy_dashboard_leads AS
-- Projeção de leitura; expõe vínculo de contato na ouro. Não altera fatos.
WITH profiles AS MATERIALIZED (
 SELECT * FROM ouro.vw_leads_candidatos WHERE lead_event_identifier IN (
 'odontolegacy_multistep','odontoscale_multistep','RD Station CRM',
 'Oral Unic Franquias - OdontoLegacy I Condicional','Oral Unic Franquias - Odonto Legacy I Condicional - MQL 03/09/26')
), latest_profile AS MATERIALIZED (
 SELECT DISTINCT ON (lower(trim(lead_email))) lower(trim(lead_email)) email,lead_uf,lead_cidade_texto,lead_formulario_origem,lead_capital_texto
 FROM profiles WHERE lead_event_identifier <> 'RD Station CRM' AND nullif(trim(lead_email),'') IS NOT NULL
 ORDER BY lower(trim(lead_email)),data_evento_em DESC,registro_key
), crm_all AS MATERIALIZED (
-- Contrato Marketing: todo deal criado no CRM é MQL (decisão de27/10).
-- SELECT somente ouro. Não exige passagem Novo MQL, capital ou status atual.
-- Um deal por conta; reciclagem não cria outro deal.
WITH atuais AS (
 SELECT DISTINCT ON (conta_id, negocio_id)
  conta_id, negocio_id, funil_id, nome_funil, marca,
  data_criacao_original, data_novo_mql, status_atual, carregado_em,
  utm_source,utm_medium,utm_campaign,utm_content,utm_term
 FROM ouro.negocios_ciclos_dashboard
 WHERE conta_id = 'wescale_principal_crm'
 ORDER BY conta_id, negocio_id, eh_ciclo_atual DESC NULLS LAST,
          eh_estado_atual DESC NULLS LAST, ciclo DESC, carregado_em DESC,
          negocio_ciclo_key
)
SELECT *, true AS mql_comercial, 'deal_criado_crm'::text AS qualificacao_proveniencia,
 'legacy'::text AS segmento,
 to_char(data_criacao_original AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia_criacao,
 -- Data MQL existente preservada; ausência não desqualifica deal.
 to_char(coalesce(data_novo_mql,data_criacao_original) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia_mql,
 CASE WHEN data_novo_mql IS NOT NULL THEN 'data_mql_crm'
      ELSE 'criacao_crm' END AS data_mql_proveniencia
FROM atuais
-- A qualificação pode vir de um negócio anterior ao mês da captação.
-- O recorte de exibição permanece nos SELECTs finais, sem mudar as datas.
WHERE marca IN ('Odonto Scale','Odonto Legacy') AND funil_id IN ('69380917e00ed10014daaa62','69380937219fc3001702b9b5')

), crm AS MATERIALIZED (
 -- Detalhes completos só dos negócios exibidos; qualificação histórica separada.
 SELECT * FROM crm_all
 WHERE coalesce(data_novo_mql,data_criacao_original) >= '2026-10-01 00:00:00-03'
  AND coalesce(data_novo_mql,data_criacao_original) < '2026-11-01 00:00:00-03'
), source_links AS MATERIALIZED (
 SELECT n.*,first_value(n.api_version) OVER (
  PARTITION BY n.account_id,n.negocio_id ORDER BY n.ultimo_observado_em DESC,n.api_version DESC) latest_api_version
 FROM prata.crm_negocio_contatos n JOIN crm_all c ON c.conta_id=n.account_id AND c.negocio_id=n.negocio_id
), qualification_links AS MATERIALIZED (
 -- Mesmo primeiro email/vínculo da projeção, sem buscar telefone/perfil de todo o histórico.
 SELECT DISTINCT ON (c.conta_id,c.negocio_id,n.contato_id)
  c.negocio_id,c.segmento,lower(trim(e.email)) AS email
 FROM crm_all c
 LEFT JOIN source_links n ON n.account_id=c.conta_id AND n.negocio_id=c.negocio_id
  AND n.api_version=n.latest_api_version
 LEFT JOIN prata.crm_contato_emails e ON e.parent_key=n.contato_key AND e.account_id=c.conta_id AND e.api_version=n.api_version
  AND nullif(trim(e.email),'') IS NOT NULL
 ORDER BY c.conta_id,c.negocio_id,n.contato_id,e.ordinal,e.crm_key
), links AS MATERIALIZED (
 SELECT c.*,n.contato_id,ct.nome,email.email,phone.telefone
 FROM crm c
 LEFT JOIN source_links n ON n.account_id=c.conta_id AND n.negocio_id=c.negocio_id AND n.api_version=n.latest_api_version
 LEFT JOIN prata.crm_contatos ct ON ct.crm_key=n.contato_key AND ct.account_id=c.conta_id AND ct.api_version=n.api_version
 LEFT JOIN LATERAL (SELECT lower(trim(e.email)) email FROM prata.crm_contato_emails e
  WHERE e.parent_key=n.contato_key AND e.account_id=c.conta_id AND e.api_version=n.api_version
   AND nullif(trim(e.email),'') IS NOT NULL ORDER BY e.ordinal,e.crm_key LIMIT 1) email ON true
 LEFT JOIN LATERAL (SELECT p.telefone FROM prata.crm_contato_telefones p
  WHERE p.parent_key=n.contato_key AND p.account_id=c.conta_id AND p.api_version=n.api_version
   AND nullif(trim(p.telefone),'') IS NOT NULL ORDER BY p.ordinal,p.crm_key LIMIT 1) phone ON true
), commercial AS (
 SELECT 'legacy-crm:'||md5(conta_id||':'||negocio_id||':'||coalesce(contato_id,'sem-vinculo')) AS id,
  dia_mql AS dia,'Odonto Scale'::text AS marca,
  l.nome,l.email,l.telefone,f.lead_uf AS uf,f.lead_cidade_texto AS cidade,
  l.utm_source,l.utm_medium,l.utm_campaign,f.lead_formulario_origem AS formulario,
  jsonb_build_object('lead_type','MQL','classification_source','deal_criado_crm',
   'utm_content',l.utm_content,'utm_term',l.utm_term,'capital',f.lead_capital_texto,
   'id_deal',negocio_id,'contato_id',contato_id,'segmento',segmento,
   'data_criacao_crm',data_criacao_original,'data_referencia',data_mql_proveniencia) AS dados_extras,
  NULL::text AS row_hash,coalesce(data_novo_mql,data_criacao_original) AS criado_em,
  l.contato_id,l.carregado_em
 FROM links l
 LEFT JOIN latest_profile f ON f.email=l.email
), captures AS (
 SELECT registro_key AS id,to_char(data_evento,'YYYY-MM-DD') AS dia,'Odonto Scale'::text AS marca,
  lead_nome AS nome,lead_email AS email,coalesce(lead_telefone_movel,lead_telefone_pessoal) AS telefone,
  lead_uf AS uf,lead_cidade_texto AS cidade,lead_utm_source AS utm_source,lead_utm_medium AS utm_medium,
  lead_utm_campaign AS utm_campaign,lead_formulario_origem AS formulario,
  jsonb_build_object('lead_type',CASE WHEN EXISTS(SELECT 1 FROM qualification_links l WHERE l.segmento='legacy' AND (l.negocio_id=f.negocio_id OR (nullif(lower(trim(f.lead_email)),'') IS NOT NULL AND lower(trim(f.lead_email))=l.email))) THEN 'MQL' WHEN lead_mql_observado THEN 'MQL' WHEN lead_mql_observado=false THEN 'LEAD' ELSE NULL END,
   'classification_source',lead_classificacao_origem,'segmento','legacy',
   'utm_content',lead_utm_content,'utm_term',lead_utm_term,'capital',lead_capital_texto) AS dados_extras,
  NULL::text AS row_hash,data_evento_em AS criado_em,lead_contato_id AS contato_id,carregado_em
 FROM profiles f
 WHERE ((marca IN ('Odonto Scale','Odonto Legacy') AND lead_event_identifier IN ('odontolegacy_multistep','odontoscale_multistep','RD Station CRM')) OR lead_event_identifier IN ('Oral Unic Franquias - OdontoLegacy I Condicional','Oral Unic Franquias - Odonto Legacy I Condicional - MQL 03/09/26'))
 AND NOT EXISTS(SELECT 1 FROM links c WHERE c.segmento='legacy' AND c.dia_mql>='2026-10-01' AND c.dia_mql<'2026-11-01' AND (
  f.negocio_id=c.negocio_id OR (nullif(lower(trim(f.lead_email)),'') IS NOT NULL AND lower(trim(f.lead_email))=c.email)))
)
SELECT * FROM commercial WHERE dia>='2026-10-01' AND dia<'2026-11-01'
UNION ALL
SELECT * FROM captures WHERE dia>='2026-10-01' AND dia<'2026-11-01';

CREATE VIEW ouro.vw_legacy_dashboard_midia AS
WITH source AS (
-- Prévia somente leitura: campanhas homologadas, no único nível anúncio.
-- Não filtrar elegivel_kpi: conservar o estado de homologação para revisão.
WITH escopo(conta_id, campanha_id, plataforma, segmento) AS (
 VALUES
 ('24763396173316651','120248355011530752','meta','legacy'),
 ('9733883995','24054007136','google','legacy'),
 ('9733883995','24054143009','google','legacy')
)
SELECT m.registro_key, m.data_evento, e.segmento,
 m.plataforma, m.conta_id, m.campanha_id, m.campanha_nome,
 m.grupo_id, m.grupo_nome, m.anuncio_id, m.anuncio_nome,
 m.moeda, m.fuso_horario, m.gasto, m.impressoes,
 m.cliques_total, m.cliques_link, m.lpv, m.leads_plataforma,
 m.lpv_presente, m.leads_presente, m.metricas_ausentes, m.video_p50, m.video_thruplay,
 m.elegivel_kpi, m.motivo_nao_elegivel, m.carregado_em
FROM ouro.vw_midia_anuncio m
JOIN escopo e USING (conta_id, campanha_id, plataforma)
WHERE m.nivel_midia = 'anuncio'
-- Moeda/valores inválidos ficam visíveis para rejeição; nunca viram zero.

)
SELECT registro_key AS id,to_char(data_evento,'YYYY-MM-DD') AS dia,
 'Oral Unic'::text AS marca,
 plataforma AS canal,campanha_nome AS campanha,grupo_nome AS conjunto,anuncio_nome AS anuncio,
 gasto AS spend_brl,impressoes,cliques_link,lpv,leads_plataforma AS leads,
 CASE WHEN impressoes>0 THEN gasto/impressoes*1000 END AS cpm,
 CASE WHEN cliques_link>0 THEN gasto/cliques_link END AS cpc,
 video_p50,video_thruplay,carregado_em AS criado_em,
 conta_id,campanha_id,grupo_id,anuncio_id,moeda,metricas_ausentes,carregado_em
FROM source WHERE data_evento>='2026-10-01' AND data_evento<'2026-11-01';

REVOKE ALL ON ouro.vw_legacy_dashboard_leads,ouro.vw_legacy_dashboard_midia FROM PUBLIC;
COMMIT;
