-- Leitura agregada da inscrição Beauty; aplicar somente após revisão do contrato.
-- Não altera fatos, captações ou marcas gravadas na origem.
CREATE VIEW ouro.vw_beauty_inscricoes_dia AS
SELECT
  data_evento AS dia,
  count(DISTINCT lead_ocorrencia_id)::integer AS inscricoes,
  max(carregado_em) AS observado_em
FROM ouro.vw_leads_candidatos
WHERE lead_event_identifier = 'beautyconnection_multistep'
  AND data_evento IS NOT NULL
  AND lead_ocorrencia_id IS NOT NULL
GROUP BY data_evento;

-- Provisionar a senha por canal seguro fora deste repositório.
CREATE ROLE dashboard_beauty_ro LOGIN NOINHERIT;
GRANT CONNECT ON DATABASE oralunic_dw TO dashboard_beauty_ro;
GRANT USAGE ON SCHEMA ouro TO dashboard_beauty_ro;
GRANT SELECT ON ouro.vw_beauty_inscricoes_dia TO dashboard_beauty_ro;
