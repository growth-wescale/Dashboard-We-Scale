CREATE VIEW ouro.vw_scale_partner_ciclos AS
SELECT
 c."negocio_ciclo_key" AS "negocio_ciclo_key",
 c."sistema_origem" AS "sistema_origem",
 c."conta_id" AS "conta_id",
 c."api_version" AS "api_version",
 c."negocio_id" AS "negocio_id",
 c."ciclo" AS "ciclo",
 c."tipo_ciclo" AS "tipo_ciclo",
 c."eh_reciclagem" AS "eh_reciclagem",
 c."eh_ciclo_atual" AS "eh_ciclo_atual",
 c."eh_estado_atual" AS "eh_estado_atual",
 c."nome_negociacao" AS "nome_negociacao",
 c."marca_origem" AS "marca_origem",
 c."marca" AS "marca",
 c."nome_funil" AS "nome_funil",
 c."funil_id" AS "funil_id",
 c."id_etapa_atual" AS "id_etapa_atual",
 CASE WHEN c.id_etapa_atual='6a99b99218a2bb002df8ec61' AND c.funil_id='6a99b60d62f84e00234789da' THEN 'Reunião Agendada SQL' ELSE c."etapa_funil" END AS "etapa_funil",
 CASE WHEN c.id_etapa_atual='6a99b99218a2bb002df8ec61' AND c.funil_id='6a99b60d62f84e00234789da' THEN 'Reunião Agendada SQL' ELSE c."etapa_canonica" END AS "etapa_canonica",
 c."status_atual" AS "status_atual",
 c."ganho_origem" AS "ganho_origem",
 c."pausado_origem" AS "pausado_origem",
 c."responsavel_id" AS "responsavel_id",
 c."responsavel_atual" AS "responsavel_atual",
 c."nome_sdr" AS "nome_sdr",
 c."nome_closer" AS "nome_closer",
 c."fonte_macro" AS "fonte_macro",
 c."sub_fonte_crm" AS "sub_fonte_crm",
 c."utm_source" AS "utm_source",
 c."utm_medium" AS "utm_medium",
 c."utm_campaign" AS "utm_campaign",
 c."utm_content" AS "utm_content",
 c."utm_term" AS "utm_term",
 c."origem_comercial" AS "origem_comercial",
 c."valor_produto" AS "valor_produto",
 c."valor_contrato" AS "valor_contrato",
 c."quantidade_unidades" AS "quantidade_unidades",
 c."motivo_perda" AS "motivo_perda",
 c."data_criacao_original" AS "data_criacao_original",
 c."data_fechamento_origem" AS "data_fechamento_origem",
 c."data_venda" AS "data_venda",
 c."data_perdido" AS "data_perdido",
 c."data_safra" AS "data_safra",
 c."data_novo_mql" AS "data_novo_mql",
 c."data_tentando_contato" AS "data_tentando_contato",
 c."data_contato_efetivo" AS "data_contato_efetivo",
 c."data_interesse_reuniao" AS "data_interesse_reuniao",
 c."data_conexao" AS "data_conexao",
 c."data_agendamento_reuniao_sql" AS "data_agendamento_reuniao_sql",
 c."data_reuniao_realizada" AS "data_reuniao_realizada",
 c."data_no_show" AS "data_no_show",
 c."data_sal" AS "data_sal",
 c."data_oportunidade" AS "data_oportunidade",
 c."data_comite" AS "data_comite",
 c."data_pre_contrato" AS "data_pre_contrato",
 c."passagens_observadas" AS "passagens_observadas",
 c."mql_primeira_passagem_em" AS "mql_primeira_passagem_em",
 c."sql_primeira_passagem_em" AS "sql_primeira_passagem_em",
 c."diagnostico_primeira_passagem_em" AS "diagnostico_primeira_passagem_em",
 c."sal_primeira_passagem_em" AS "sal_primeira_passagem_em",
 c."contrato_origem" AS "contrato_origem",
 c."elegivel_kpi" AS "elegivel_kpi",
 c."motivo_nao_elegivel" AS "motivo_nao_elegivel",
 c."origem_registro_key" AS "origem_registro_key",
 c."origem_atualizada_em" AS "origem_atualizada_em",
 c."origem_relacao" AS "origem_relacao",
 c."carregado_em" AS "carregado_em",
 c."hash_registro" AS "hash_registro",
 c."c7_ciclo_key" AS "c7_ciclo_key",
 c."sdr_fonte" AS "sdr_fonte",
 c."closer_fonte" AS "closer_fonte",
 c."quantidade_unidades_fonte" AS "quantidade_unidades_fonte",
 c."atribuicao_proveniencia" AS "atribuicao_proveniencia",
 c."ciclo_comprovado" AS "ciclo_comprovado",
 c."populacao_dashboard_completa" AS "populacao_dashboard_completa",
 c."qualidade_ciclo" AS "qualidade_ciclo",
 c."complementos_snapshot_sem_vigencia_historica" AS "complementos_snapshot_sem_vigencia_historica",
 c."complementos_snapshot_proveniencia" AS "complementos_snapshot_proveniencia",
 'scale_partner_funil_v1'::text AS contrato_consumo_partner
