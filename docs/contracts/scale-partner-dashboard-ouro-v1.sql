-- Somente views novas. Nenhum INSERT/UPDATE/DELETE em fatos.
CREATE VIEW ouro.vw_scale_partner_mql_comercial AS
WITH links AS (
 SELECT c.*, n.contato_key, n.contato_id, ct.nome contato_nome,
        em.email, ph.telefone,
        greatest(n.ultimo_observado_em,ct.ultimo_observado_em,em.ultimo_observado_em,ph.ultimo_observado_em) vinculo_observado_em
 FROM ouro.vw_scale_partner_ciclos c
 LEFT JOIN LATERAL (SELECT n0.* FROM prata.crm_negocio_contatos n0 WHERE n0.account_id=c.conta_id AND n0.negocio_id=c.negocio_id AND n0.api_version=(SELECT n1.api_version FROM prata.crm_negocio_contatos n1 WHERE n1.account_id=c.conta_id AND n1.negocio_id=c.negocio_id ORDER BY n1.ultimo_observado_em DESC,n1.api_version DESC LIMIT 1)) n ON true
 LEFT JOIN prata.crm_contatos ct ON ct.crm_key=n.contato_key AND ct.account_id=c.conta_id AND ct.api_version=n.api_version
 LEFT JOIN LATERAL (
   SELECT lower(trim(e.email)) email,e.ultimo_observado_em FROM prata.crm_contato_emails e
   WHERE e.parent_key=n.contato_key AND e.account_id=c.conta_id AND e.api_version=n.api_version AND nullif(trim(e.email),'') IS NOT NULL
   ORDER BY e.ordinal,e.crm_key LIMIT 1
 ) em ON true
 LEFT JOIN LATERAL (
   SELECT p.telefone,p.ultimo_observado_em FROM prata.crm_contato_telefones p
   WHERE p.parent_key=n.contato_key AND p.account_id=c.conta_id AND p.api_version=n.api_version AND nullif(trim(p.telefone),'') IS NOT NULL
   ORDER BY p.ordinal,p.crm_key LIMIT 1
 ) ph ON true
 WHERE c.data_novo_mql IS NOT NULL
)
SELECT 'partner-crm:'||md5(l.conta_id||':'||l.negocio_id||':'||l.ciclo::text||':'||coalesce(l.contato_key,'sem-vinculo')) id,
 l.conta_id,l.negocio_id id_deal,l.ciclo,l.contato_id,
 to_char(l.data_novo_mql AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') dia,
 'We Scale'::text marca,l.contato_nome nome,l.email,l.telefone,
 f.lead_uf uf,f.lead_cidade_texto cidade,l.utm_source,l.utm_medium,l.utm_campaign,
 f.lead_formulario_origem formulario,
 jsonb_build_object('lead_type','MQL','classification_source','CRM comercial ouro','utm_term',l.utm_term,'utm_content',l.utm_content,
  'capital',f.lead_capital_texto,'contrato_origem','scale_partner_mql_comercial_v1','data_referencia','data_novo_mql CRM em America/Sao_Paulo',
  'identidade_vinculada',l.contato_key IS NOT NULL) dados_extras,
 NULL::text row_hash,l.data_novo_mql criado_em,l.carregado_em ouro_carregado_em,l.vinculo_observado_em
FROM links l
LEFT JOIN LATERAL (
 SELECT f.lead_uf,f.lead_cidade_texto,f.lead_formulario_origem,f.lead_capital_texto
 FROM ouro.vw_leads_candidatos f
 WHERE f.marca IN('We Scale','Scale Partner') AND nullif(lower(trim(f.lead_email)),'')=l.email
 ORDER BY abs(extract(epoch FROM f.data_evento_em-l.data_novo_mql)),f.registro_key LIMIT 1
) f ON true
;

CREATE VIEW ouro.vw_scale_partner_dashboard_ciclos AS
SELECT c."negocio_ciclo_key",
 c."sistema_origem",
 c."conta_id",
 c."api_version",
 c."negocio_id",
 c."ciclo",
 c."tipo_ciclo",
 c."eh_reciclagem",
 c."eh_ciclo_atual",
 c."eh_estado_atual",
 c."nome_negociacao",
 c."marca_origem",
 c."marca",
 c."nome_funil",
 c."funil_id",
 c."id_etapa_atual",
 c."etapa_funil",
 c."etapa_canonica",
 c."status_atual",
 c."ganho_origem",
 c."pausado_origem",
 c."responsavel_id",
 c."responsavel_atual",
 c."nome_sdr",
 c."nome_closer",
 c."fonte_macro",
 c."sub_fonte_crm",
 c."utm_source",
 c."utm_medium",
 c."utm_campaign",
 c."utm_content",
 c."utm_term",
 coalesce(c.origem_comercial,CASE WHEN c.nome_funil='Prospecção Ativa' OR EXISTS(SELECT 1 FROM ouro.crm_eventos_negocio e WHERE e.conta_id=c.conta_id AND e.negocio_id=c.negocio_id AND e.nome_funil='Prospecção Ativa') THEN 'Prospecção Ativa' ELSE 'Inbound' END) AS origem_comercial,
 c."valor_produto",
 c."valor_contrato",
 c."quantidade_unidades",
 c."motivo_perda",
 c."data_criacao_original",
 c."data_fechamento_origem",
 c."data_venda",
 c."data_perdido",
 c."data_safra",
 c."data_novo_mql",
 c."data_tentando_contato",
 c."data_contato_efetivo",
 c."data_interesse_reuniao",
 c."data_conexao",
 c."data_agendamento_reuniao_sql",
 c."data_reuniao_realizada",
 c."data_no_show",
 c."data_sal",
 c."data_oportunidade",
 c."data_comite",
 c."data_pre_contrato",
 c."passagens_observadas",
 c."mql_primeira_passagem_em",
 c."sql_primeira_passagem_em",
 c."diagnostico_primeira_passagem_em",
 c."sal_primeira_passagem_em",
 c."contrato_origem",
 c."elegivel_kpi",
 c."motivo_nao_elegivel",
 c."origem_registro_key",
 c."origem_atualizada_em",
 c."origem_relacao",
 c."carregado_em",
 c."hash_registro",
 c."c7_ciclo_key",
 c."sdr_fonte",
 c."closer_fonte",
 c."quantidade_unidades_fonte",
 c."atribuicao_proveniencia",
 c."ciclo_comprovado",
 c."populacao_dashboard_completa",
 c."qualidade_ciclo",
 c."complementos_snapshot_sem_vigencia_historica",
 c."complementos_snapshot_proveniencia",
 c."contrato_consumo_partner",c.negocio_id id_lead,
 coalesce(o.data_criacao_negociacao,c.data_criacao_original) data_criacao_negociacao,c.sub_fonte_crm sub_fonte
 FROM ouro.vw_scale_partner_ciclos c LEFT JOIN ouro.negocios_ciclos_observados o ON o.negocio_ciclo_observado_key=c.c7_ciclo_key;

CREATE VIEW ouro.vw_scale_partner_dashboard_midia AS
SELECT registro_key id,to_char(data_evento,'YYYY-MM-DD') dia,'We Scale'::text marca,plataforma canal,
 campanha_nome campanha,grupo_nome conjunto,anuncio_nome anuncio,gasto spend_brl,
 impressoes,cliques_link,lpv,
 CASE WHEN impressoes>0 THEN gasto/impressoes*1000 END cpm,
 CASE WHEN cliques_link>0 THEN gasto/cliques_link END cpc,
 leads_plataforma leads,video_p50,video_thruplay,origem_atualizada_em criado_em,
 conta_id,campanha_id,grupo_id,anuncio_id,moeda,metricas_ausentes,carregado_em
FROM ouro.vw_midia_anuncio
WHERE marca IN('We Scale','Scale Partner') AND conta_id='655039566905092'
 AND data_evento>='2026-07-14' AND moeda='BRL';

CREATE VIEW ouro.vw_scale_partner_dashboard_identidades AS
SELECT DISTINCT negocio_id id_lead FROM ouro.negocios_ciclos
WHERE marca IN('We Scale','Scale Partner') AND conta_id='wescale_principal_crm'
UNION
SELECT negocio_id FROM ouro.vw_scale_partner_ciclos;

CREATE VIEW ouro.vw_scale_partner_dashboard_tarefas AS
WITH scoped AS (
 SELECT i.*,coalesce(i.tarefa_prazo_em_origem,(i.tarefa_prazo_data_local::text||'T'||coalesce(i.tarefa_prazo_hora_local::text,'00:00:00'))::timestamp AT TIME ZONE 'America/Sao_Paulo') prazo_efetivo
 FROM ouro.interacoes_comerciais i WHERE i.tipo_interacao='tarefa' AND EXISTS(
 SELECT 1 FROM ouro.vw_scale_partner_ciclos c WHERE c.conta_id=i.conta_id AND c.negocio_id=i.negocio_id)
)
SELECT i.id_origem task_id,i.tarefa_assunto subject,i.tarefa_notas notes,i.tarefa_tipo type,i.tarefa_concluida done,
 CASE WHEN i.tarefa_concluida THEN CASE WHEN i.tarefa_concluida_em>i.prazo_efetivo THEN 'concluida_atrasada' ELSE 'concluida_no_prazo' END
 WHEN i.prazo_efetivo<now() THEN 'atrasada' ELSE 'em_aberto' END status_calc,
 i.prazo_efetivo prazo,i.tarefa_concluida_em done_date,i.responsavel_nome user_name,i.negocio_id deal_id,i.origem_atualizada_em,i.carregado_em
FROM scoped i;

CREATE VIEW ouro.vw_scale_partner_dashboard_timeline AS
WITH entries AS (
 SELECT p.passagem_key id_evento,p.id_deal,p.ciclo,'mudanca_etapa'::text tipo_evento,
 p.nome_funil,p.id_etapa,coalesce(p.etapa_canonica,p.etapa_nome) nome_etapa,
 lag(coalesce(p.etapa_canonica,p.etapa_nome)) OVER(PARTITION BY p.id_deal,p.ciclo ORDER BY p.data_evento_em,p.passagem_key) nome_etapa_anterior,
 p.data_evento_em data_evento,NULL::text motivo_perda
 FROM ouro.vw_scale_partner_passagens p
 UNION ALL
 SELECT 'partner-ganho:'||c.negocio_ciclo_key,c.negocio_id,c.ciclo,'ganho',c.nome_funil,NULL,NULL,NULL,c.data_venda,NULL
 FROM ouro.vw_scale_partner_ciclos c WHERE c.status_atual='Ganho' AND c.data_venda IS NOT NULL
 UNION ALL
 SELECT 'partner-perda:'||c.negocio_ciclo_key,c.negocio_id,c.ciclo,'perda',c.nome_funil,NULL,NULL,NULL,c.data_perdido,c.motivo_perda
 FROM ouro.vw_scale_partner_ciclos c WHERE c.status_atual='Perdido' AND c.data_perdido IS NOT NULL
 UNION ALL
 SELECT 'partner-retomada:'||c.negocio_ciclo_key,c.negocio_id,c.ciclo,'deal_retomado',c.nome_funil,NULL,NULL,NULL,o.entrada_ciclo_observada,NULL
 FROM ouro.vw_scale_partner_ciclos c JOIN ouro.negocios_ciclos_observados o ON o.negocio_ciclo_observado_key=c.c7_ciclo_key
 WHERE c.eh_reciclagem AND o.entrada_ciclo_observada IS NOT NULL
)
SELECT id_evento,id_deal,tipo_evento,nome_funil,id_etapa,nome_etapa,nome_etapa_anterior,
 NULL::text responsavel,NULL::text valor_anterior,NULL::text valor_novo,data_evento,motivo_perda,NULL::text anotacao_perda
FROM entries;
