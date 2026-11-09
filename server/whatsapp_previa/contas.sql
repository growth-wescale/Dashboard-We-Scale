-- Uma linha por conta/dia. As famílias de entrega e preço são medidas em separado.
WITH base AS (
  SELECT *, metric_covered IS TRUE AND valid_receipt_id IS NOT NULL AS valido
  FROM ouro.vw_whatsapp_custo_rd
  WHERE day_local BETWEEN DATE '{inicio}' AND DATE '{fim}'
)
SELECT to_char(day_local,'YYYY-MM-DD') dia, waba_id conta,
  CASE WHEN marca='WeScale' THEN 'We Scale' ELSE marca END marca,
  sum(sent) FILTER (WHERE valido AND metric_family='delivery') enviados,
  sum(delivered) FILTER (WHERE valido AND metric_family='delivery') entregues,
  sum(pricing_volume) FILTER (WHERE valido AND metric_family='pricing') precificados,
  sum(custo_rd_pos_pago_estimado) FILTER (WHERE valido AND metric_family='pricing') custo,
  coalesce(sum(pricing_volume) FILTER (WHERE valido AND metric_family='pricing'
    AND pricing_volume>0 AND custo_rd_pos_pago_estimado IS NULL),0) sem_tarifa,
  bool_or(valido AND metric_family='delivery') entrega_ok,
  bool_and(valido AND NOT coalesce(data_stale,true)
    AND coalesce(data_period_start <= (day_local::timestamp AT TIME ZONE timezone)
      AND data_period_end >= ((day_local+1)::timestamp AT TIME ZONE timezone),false))
    FILTER (WHERE metric_family='delivery') entrega_completa,
  bool_or(valido AND metric_family='pricing') preco_ok,
  bool_or(data_stale OR NOT valido OR is_partial_day IS TRUE) parcial,
  bool_or(source_status='source_error') erro,
  bool_or(source_status='empty_response') vazio,
  max(data_observed_at) FILTER (WHERE valido) observado
FROM base GROUP BY day_local, waba_id, marca ORDER BY day_local, waba_id
