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
 m.lpv_presente, m.leads_presente, m.metricas_ausentes,
 m.elegivel_kpi, m.motivo_nao_elegivel, m.carregado_em
FROM ouro.vw_midia_anuncio m
JOIN escopo e USING (conta_id, campanha_id, plataforma)
WHERE m.nivel_midia = 'anuncio'
-- Moeda/valores inválidos ficam visíveis para rejeição; nunca viram zero.
