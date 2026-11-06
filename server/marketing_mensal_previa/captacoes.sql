SELECT registro_key AS id,to_char(data_evento,'YYYY-MM-DD') AS dia,
 CASE WHEN lead_event_identifier='beautyconnection_multistep' THEN 'Beauty Connection'
      WHEN lead_event_identifier IN ('Oral Unic Franquias - OdontoLegacy I Condicional','Oral Unic Franquias - Odonto Legacy I Condicional - MQL 03/09/26')
        OR marca='Odonto Legacy' THEN 'Odonto Scale' ELSE marca END AS marca,
 lead_nome AS nome,lead_email AS email,coalesce(lead_telefone_movel,lead_telefone_pessoal) AS telefone,
 lead_uf AS uf,lead_cidade_texto AS cidade,lead_formulario_origem AS formulario,
 lead_utm_source AS utm_source, lead_utm_medium AS utm_medium, lead_utm_campaign AS utm_campaign,
 data_evento_em AS criado_em,NULL::text AS row_hash,
 jsonb_build_object('metric_grain','contact_only','capital',lead_capital_texto,'utm_content',lead_utm_content,
   'utm_term',lead_utm_term,'segmento',CASE WHEN lead_event_identifier='oralunic_multistep' THEN 'oral-unic' END) AS dados_extras
FROM ouro.vw_leads_candidatos
WHERE data_evento >= DATE '{inicio}' AND data_evento < DATE '{fim_exclusivo}'
 AND (lead_event_identifier <> 'oralunic_multistep' OR upper(coalesce(lead_utm_campaign,'')) NOT LIKE '%[V4]%')
 AND ((marca,lead_event_identifier) IN (('Inpot','inpot_multistep'),('B2Case','b2case_multistep'),('Viva','viva_multistep'),
   ('Eletrovias','eletrovias_multistep'),('Lisô Laser','lisolaser_multistep'),('Oral Unic','oralunic_multistep'))
 OR (marca IN ('Odonto Scale','Odonto Legacy') AND lead_event_identifier IN ('odontolegacy_multistep','odontoscale_multistep','RD Station CRM'))
 OR lead_event_identifier IN ('beautyconnection_multistep','Oral Unic Franquias - OdontoLegacy I Condicional','Oral Unic Franquias - Odonto Legacy I Condicional - MQL 03/09/26'))
