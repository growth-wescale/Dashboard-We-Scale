-- O catálogo identifica o modelo na conta. Preço por evento é uma projeção de
-- entregas à tarifa de marketing BR, separada do subtotal RD medido por conta.
WITH catalogo AS MATERIALIZED (
  SELECT DISTINCT ON (s.waba_id) s.waba_id,coalesce(c.raw_snapshot,s.raw_snapshot) raw_snapshot
  FROM bronze.whatsapp_resource_snapshots s LEFT JOIN bronze.whatsapp_resource_snapshots c ON c.snapshot_id=s.content_snapshot_id
  WHERE s.resource='message_templates' AND s.status='loaded'
    AND coalesce(c.raw_snapshot,s.raw_snapshot)->>'catalog_complete'='true'
  ORDER BY s.waba_id,s.observed_at DESC,s.snapshot_id DESC
), marcas AS MATERIALIZED (
  SELECT DISTINCT ON(waba_id) waba_id,marca FROM bronze.whatsapp_collection ORDER BY waba_id,observed_at DESC,receipt_id DESC
), modelos AS MATERIALIZED (
  SELECT c.waba_id,t->>'id' id,t->>'name' nome,t->>'category' categoria, b.marca
  FROM catalogo c JOIN marcas b USING(waba_id) CROSS JOIN LATERAL jsonb_array_elements(c.raw_snapshot->'templates') t
), outubro_aprovado(conta, modelo_id, finalidade, dias_utc) AS (
  -- Conciliação de outubro de 2026. Cada modelo aparece uma vez por conta.
  -- Os volumes vêm das medições, inclusive nas futuras leituras da prévia.
  VALUES
  -- B2Case
  ('1538601307441542','1070296785817382','btg',ARRAY[19]),
  ('1538601307441542','1594883785658000','btg',ARRAY[17]),
  ('1538601307441542','1666282948246328','btg',ARRAY[19]),
  ('1538601307441542','1792787348632712','btg',ARRAY[18]),
  ('1538601307441542','2057349248291307','webinar_b2case',ARRAY[7]),
  ('1538601307441542','2202861527335991','btg',ARRAY[19]),
  -- Eletrovias
  ('1400193154764501','1130530289511629','btg',ARRAY[17]),
  ('1400193154764501','1449113713767412','btg',ARRAY[19]),
  ('1400193154764501','1683579249863366','btg',ARRAY[18]),
  ('1400193154764501','2065360430823507','btg',ARRAY[19]),
  ('1400193154764501','2209511469998258','btg',ARRAY[19]),
  -- Inpot
  ('2266148447226353','1076651228742448','btg',ARRAY[19]),
  ('2266148447226353','1107178512236847','btg',ARRAY[19]),
  ('2266148447226353','1482857416992179','btg',ARRAY[18]),
  ('2266148447226353','1542738720994740','btg',ARRAY[17]),
  ('2266148447226353','1856591885526977','btg',ARRAY[19]),
  -- Lisô Laser
  ('883956580821871','1645123247401215','btg',ARRAY[17]),
  ('883956580821871','27794396523569166','webinar_liso',ARRAY[6]),
  ('883956580821871','962757719812609','beauty',ARRAY[30]),
  ('883956580821871','993362957144698','beauty',ARRAY[31]),
  -- Viva
  ('2622426584884634','1150807400809701','btg',ARRAY[18]),
  ('2622426584884634','1789748978934555','btg',ARRAY[19]),
  ('2622426584884634','2393538994516673','btg',ARRAY[19]),
  ('2622426584884634','3856836424484101','btg',ARRAY[17]),
  ('2622426584884634','4041574922810922','btg',ARRAY[19]),
  -- We Scale
  ('1579891513490824','1034736379410978','rotina',ARRAY[2,7,8,9,13,14,15,16,19,21,22,23,26,27,28,29,30]),
  ('1579891513490824','1036983078708690','rotina',ARRAY[19,20,21,23]),
  ('1579891513490824','1094688720036902','scale_partner',ARRAY[20]),
  ('1579891513490824','1438139705006109','rotina',ARRAY[6,7,8,9,13,14,15,16,19,20,21,22,23,26,27,28,29,30]),
  ('1579891513490824','1620288322846868','rotina',ARRAY[8,9,10,11,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,28,29,30,31]),
  ('1579891513490824','2119861485619672','rotina',ARRAY[2,6,7,8,9,13,14,15,16,19,20,21,22,23,26,27,28,29,30]),
  ('1579891513490824','2139671796661957','plano_legacy',ARRAY[20]),
  ('1579891513490824','4424485951125930','rotina',ARRAY[2,6,7,8,9,13,14,15,16,19,20,21,22,23,26,27,28,29,30])
), mapeados AS MATERIALIZED (
  SELECT m.*,a.dias_utc,CASE
    WHEN a.modelo_id IS NOT NULL THEN a.finalidade
    WHEN nome ~ '^live_btg_' THEN 'btg'
    WHEN nome ~ '^live0311(convite(ev|in|ll|vi)|(ev|in|ll|vi)2)_' THEN 'diretores'
    -- Convenção específica da régua de cadência: passo, marca da conta e versão.
    WHEN nome ~ '^cad_(m1|c1|c2|t0[4-9]|t10)_(b2case|eletrovias|inpot|liso|oralunic|viva)_v[0-9]+[a-z]?$'
      AND split_part(nome,'_',3) = CASE marca WHEN 'B2Case' THEN 'b2case' WHEN 'Eletrovias' THEN 'eletrovias'
        WHEN 'Inpot' THEN 'inpot' WHEN 'Lisô Laser' THEN 'liso' WHEN 'Oral Unic' THEN 'oralunic' WHEN 'Viva' THEN 'viva' END
      THEN 'rotina'
  END evento FROM modelos m
  LEFT JOIN outubro_aprovado a ON a.conta=m.waba_id AND a.modelo_id=m.id
), grupos AS MATERIALIZED (
  SELECT waba_id,array_agg(id) ids FROM mapeados WHERE evento IS NOT NULL GROUP BY waba_id
), falhas AS MATERIALIZED (
  SELECT s.waba_id,s.period_start,s.period_end,s.observed_at,
         s.request_context->>'product_type' produto,s.request_context->'template_ids' ids
  FROM bronze.whatsapp_resource_snapshots s JOIN grupos g ON g.waba_id=s.waba_id
  WHERE s.resource='template_analytics' AND s.status NOT IN ('loaded','empty_response')
    AND (s.request_context->'template_ids') ?| g.ids AND s.period_end > DATE '{inicio}'::timestamp AT TIME ZONE 'UTC'
), snapshots AS MATERIALIZED (
  -- Cada conteúdo idêntico é expandido uma vez. A escolha final é por
  -- conta, produto, modelo e janela UTC, como no contrato de templates.
  SELECT DISTINCT ON (s.waba_id,s.request_sha256)
    s.waba_id,s.request_context->>'product_type' produto,s.observed_at,s.snapshot_id,
    coalesce(s.content_snapshot_id,s.snapshot_id) content_id,s.period_start,s.period_end
  FROM bronze.whatsapp_resource_snapshots s JOIN grupos g ON g.waba_id=s.waba_id
  WHERE s.resource='template_analytics' AND s.status='loaded'
    AND (s.request_context->'template_ids') ?| g.ids
    AND s.period_start < (DATE '{fim}'+1)::timestamp AT TIME ZONE 'UTC'
    AND s.period_end > DATE '{inicio}'::timestamp AT TIME ZONE 'UTC'
  ORDER BY s.waba_id,s.request_sha256,s.observed_at DESC,s.snapshot_id DESC
), medias AS MATERIALIZED (
  SELECT DISTINCT ON (s.waba_id,s.produto,p->>'template_id',p->>'start',p->>'end')
    s.waba_id,s.produto product_type,p->>'template_id' template_id,
    (to_timestamp((p->>'start')::bigint) AT TIME ZONE 'UTC')::date day_utc,
    (p->>'sent')::bigint sent,(p->>'delivered')::bigint delivered,(p->>'read')::bigint read_latest,
    p->'clicked_by_type' clicked_by_type,
    EXISTS (SELECT 1 FROM falhas f WHERE f.waba_id=s.waba_id AND f.produto=s.produto AND f.ids ? (p->>'template_id')
      AND f.period_start<=to_timestamp((p->>'start')::bigint) AND f.period_end>=to_timestamp((p->>'end')::bigint)
      AND f.observed_at>s.observed_at) data_stale
  FROM snapshots s JOIN bronze.whatsapp_resource_snapshots c ON c.snapshot_id=s.content_id
  CROSS JOIN LATERAL jsonb_array_elements(c.raw_snapshot->'data_points') p
  JOIN mapeados m ON m.evento IS NOT NULL AND m.waba_id=s.waba_id AND m.id=p->>'template_id'
  WHERE c.raw_snapshot->>'page_complete'='true'
  ORDER BY s.waba_id,s.produto,p->>'template_id',p->>'start',p->>'end',s.observed_at DESC,s.snapshot_id DESC
), por_produto AS (
SELECT m.evento,m.nome modelo,m.id,m.waba_id conta,CASE WHEN b.marca='WeScale' THEN 'We Scale' ELSE b.marca END marca,t.product_type produto,
  to_char(t.day_utc,'YYYY-MM-DD') dia,t.sent enviados,t.delivered entregues,t.read_latest lidos,t.clicked_by_type cliques_por_tipo,
  t.data_stale desatualizado,
  CASE WHEN m.categoria='MARKETING' AND NOT t.data_stale
    THEN t.delivered * tarifa.unit_pos_pago_brl END projecao
FROM mapeados m JOIN medias t
  ON t.waba_id=m.waba_id AND t.template_id=m.id
JOIN marcas b ON b.waba_id=m.waba_id
LEFT JOIN prata.whatsapp_tarifa_rd tarifa
  ON tarifa.country='BR' AND tarifa.category=m.categoria
  AND t.day_utc>=tarifa.valid_from AND (tarifa.valid_to IS NULL OR t.day_utc<tarifa.valid_to)
WHERE m.evento IS NOT NULL AND t.day_utc BETWEEN DATE '{inicio}' AND DATE '{fim}'
  AND (m.dias_utc IS NULL OR (t.day_utc >= DATE '2026-10-01' AND t.day_utc < DATE '2026-11-01'
       AND extract(day FROM t.day_utc)::integer = ANY(m.dias_utc)))
  AND (t.sent>0 OR t.delivered>0 OR t.read_latest>0
       OR EXISTS (SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(t.clicked_by_type)='object'
          THEN t.clicked_by_type END) click WHERE click.value ~ '^0*[1-9][0-9]*$'))
 )
-- Lotes por conta/dia preservam o grão dos modelos e evitam truncar a
-- resposta do Metabase. A contagem de séries é conferida no leitor.
SELECT conta,dia,count(*) quantidade,jsonb_agg(to_jsonb(p)-'conta'-'dia' ORDER BY id,produto) series
FROM por_produto p GROUP BY conta,dia ORDER BY conta,dia
