SELECT registro_key AS id, to_char(data_evento, 'YYYY-MM-DD') AS dia, marca,
  lead_nome AS nome, lead_email AS email, coalesce(lead_telefone_movel, lead_telefone_pessoal) AS telefone,
  lead_uf AS uf, lead_cidade_texto AS cidade, lead_formulario_origem AS formulario,
  lead_utm_campaign AS utm_campaign, lead_utm_medium AS utm_medium, lead_utm_source AS utm_source,
  data_evento_em AS criado_em, NULL::text AS row_hash,
  jsonb_build_object('metric_grain','contact_only','capital',lead_capital_texto,
    'utm_content',lead_utm_content,'utm_term',lead_utm_term) AS dados_extras
FROM ouro.vw_leads_candidatos
WHERE (marca, lead_event_identifier) IN (
  ('Inpot','inpot_multistep'), ('B2Case','b2case_multistep'), ('Viva','viva_multistep'))
  AND data_evento >= DATE '2026-10-01' AND data_evento < DATE '2026-11-01'
