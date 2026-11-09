-- O catálogo identifica o modelo na conta. Preço por evento é uma projeção de
-- entregas à tarifa de marketing BR, separada do subtotal RD medido por conta.
WITH catalogo AS MATERIALIZED (
  SELECT DISTINCT ON (s.waba_id) s.waba_id,coalesce(c.raw_snapshot,s.raw_snapshot) raw_snapshot
  FROM bronze.whatsapp_resource_snapshots s LEFT JOIN bronze.whatsapp_resource_snapshots c ON c.snapshot_id=s.content_snapshot_id
  WHERE s.resource='message_templates' AND s.status='loaded'
    AND coalesce(c.raw_snapshot,s.raw_snapshot)->>'catalog_complete'='true'
  ORDER BY s.waba_id,s.observed_at DESC,s.snapshot_id DESC
), modelos AS MATERIALIZED (
  SELECT c.waba_id,t->>'id' id,t->>'name' nome,t->>'category' categoria
  FROM catalogo c CROSS JOIN LATERAL jsonb_array_elements(c.raw_snapshot->'templates') t
), mapeados AS MATERIALIZED (
  SELECT *,CASE
    WHEN nome ~ '^live_btg_' THEN 'btg'
    WHEN nome ~ '^live0311(convite(ev|in|ll|vi)|(ev|in|ll|vi)2)_' THEN 'diretores'
  END evento FROM modelos
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
    EXISTS (SELECT 1 FROM falhas f WHERE f.waba_id=s.waba_id AND f.produto=s.produto AND f.ids ? (p->>'template_id')
      AND f.period_start<=to_timestamp((p->>'start')::bigint) AND f.period_end>=to_timestamp((p->>'end')::bigint)
      AND f.observed_at>s.observed_at) data_stale
  FROM snapshots s JOIN bronze.whatsapp_resource_snapshots c ON c.snapshot_id=s.content_id
  CROSS JOIN LATERAL jsonb_array_elements(c.raw_snapshot->'data_points') p
  JOIN mapeados m ON m.evento IS NOT NULL AND m.waba_id=s.waba_id AND m.id=p->>'template_id'
  WHERE c.raw_snapshot->>'page_complete'='true'
  ORDER BY s.waba_id,s.produto,p->>'template_id',p->>'start',p->>'end',s.observed_at DESC,s.snapshot_id DESC
), marcas AS MATERIALIZED (
  SELECT DISTINCT ON(waba_id) waba_id,marca FROM bronze.whatsapp_collection ORDER BY waba_id,observed_at DESC,receipt_id DESC
)
SELECT m.evento,m.nome modelo,m.id,m.waba_id conta,CASE WHEN b.marca='WeScale' THEN 'We Scale' ELSE b.marca END marca,t.product_type produto,
  to_char(t.day_utc,'YYYY-MM-DD') dia,t.sent enviados,t.delivered entregues,t.read_latest lidos,
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
  AND (t.sent>0 OR t.delivered>0 OR t.read_latest>0)
ORDER BY t.day_utc,m.waba_id,m.id,t.product_type