FROM ouro.negocios_ciclos_dashboard c
WHERE c.conta_id='wescale_principal_crm' AND c.marca IN ('Scale Partner','We Scale')
 AND c.nome_funil IN ('SDR','Closer','Prospecção Ativa','Odonto Scale','Odonto Legacy','Scale Partner','Eventos')
 AND c.status_atual IS DISTINCT FROM 'Excluído'
 AND NOT EXISTS(SELECT 1 FROM ouro.negocios_ciclos s WHERE s.conta_id=c.conta_id AND s.negocio_id=c.negocio_id AND 'nome_teste_excluido_no_dashboard'=ANY(s.motivo_nao_elegivel))
;
CREATE VIEW ouro.vw_scale_partner_passagens AS
WITH ciclos AS MATERIALIZED (SELECT * FROM ouro.vw_scale_partner_ciclos
), observacoes AS MATERIALIZED (
 SELECT e.*
 FROM ouro.crm_eventos_negocio e
 JOIN ciclos c ON c.conta_id=e.conta_id AND c.negocio_id=e.negocio_id
   AND c.ciclo=e.numero_ciclo_dashboard_observado
 WHERE e.tipo_evento='mudanca_etapa'
   AND e.admitido_regra_temporal_dashboard
   AND e.etapa_id IS NOT NULL AND e.funil_id IS NOT NULL
), historico_ordenado AS (
 SELECT e.*,lag(jsonb_build_array(numero_ciclo_dashboard_observado,etapa_id,funil_id))
 OVER(PARTITION BY conta_id,negocio_id ORDER BY data_evento_em,evento_negocio_key) anterior
 FROM observacoes e WHERE origem_relacao='prata.crm_negocio_historico_etapas'
), historico_entradas AS MATERIALIZED (
 SELECT * FROM historico_ordenado
 WHERE anterior IS DISTINCT FROM jsonb_build_array(numero_ciclo_dashboard_observado,etapa_id,funil_id)
), intervalos_historico AS MATERIALIZED (
 SELECT h.*,lead(data_evento_em) OVER(PARTITION BY conta_id,negocio_id ORDER BY data_evento_em,evento_negocio_key) proxima_entrada
 FROM historico_entradas h
), nativos_sem_intervalo AS MATERIALIZED (
 SELECT e.* FROM observacoes e
 WHERE e.origem_relacao='prata.rdcrm_native_transition' AND e.origem_pk LIKE '%:stage_changed'
 AND NOT EXISTS (
   SELECT 1 FROM intervalos_historico h
   WHERE h.conta_id=e.conta_id AND h.negocio_id=e.negocio_id
     AND h.numero_ciclo_dashboard_observado=e.numero_ciclo_dashboard_observado
     AND h.etapa_id=e.etapa_id AND h.funil_id=e.funil_id
     AND ((e.data_evento_em>=h.data_evento_em AND (h.proxima_entrada IS NULL OR e.data_evento_em<h.proxima_entrada))
       OR date_trunc('second',e.data_evento_em)=date_trunc('second',h.data_evento_em))
 )
), suplementos AS (
 SELECT e.*
 FROM observacoes e JOIN ciclos c ON c.conta_id=e.conta_id AND c.negocio_id=e.negocio_id
   AND c.ciclo=e.numero_ciclo_dashboard_observado
 WHERE e.origem_relacao IN ('prata.crm_eventos_historicos_importados','prata.rdcrm_native_transition')
   AND NOT EXISTS (
     SELECT 1 FROM intervalos_historico h
     WHERE h.conta_id=e.conta_id AND h.negocio_id=e.negocio_id
       AND h.numero_ciclo_dashboard_observado=e.numero_ciclo_dashboard_observado
       AND h.etapa_id=e.etapa_id AND h.funil_id=e.funil_id
       AND ((e.data_evento_em>=h.data_evento_em
         AND (h.proxima_entrada IS NULL OR e.data_evento_em<h.proxima_entrada))
         OR (e.origem_relacao='prata.rdcrm_native_transition'
           AND date_trunc('second',e.data_evento_em)=date_trunc('second',h.data_evento_em)))
       AND NOT (e.origem_relacao='prata.rdcrm_native_transition' AND e.origem_pk LIKE '%:stage_changed'
         AND EXISTS(SELECT 1 FROM nativos_sem_intervalo n
           WHERE n.conta_id=e.conta_id AND n.negocio_id=e.negocio_id
             AND n.numero_ciclo_dashboard_observado=e.numero_ciclo_dashboard_observado
             AND (n.etapa_id,n.funil_id) IS DISTINCT FROM (e.etapa_id,e.funil_id)
             AND n.data_evento_em>h.data_evento_em AND n.data_evento_em<e.data_evento_em))
   )
   AND (e.origem_relacao<>'prata.rdcrm_native_transition'
     OR e.origem_pk NOT LIKE '%:initial_stage'
     OR date_trunc('second',e.data_evento_em)=date_trunc('second',c.data_criacao_original))
), candidatos AS (
 SELECT e.* FROM observacoes e JOIN historico_entradas h USING(evento_negocio_key)
 UNION ALL
 SELECT * FROM suplementos
), sequencia AS (
 SELECT e.*,lag(jsonb_build_array(numero_ciclo_dashboard_observado,etapa_id,funil_id))
 OVER(PARTITION BY conta_id,negocio_id ORDER BY data_evento_em,evento_negocio_key) anterior
 FROM candidatos e
)
SELECT 'scale_partner_passagens_v1:'||evento_negocio_key AS passagem_key,
 conta_id,negocio_id AS id_deal,numero_ciclo_dashboard_observado AS ciclo,
 data_evento_em,
 to_char(data_evento_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia,
 etapa_id AS id_etapa,funil_id AS id_funil,etapa_nome,etapa_canonica,nome_funil,
 marca_dashboard AS marca_deal,origem_relacao,origem_pk,prova_evento,
 evento_negocio_key AS observacao_origem_key,
 snapshot_atual_observado_em,carregado_em,
 'scale_partner_passagens_v1;entrada_distinta_em_etapa;dia_brt_texto'::text AS contrato_origem,
 false AS populacao_historica_global_certificada
FROM sequencia
WHERE anterior IS DISTINCT FROM jsonb_build_array(numero_ciclo_dashboard_observado,etapa_id,funil_id)
  AND etapa_canonica IS NOT NULL
;
