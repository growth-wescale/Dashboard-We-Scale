import { useState } from 'react'
import { ChevronDown, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAcesso } from '@/contexts/AcessoContext'
import { moneyK } from '@/lib/format'
import type { DivisaoReceita } from '@/lib/repasse'

/**
 * Receita dividida entre We Scale e marcas (repasse da taxa de franquia, ver
 * `src/lib/repasse.ts`). Duas peças: a linha curta que vai embaixo do card de
 * "Receita" e o bloco com barra + quebra por marca, no estilo do card de Meta.
 */

const COR_WS = 'var(--brand-accent)'
const COR_MARCA = 'color-mix(in srgb, var(--ws-text-secondary) 45%, var(--ws-border))'

function pctDe(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : '—'
}

/** "We Scale R$ 478 mil · Marcas R$ 100 mil" — só o que importa, em uma linha. */
export function DivisaoReceitaLinha({ divisao }: { divisao: DivisaoReceita }) {
  if (divisao.total <= 0) return null
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, fontFamily: 'var(--font-body)' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ws-text-secondary)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: COR_WS }} />We Scale
        </span>
        <span style={{ fontWeight: 600, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{moneyK(divisao.weScale)}</span>
      </span>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ws-text-secondary)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: COR_MARCA }} />Marcas
        </span>
        <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{moneyK(divisao.marca)}</span>
      </span>
    </span>
  )
}

export interface DivisaoPorMarca {
  label: string
  accent?: string
  divisao: DivisaoReceita
}

/** Barra We Scale × marcas + dropdown por marca. Igual ao "Receita" do card de Meta. */
export function DivisaoReceitaBloco({ divisao, porMarca, linkConfig = true }: {
  divisao: DivisaoReceita
  porMarca?: DivisaoPorMarca[]
  linkConfig?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const podeVerConfig = useAcesso().pode('aba.metas')
  const linhas = (porMarca ?? []).filter(m => m.divisao.total > 0)
  const temQuebra = linhas.length > 0
  const pctWs = divisao.total > 0 ? (divisao.weScale / divisao.total) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ws-text-primary)' }}>
          Receita
          {temQuebra && (
            <button type="button" onClick={() => setAberto(a => !a)} title="Ver por marca"
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: 'var(--ws-text-secondary)' }}>
              <ChevronDown size={12} style={{ transform: aberto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
            </button>
          )}
        </span>
        <span style={{ fontWeight: 600, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {divisao.total > 0 ? moneyK(divisao.total) : '—'}
        </span>
      </div>
      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--ws-border)' }}>
        {divisao.total > 0 && <>
          <div style={{ width: `${pctWs}%`, background: COR_WS }} />
          <div style={{ flex: 1, background: COR_MARCA }} />
        </>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COR_WS }} />
          <span style={{ color: 'var(--ws-text-secondary)' }}>We Scale</span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{moneyK(divisao.weScale)}</b>
          <span style={{ color: 'var(--ws-text-secondary)' }}>{pctDe(divisao.weScale, divisao.total)}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COR_MARCA }} />
          <span style={{ color: 'var(--ws-text-secondary)' }}>Marcas</span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{moneyK(divisao.marca)}</b>
          <span style={{ color: 'var(--ws-text-secondary)' }}>{pctDe(divisao.marca, divisao.total)}</span>
        </span>
      </div>
      {aberto && temQuebra && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2, paddingTop: 8, borderTop: '1px solid var(--ws-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', columnGap: 14, rowGap: 5, fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>
            <span />
            <span style={{ textAlign: 'right', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>We Scale</span>
            <span style={{ textAlign: 'right', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Marca</span>
            {linhas.map(m => [
              <span key={`${m.label}-n`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {m.accent && <span style={{ width: 7, height: 7, borderRadius: 2, background: m.accent, flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
              </span>,
              <span key={`${m.label}-w`} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ws-text-primary)', whiteSpace: 'nowrap' }}>
                {moneyK(m.divisao.weScale)}
              </span>,
              <span key={`${m.label}-m`} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {m.divisao.marca > 0 ? moneyK(m.divisao.marca) : '—'}
              </span>,
            ])}
          </div>
        </div>
      )}
      {linkConfig && podeVerConfig && (
        <Link to="/metas?aba=repasse" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ws-text-secondary)', textDecoration: 'none', alignSelf: 'flex-start' }}>
          <Settings2 size={12} /> Percentuais de repasse por marca
        </Link>
      )}
    </div>
  )
}
