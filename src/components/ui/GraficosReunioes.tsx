import { nf } from '@/lib/format'
import { BarList } from './dealDrawerShared'
import type { FatiaRosca, GraficosReunioes as Graficos } from './useGraficosReunioes'

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0)
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

/**
 * Rosca Individual × LIVE com quantidade e %. Clicar numa fatia (ou na linha
 * da legenda) filtra a lista; a outra fatia fica esmaecida.
 */
function RoscaTipo({ fatias, total, selecionados, onSelect }: {
  fatias: FatiaRosca[]; total: number; selecionados: string[]; onSelect: (v: string[]) => void
}) {
  const size = 120
  const r = 44, w = 18, c = 2 * Math.PI * r
  // 2px de folga entre as fatias (só quando há mais de uma com valor).
  const comValor = fatias.filter(f => f.count > 0).length
  const folga = comValor > 1 ? 2 : 0
  let acumulado = 0
  const temSelecao = selecionados.length > 0
  const apagada = (v: string) => temSelecao && !selecionados.includes(v)

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600, marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>Individual × LIVE</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>Total {nf(total)}</span>
      </div>
      {/* Rosca em cima e legenda embaixo: cabe numa coluna da grade, do tamanho das barras. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
          aria-label={fatias.map(f => `${f.valor}: ${nf(f.count)} (${fmtPct(pct(f.count, total))})`).join(', ')}
          style={{ flexShrink: 0 }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ws-border)" strokeWidth={w} />
          {total > 0 && fatias.map(f => {
            const len = (f.count / total) * c
            const offset = c * 0.25 - acumulado
            acumulado += len
            if (f.count === 0) return null
            return (
              <circle key={f.valor} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={f.cor} strokeWidth={w} opacity={apagada(f.valor) ? 0.35 : 1}
                strokeDasharray={`${Math.max(len - folga, 0.5)} ${c - Math.max(len - folga, 0.5)}`}
                strokeDashoffset={offset}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect([f.valor])}>
                <title>{`${f.valor}: ${nf(f.count)} (${fmtPct(pct(f.count, total))})`}</title>
              </circle>
            )
          })}
          <text x={size / 2} y={size / 2 - 2} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, fill: 'var(--ws-text-primary)' }}>{nf(total)}</text>
          <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--ws-text-secondary)' }}>{total === 1 ? 'reunião' : 'reuniões'}</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {fatias.map(f => {
            const marcada = selecionados.includes(f.valor)
            return (
              <button key={f.valor} type="button" onClick={() => onSelect([f.valor])}
                aria-pressed={marcada}
                style={{
                  border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontFamily: 'var(--font-body)',
                  opacity: apagada(f.valor) ? 0.4 : 1, color: 'var(--ws-text-primary)',
                }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: marcada ? 700 : 400 }}>{f.valor}</span>
                <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{nf(f.count)}</span>
                <span style={{ fontWeight: 600, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>
                  {fmtPct(pct(f.count, total))}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Faixa de gráficos no topo do pop-up "Reuniões". */
export function GraficosReunioes({ g, total }: { g: Graficos; total: number }) {
  return (
    // Grade de colunas iguais: com 4 gráficos num pop-up de ~930px cabem os 4 na
    // mesma linha; mais estreito, quebra em 2 ou 1 coluna sem esticar o último.
    <div className="rs-drawer-sec" style={{
      padding: '18px 24px', borderBottom: '1px solid var(--ws-border)',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))',
      gap: 24, alignItems: 'start', flexShrink: 0,
    }}>
      <RoscaTipo fatias={g.rosca} total={g.totalRosca} selecionados={g.filtro.tipo} onSelect={v => g.alternar('tipo', v)} />
      <BarList title="Por Marca" rows={g.porMarca} total={g.totalMarca}
        selecionados={g.filtro.marca} onSelect={v => g.alternar('marca', v)} />
      <BarList title="Por Closer" rows={g.porCloser} total={g.totalCloser}
        selecionados={g.filtro.closer} onSelect={v => g.alternar('closer', v)} />
      <BarList title="Por SDR" rows={g.porSdr} total={g.totalSdr}
        selecionados={g.filtro.sdr} onSelect={v => g.alternar('sdr', v)} />
      <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: -6, lineHeight: 1.45 }}>
        {g.temFiltro ? (
          <>
            Mostrando {nf(g.filtradas.length)} de {nf(total)} reuniões.{' '}
            <button onClick={g.limpar} style={{
              border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
              color: 'var(--ws-text-primary)', textDecoration: 'underline', font: 'inherit',
            }}>Limpar filtro</button>
          </>
        ) : 'Clique numa fatia ou barra pra filtrar a lista; clique de novo pra tirar.'}
        {' '}Uma LIVE conta 1 reunião; com negócios de 2 marcas ou 2 SDRs, conta 1 para cada.
      </div>
    </div>
  )
}
