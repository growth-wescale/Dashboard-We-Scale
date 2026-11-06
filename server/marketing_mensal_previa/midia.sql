-- Contas dedicadas exigem concordância com a marca da ouro. Contas compartilhadas exigem campanha homologada.
WITH contas(marca,plataforma,conta_id) AS (VALUES
 ('Inpot','meta','987872747563639'),('Inpot','google','3501938097'),('B2Case','meta','1780151219244829'),
 ('Viva','meta','847556143491366'),('Viva','google','2965437872'),('Eletrovias','meta','2424035941347251'),
 ('Eletrovias','google','2319926905'),('Lisô Laser','meta','1923360421973366'),('Lisô Laser','google','9186518266')
), compartilhadas(marca,plataforma,conta_id,campanha_id) AS (VALUES
 ('Beauty Connection','meta','655039566905092','120250473527040783'),
 ('Oral Unic','meta','24763396173316651','120249498633040752'),('Oral Unic','meta','24763396173316651','120246002967810752'),
 ('Oral Unic','google','9733883995','23324303426'),('Oral Unic','meta','24763396173316651','120248355011530752'),
 ('Oral Unic','google','9733883995','24054007136'),('Oral Unic','google','9733883995','24054143009')
)
SELECT m.registro_key AS id,to_char(m.data_evento,'YYYY-MM-DD') AS dia,coalesce(c.marca,s.marca) AS marca,
 'ouro_marketing_mensal'::text AS origem_leitura,m.conta_id,m.campanha_id,
 m.plataforma AS canal,m.campanha_nome AS campanha,m.grupo_nome AS conjunto,m.anuncio_nome AS anuncio,
 m.gasto AS spend_brl,m.impressoes,m.cliques_link,m.lpv,m.leads_plataforma AS leads,m.video_p50,m.video_thruplay,
 CASE WHEN m.impressoes>0 THEN m.gasto*1000/m.impressoes END AS cpm,
 CASE WHEN m.cliques_link>0 THEN m.gasto/m.cliques_link END AS cpc,m.carregado_em AS criado_em
FROM ouro.vw_midia_anuncio m
LEFT JOIN contas c USING(marca,plataforma,conta_id)
LEFT JOIN compartilhadas s ON (s.plataforma,s.conta_id,s.campanha_id)=(m.plataforma,m.conta_id,m.campanha_id)
WHERE m.nivel_midia='anuncio' AND m.moeda='BRL' AND coalesce(c.marca,s.marca) IS NOT NULL
 AND m.data_evento >= DATE '{inicio}' AND m.data_evento < DATE '{fim_exclusivo}'
