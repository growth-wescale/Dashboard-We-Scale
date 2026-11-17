import { useMediaQuery, MQ_CELULAR } from '@/hooks/useMediaQuery'
import { CORES, corDaCamada, fmtDias, rotuloDia } from '@/lib/timeline/layout'
import { donosDaFase, posicaoNaFaixa } from '@/lib/timeline/historico'
import type { Fase, Timeline } from '@/lib/timeline/tipos'

/**
 * Faixa do negócio inteiro, proporcional ao tempo: uma barra por fase (MQL,
 * SDR, Closer) e o intervalo em que ficou perdido antes de ser reaberto, que é
 * o que mostra o resgate de relance. Embaixo de cada fase, quem estava com o
 * negócio e quanto tempo ficou ali.
 */

const NOME_FASE: Record<Fase['tipo'], string> = { MQL: 'MQL', SDR: 'SDR', Closer: 'Closer', Reaberto: 'Perdido' }

function corFase(f: Fase): string {
  return f.tipo === 'Reaberto' ? 'transparent' : corDaCamada(f.tipo)
}

export function ResumoCiclos({ timeline }: { timeline: Timeline }) {
  const tl = timeline
  // abaixo disso a legenda não cabe e vira "S…": a fase curta fica só com a dica do mouse
  const larguraMinLegenda = useMediaQuery(MQ_CELULAR) ? 24 : 9
  const total = Math.max(1, tl.fim.getTime() - tl.inicio.getTime())
  // largura mínima pra fase curtíssima (MQL de 2 min) não sumir
  const larguras = tl.fases.map(f => Math.max(1.5, ((f.fim.getTime() - f.inicio.getTime()) / total) * 100))
  const marcos = tl.nos.filter(n => n.tipo === 'perda' || n.tipo === 'retomada' || n.tipo === 'ganho')

  return (
    <div>
      <div style={{ position: 'relative', display: 'flex', gap: 3, height: 34 }} aria-hidden="true">
        {tl.fases.map((f, i) => {
          const parado = f.tipo === 'Reaberto'
          return (
            <div key={`${f.tipo}-${f.inicio.getTime()}`} title={`${NOME_FASE[f.tipo]} · ${fmtDias(f.duracaoDias)}`} style={{
              flex: `${larguras[i]} 1 0`, minWidth: 6, borderRadius: 8, background: corFase(f),
              border: parado ? '1.5px dashed var(--status-risco)' : 'none',
              backgroundImage: parado ? 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--status-risco) 12%, transparent) 6px 12px)' : undefined,
            }} />
          )
        })}
        {tl.desfecho.tipo === 'em_andamento' && (
          <span style={{ position: 'absolute', right: -2, top: -5, bottom: -5, width: 3, borderRadius: 2, background: 'var(--ws-text-primary)' }} />
        )}
      </div>

      {/* legenda de cada fase, alinhada às barras */}
      <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
        {tl.fases.map((f, i) => {
          const donos = f.tipo === 'SDR' || f.tipo === 'Closer' ? donosDaFase(f, tl.momentos) : []
          const parado = f.tipo === 'Reaberto'
          const titulo = parado ? `Perdido por ${fmtDias(f.duracaoDias)}` : `${NOME_FASE[f.tipo]} · ${fmtDias(f.duracaoDias)}`
          const texto = [titulo, donos.join(' → ')].filter(Boolean).join('\n')
          return (
            <div key={`l-${f.tipo}-${f.inicio.getTime()}`} title={texto} style={{ flex: `${larguras[i]} 1 0`, minWidth: 6, overflow: 'hidden' }}>
              {larguras[i] >= larguraMinLegenda && (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: parado ? 'var(--status-risco)' : 'var(--ws-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</div>
                  {donos.length > 0 && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{donos.join(' → ')}</div>}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* datas: começo, perdas/reaberturas/venda e fim */}
      <div style={{ position: 'relative', height: 18, marginTop: 10, fontSize: 11.5, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ position: 'absolute', left: 0 }}>{rotuloDia(tl.inicio)}</span>
        {marcos.map((m, i) => {
          const pos = posicaoNaFaixa(m.instante, tl)
          const anterior = i > 0 ? posicaoNaFaixa(marcos[i - 1].instante, tl) : -100
          if (pos < 8 || pos > 92 || pos - anterior < 12) return null
          const cor = m.tipo === 'perda' ? 'var(--status-risco)' : m.tipo === 'ganho' ? CORES.ganho : 'var(--ws-text-primary)'
          const rotulo = m.tipo === 'perda' ? 'perdido' : m.tipo === 'ganho' ? 'venda' : 'reaberto'
          return (
            <span key={m.id} style={{ position: 'absolute', left: `${pos}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: cor }}>
              {rotulo} {rotuloDia(m.instante)}
            </span>
          )
        })}
        <span style={{ position: 'absolute', right: 0 }}>
          {tl.desfecho.tipo === 'em_andamento' ? `hoje, ${rotuloDia(tl.fim)}` : tl.desfecho.tipo === 'ganho' ? `venda, ${rotuloDia(tl.fim)}` : `perdido, ${rotuloDia(tl.fim)}`}
        </span>
      </div>
    </div>
  )
}
