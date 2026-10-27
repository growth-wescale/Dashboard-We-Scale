-- Instalação de contrato de leitura; nenhuma alteração em fatos.
-- Executar somente em revisão controlada. Aplicativo consulta apenas ouro.
BEGIN;
CREATE VIEW ouro.vw_liso_beauty_dashboard_leads AS
WITH crm AS (
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

), links AS (
 SELECT c.*,n.contato_id,ct.nome,email.email,phone.telefone
 FROM crm c
 LEFT JOIN LATERAL (
  SELECT n0.* FROM prata.crm_negocio_contatos n0
  WHERE n0.account_id=c.conta_id AND n0.negocio_id=c.negocio_id
   AND n0.api_version=(SELECT n1.api_version FROM prata.crm_negocio_contatos n1
    WHERE n1.account_id=c.conta_id AND n1.negocio_id=c.negocio_id
    ORDER BY n1.ultimo_observado_em DESC,n1.api_version DESC LIMIT 1)
 ) n ON true
 LEFT JOIN prata.crm_contatos ct ON ct.crm_key=n.contato_key AND ct.account_id=c.conta_id AND ct.api_version=n.api_version
 LEFT JOIN LATERAL (SELECT lower(trim(e.email)) email FROM prata.crm_contato_emails e
  WHERE e.parent_key=n.contato_key AND e.account_id=c.conta_id AND e.api_version=n.api_version
   AND nullif(trim(e.email),'') IS NOT NULL ORDER BY e.ordinal,e.crm_key LIMIT 1) email ON true
 LEFT JOIN LATERAL (SELECT p.telefone FROM prata.crm_contato_telefones p
  WHERE p.parent_key=n.contato_key AND p.account_id=c.conta_id AND p.api_version=n.api_version
   AND nullif(trim(p.telefone),'') IS NOT NULL ORDER BY p.ordinal,p.crm_key LIMIT 1) phone ON true
), commercial AS (
 SELECT 'liso-crm:'||md5(conta_id||':'||negocio_id||':'||coalesce(contato_id,'sem-vinculo')) AS id,
  dia_mql AS dia,CASE WHEN segmento='beauty' THEN 'Beauty Connection' ELSE 'Lisô Laser' END AS marca,
  l.nome,l.email,l.telefone,f.lead_uf AS uf,f.lead_cidade_texto AS cidade,
  l.utm_source,l.utm_medium,l.utm_campaign,f.lead_formulario_origem AS formulario,
  jsonb_build_object('lead_type','MQL','classification_source','deal_criado_crm',
   'id_deal',negocio_id,'contato_id',contato_id,'segmento',segmento,
   'data_criacao_crm',data_criacao_original,'data_referencia',data_mql_proveniencia) AS dados_extras,
  NULL::text AS row_hash,coalesce(data_novo_mql,data_criacao_original) AS criado_em,
  l.contato_id,l.carregado_em
 FROM links l
 LEFT JOIN LATERAL (
  SELECT f0.lead_uf,f0.lead_cidade_texto,f0.lead_formulario_origem FROM ouro.vw_leads_candidatos f0
  WHERE nullif(lower(trim(f0.lead_email)),'')=l.email
   AND f0.lead_event_identifier=CASE WHEN l.segmento='beauty' THEN 'beautyconnection_multistep' ELSE 'lisolaser_multistep' END
  ORDER BY f0.data_evento_em DESC,f0.registro_key LIMIT 1
 ) f ON true
), captures AS (
 SELECT registro_key AS id,to_char(data_evento,'YYYY-MM-DD') AS dia,'Lisô Laser'::text AS marca,
  lead_nome AS nome,lead_email AS email,coalesce(lead_telefone_movel,lead_telefone_pessoal) AS telefone,
  lead_uf AS uf,lead_cidade_texto AS cidade,lead_utm_source AS utm_source,lead_utm_medium AS utm_medium,
  lead_utm_campaign AS utm_campaign,lead_formulario_origem AS formulario,
  jsonb_build_object('lead_type',CASE WHEN EXISTS(SELECT 1 FROM links l WHERE l.segmento='liso' AND (l.negocio_id=f.negocio_id OR (nullif(lower(trim(f.lead_email)),'') IS NOT NULL AND lower(trim(f.lead_email))=l.email))) THEN 'MQL' WHEN lead_mql_observado THEN 'MQL' WHEN lead_mql_observado=false THEN 'LEAD' ELSE NULL END,
   'classification_source',lead_classificacao_origem,'segmento','liso') AS dados_extras,
  NULL::text AS row_hash,data_evento_em AS criado_em,lead_contato_id AS contato_id,carregado_em
 FROM ouro.vw_leads_candidatos f
 WHERE marca='Lisô Laser' AND lead_event_identifier='lisolaser_multistep'
 AND NOT EXISTS(SELECT 1 FROM links c WHERE c.segmento='liso' AND c.dia_mql>='2026-10-01' AND c.dia_mql<'2026-11-01' AND (
  f.negocio_id=c.negocio_id OR (nullif(lower(trim(f.lead_email)),'') IS NOT NULL AND lower(trim(f.lead_email))=c.email)))
)
SELECT * FROM commercial WHERE dia>='2026-10-01' AND dia<'2026-11-01'
UNION ALL
SELECT * FROM captures WHERE dia>='2026-10-01' AND dia<'2026-11-01';

CREATE VIEW ouro.vw_liso_beauty_dashboard_midia AS
WITH source AS (
-- Prévia somente leitura: campanhas homologadas, no único nível anúncio.
-- Não filtrar elegivel_kpi: conservar o estado de homologação para revisão.
WITH escopo(conta_id, campanha_id, plataforma, segmento) AS (
 VALUES
 ('1923360421973366','120249196601180044','meta','liso'),
 ('655039566905092','120250473527040783','meta','beauty'),
 ('9186518266','23604680552','google','liso'),
 ('9186518266','24118318500','google','liso')
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
 CASE WHEN segmento='beauty' THEN 'Beauty Connection' ELSE 'Lisô Laser' END AS marca,
 plataforma AS canal,campanha_nome AS campanha,grupo_nome AS conjunto,anuncio_nome AS anuncio,
 gasto AS spend_brl,impressoes,cliques_link,lpv,leads_plataforma AS leads,
 CASE WHEN impressoes>0 THEN gasto/impressoes*1000 END AS cpm,
 CASE WHEN cliques_link>0 THEN gasto/cliques_link END AS cpc,
 video_p50,video_thruplay,carregado_em AS criado_em,
 conta_id,campanha_id,grupo_id,anuncio_id,moeda,metricas_ausentes,carregado_em
FROM source WHERE data_evento>='2026-10-01' AND data_evento<'2026-11-01';

-- Provisionar senha fora do Git. Nenhum acesso a fatos ou schemas de origem.
CREATE ROLE dashboard_liso_ro LOGIN NOINHERIT CONNECTION LIMIT 5;
ALTER ROLE dashboard_liso_ro SET default_transaction_read_only=on;
REVOKE ALL ON ouro.vw_liso_beauty_dashboard_leads,ouro.vw_liso_beauty_dashboard_midia FROM PUBLIC;
GRANT CONNECT ON DATABASE oralunic_dw TO dashboard_liso_ro;
GRANT USAGE ON SCHEMA ouro TO dashboard_liso_ro;
GRANT SELECT ON ouro.vw_liso_beauty_dashboard_leads,ouro.vw_liso_beauty_dashboard_midia TO dashboard_liso_ro;

COMMIT;
