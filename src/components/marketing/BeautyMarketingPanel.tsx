import { useBeautyMarketing, type BeautyMarketingResult } from '@/hooks/useBeautyMarketing'
export function BeautyMarketingPanel({ result, compact = false }: { result: BeautyMarketingResult; compact?: boolean }) {
  if (!result.enabled) return null
  const value = result.data[0]
  const period = `${result.start.slice(8, 10)}/${result.start.slice(5, 7)}–${result.end.slice(8, 10)}/${result.end.slice(5, 7)}`
  return <section aria-label="Beauty Connection" style={{ border: '1px solid var(--ws-border, #ddd)', borderRadius: 8, padding: compact ? '6px 10px' : '10px 14px', margin: compact ? 0 : '12px 0', breakInside: 'avoid', flexShrink: 0 }}>
    <div style={{ fontSize: 13, fontWeight: 700 }}>Beauty Connection <span style={{ fontWeight: 400 }}>· Evento Lisô Laser</span></div>
    <div style={{ fontSize: compact ? 9 : 11, marginTop: 2 }}>{period} · Todas as origens</div>
    {result.loading ? <p role="status">Carregando Beauty Connection…</p> : result.error ? <p role="alert">Não foi possível carregar Beauty Connection. Atualize para tentar novamente.</p> : value &&
      <div style={{ display: 'flex', gap: compact ? 12 : 28, flexWrap: 'wrap', marginTop: 7, fontSize: compact ? 10 : 12 }}>
        <span>MQLs · negócios <strong>{value.deals}</strong></span>
        <span>Contatos MQL <strong>{value.contacts}</strong></span>
        <span>Investimento <strong>{value.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
      </div>}
  </section>
}
export function BeautyMarketingBlock({ start, end }: { start: string; end: string }) {
  const result = useBeautyMarketing(start, end)
  return <BeautyMarketingPanel result={result} />
}
