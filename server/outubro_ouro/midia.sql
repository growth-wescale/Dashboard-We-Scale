-- Prévia diária para conciliação. Manter conta e campanha para explicar diferenças.
SELECT marca, data_evento AS dia, plataforma, moeda, conta_id, campanha_id,
  sum(gasto) AS gasto, count(*) AS linhas, count(DISTINCT registro_key) AS registros,
  count(*) FILTER (WHERE gasto IS NULL) AS sem_gasto
FROM ouro.vw_midia_anuncio
WHERE marca IN ('Inpot', 'B2Case', 'Viva')
  AND nivel_midia = 'anuncio'
  AND data_evento >= DATE '2026-10-01' AND data_evento < DATE '2026-11-01'
GROUP BY marca, data_evento, plataforma, moeda, conta_id, campanha_id
