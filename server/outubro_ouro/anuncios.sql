SELECT registro_key AS id, to_char(data_evento,'YYYY-MM-DD') AS dia, marca, plataforma AS canal,
  campanha_nome AS campanha, grupo_nome AS conjunto, anuncio_nome AS anuncio, gasto AS spend_brl,
  impressoes, cliques_link, lpv, leads_plataforma AS leads, video_p50, video_thruplay,
  CASE WHEN impressoes > 0 THEN gasto * 1000 / impressoes END AS cpm,
  CASE WHEN cliques_link > 0 THEN gasto / cliques_link END AS cpc, carregado_em AS criado_em
FROM ouro.vw_midia_anuncio
WHERE nivel_midia = 'anuncio' AND moeda = 'BRL'
  AND (marca, conta_id, campanha_id) IN (
    ('B2Case','1780151219244829','120244445745630274'), ('B2Case','1780151219244829','120253758038770274'),
    ('B2Case','1780151219244829','120254250246410274'), ('Inpot','3501938097','23326124527'),
    ('Inpot','3501938097','23840539884'), ('Inpot','987872747563639','120244811362180609'),
    ('Inpot','987872747563639','120244898185860609'), ('Inpot','987872747563639','120246367751600609'),
    ('Viva','2965437872','23728566959'), ('Viva','847556143491366','120248180487730565'),
    ('Viva','847556143491366','120251562717590565'), ('Viva','847556143491366','120252543018540565'))
  AND data_evento >= DATE '2026-10-01' AND data_evento < DATE '2026-11-01'
