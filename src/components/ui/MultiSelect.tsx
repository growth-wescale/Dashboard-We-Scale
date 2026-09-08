/**
 * Multi-seleção estilo filtro de Excel: checkboxes, "Selecionar tudo" e
 * "Limpar seleção". Compartilhado pela barra de filtros (FilterBar) e pelos
 * filtros internos de popups (StageDealsDrawer) — mesmo componente, mesmo
 * visual e lógica em todo lugar que filtra por uma lista de valores.
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'

export const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--ws-text-secondary)',
  whiteSpace: 'nowrap',
}

export const controlStyle: CSSProperties = {
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--ws-surface)',
  color: 'var(--ws-text-primary)',
  fontSize: 12.5,
  fontFamily: 'var(--font-body)',
  padding: '6px 10px',
  outline: 'none',
}

/**
 * Cestos genéricos vão para o fim da lista; o resto em ordem alfabética
 * (pt-BR, acentos corretos). As opções nunca devem ser lista fixa no código —
 * uma lista fixa já quebrou uma vez, quando "Prospecção Ativa" passou a
 * existir no CRM e 174 deals ficaram inalcançáveis pelo filtro de Fonte.
 */
const CESTOS = ['Sem Classificação', 'Outros', 'Não identificado', 'Sem informação']

export function ordenarOpcoes(valores: string[]): string[] {
  return [...valores].sort((a, b) => {
    const ia = CESTOS.indexOf(a), ib = CESTOS.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? -1 : ia) - (ib === -1 ? -1 : ib)
    return a.localeCompare(b, 'pt-BR')
  })
}

export interface MultiSelectOption { value: string; label: string }

/** Dois arrays têm o mesmo conjunto de valores, ignorando ordem. */
export function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every(x => sb.has(x))
}

/**
 * O que o botão de limpar/reset deve produzir:
 * - filtro que pode ficar vazio (`minSelected` 0): lista vazia = "Todas";
 * - filtro com piso (Marca, Período) e `clearTo`: volta ao estado "sem
 *   recorte" informado (Marca → todas as marcas = Consolidado; Período →
 *   período atual). Um "Limpar" que só troca a marca isolada pela primeira
 *   da lista confunde — e ainda some com as demais opções;
 * - filtro com piso e sem `clearTo`: fallback legado, mantém só o 1º item.
 */
export function resolveClear(selected: string[], minSelected: number, clearTo?: string[]): string[] {
  if (clearTo) return clearTo
  return minSelected === 0 ? [] : selected.slice(0, 1)
}

/**
 * Quais botões do rodapé mostrar. "Selecionar tudo" some quando o próprio
 * "Limpar" já leva a todas as opções (Marca: `clearTo` == todas as marcas) —
 * dois botões com o mesmo efeito confundem. "Limpar" só aparece quando muda
 * algo de fato.
 */
export function rodapeAcoes(
  selected: string[],
  optionValues: string[],
  minSelected: number,
  clearTo?: string[],
): { selecionarTudo: boolean; limpar: boolean } {
  const alvoLimpar = resolveClear(selected, minSelected, clearTo)
  const limparCobreTudo = mesmoConjunto(alvoLimpar, optionValues)
  return {
    selecionarTudo: selected.length < optionValues.length && !limparCobreTudo,
    limpar: !mesmoConjunto(selected, alvoLimpar),
  }
}

/**
 * Nenhum item marcado = sem filtro (mostra tudo) — a menos que `minSelected`
 * exija um piso (ex.: período e marca nunca podem ficar vazios).
 */
export function MultiSelect({ label, options, selected, onChange, minSelected = 0, allLabel, universoTotal, clearTo, clearLabel }: {
  label: string
  options: readonly MultiSelectOption[]
  selected: string[]
  onChange: (v: string[]) => void
  /** Nº mínimo de itens que devem continuar marcados (ex.: período = 1). */
  minSelected?: number
  /** Rótulo quando TODAS as opções estão marcadas (ex.: "Consolidado" pra Marca). */
  allLabel?: string
  /**
   * Tamanho do domínio completo, quando `options` pode vir menor que ele (ex.:
   * Marca só lista quem tem dado na origem atual, mas "todas selecionadas"
   * continua significando as 7 marcas de verdade, não as 5 exibidas — sem
   * isso o rótulo mostraria "5 selecionados" no lugar de "Consolidado").
   * Default: `options.length`, igual antes.
   */
  universoTotal?: number
  /**
   * Estado "sem recorte" para o botão de limpar quando o filtro tem piso
   * (`minSelected` > 0) e não pode simplesmente esvaziar. Marca → todas as
   * chaves de marca; Período → `[períodoAtual]`. Sem isso, "Limpar" cai no
   * fallback legado (mantém só o 1º selecionado).
   */
  clearTo?: string[]
  /** Rótulo do botão de limpar quando `clearTo` está definido (ex.: "Consolidado"). */
  clearLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const resumo = selected.length === 0
    ? 'Todas'
    : allLabel && selected.length === (universoTotal ?? options.length)
      ? allLabel
      : selected.length === 1
        ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selecionados`

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 130, justifyContent: 'space-between' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumo}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, opacity: .6 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 1100,
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
          borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,.12))',
          padding: 6, minWidth: 190, maxHeight: 320, overflowY: 'auto',
        }}>
          <div style={{ ...labelStyle, padding: '4px 8px 6px' }}>{label}</div>
          {options.length === 0 && (
            <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>Sem opções</div>
          )}
          {options.map(opt => {
            const on = selected.includes(opt.value)
            const travado = on && selected.length <= minSelected
            return (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, cursor: travado ? 'default' : 'pointer', fontSize: 12.5, color: travado ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={travado}
                  onChange={() => onChange(on ? selected.filter(s => s !== opt.value) : [...selected, opt.value])}
                  style={{ accentColor: 'var(--ws-accent, #2ABCB5)', cursor: travado ? 'default' : 'pointer' }}
                />
                {opt.label}
              </label>
            )
          })}
          {(() => {
            const optionValues = options.map(o => o.value)
            const { selecionarTudo, limpar } = rodapeAcoes(selected, optionValues, minSelected, clearTo)
            if (!selecionarTudo && !limpar) return null
            return (
              <div style={{ display: 'flex', marginTop: 4, borderTop: '1px solid var(--ws-border)', paddingTop: 4 }}>
                {selecionarTudo && (
                  <button
                    type="button"
                    onClick={() => onChange(optionValues)}
                    style={{ flex: 1, padding: '5px 8px', border: 'none', background: 'transparent', color: 'var(--ws-text-secondary)', fontSize: 11.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}
                  >
                    Selecionar tudo
                  </button>
                )}
                {limpar && (
                  <button
                    type="button"
                    onClick={() => onChange(resolveClear(selected, minSelected, clearTo))}
                    style={{ flex: 1, padding: '5px 8px', border: 'none', background: 'transparent', color: 'var(--ws-text-secondary)', fontSize: 11.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}
                  >
                    {clearTo ? (clearLabel ?? 'Limpar seleção') : 'Limpar seleção'}
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
