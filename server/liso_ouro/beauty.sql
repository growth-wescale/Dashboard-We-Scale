-- Reutiliza o contrato ouro já publicado para inscrição, sem criar objetos.
-- O consumidor publicado continua limitado a outubro/2026.
SELECT dia, inscricoes, observado_em
FROM ouro.vw_beauty_inscricoes_dia
