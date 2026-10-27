WITH source AS (
-- Prévia somente leitura: campanhas candidatas; conciliação externa pendente, no único nível anúncio.
-- Não filtrar elegivel_kpi: conservar o estado de homologação para revisão.
WITH escopo(conta_id, campanha_id, plataforma, segmento) AS (
 VALUES
 ('24763396173316651','120249498633040752','meta','oral-unic'),
 ('24763396173316651','120246002967810752','meta','oral-unic'),
 ('9733883995','23324303426','google','oral-unic')
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
