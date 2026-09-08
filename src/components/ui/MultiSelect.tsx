/**
 * Multi-seleção estilo filtro de Excel: checkboxes, "Selecionar tudo" e
 * "Limpar seleção" (sempre visíveis, esmaecidos quando não há o que fazer).
 * Compartilhado pela barra de filtros (FilterBar) e pelos filtros internos de
 * popups (StageDealsDrawer) — mesmo componente, mesmo visual e lógica em todo
 * lugar que filtra por uma lista de valores.
 *
 * `required`: o filtro NÃO pode ficar vazio. Quando fica, o controle mostra
 * borda vermelha (`--status-critico`) e a página responsável esconde os dados
 * e pede uma seleção — o componente não trava o checkbox (o usuário pode
 * desmarcar tudo), só sinaliza que falta escolher.
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

const COR_INVALIDO = 'var(--status-critico, #dc2626)'

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
 * Estado dos dois botões do rodapé (sempre renderizados, estilo Excel):
 * "Selecionar tudo" fica ativo enquanto falta marcar algo; "Limpar seleção"
 * enquanto há algo marcado.
 */
export function acoesRodape(
  selected: string[],
  optionValues: string[],
): { selecionarTudoAtivo: boolean; limparAtivo: boolean } {
  return {
    selecionarTudoAtivo: selected.length < optionValues.length,
    limparAtivo: selected.length > 0,
  }
}

/**
 * Nenhum item marcado = sem filtro (mostra tudo) — a menos que `required`,
 * quando ficar vazio é estado inválido (ver cabeçalho do arquivo).
 */
export function MultiSelect({ label, options, selected, onChange, required = false, allLabel, universoTotal }: {
  label: string
  options: readonly MultiSelectOption[]
  selected: string[]
  onChange: (v: string[]) => void
  /** Filtro obrigatório: vazio vira estado inválido (borda vermelha). */
  required?: boolean
  /** Rótulo quando TODAS as opções estão marcadas (ex.: "Consolidado" pra Marca). */
  allLabel?: string
  /**
   * Tamanho do domínio completo, quando `options` pode vir menor que ele (ex.:
   * Marca só lista quem tem dado na origem atual, mas "todas selecionadas"
   * continua significando as marcas de verdade, não as exibidas — sem isso o
   * rótulo mostraria "5 selecionados" no lugar de "Consolidado").
   * Default: `options.length`, igual antes.
   */
  universoTotal?: number
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

  const invalido = required && selected.length === 0

  const resumo = invalido
    ? 'Selecione…'
    : selected.length === 0
      ? 'Todas'
      : allLabel && selected.length === (universoTotal ?? options.length)
        ? allLabel
        : selected.length === 1
          ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
          : `${selected.length} selecionados`

  const optionValues = options.map(o => o.value)
  const { selecionarTudoAtivo, limparAtivo } = acoesRodape(selected, optionValues)

  const rodapeBtn = (ativo: boolean): CSSProperties => ({
    flex: 1, padding: '5px 8px', border: 'none', background: 'transparent',
    color: 'var(--ws-text-secondary)', fontSize: 11.5, textAlign: 'left',
    fontFamily: 'var(--font-body)',
    cursor: ativo ? 'pointer' : 'default', opacity: ativo ? 1 : 0.4,
  })

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-invalid={invalido || undefined}
        style={{
          ...controlStyle,
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          minWidth: 130, justifyContent: 'space-between',
          border: invalido ? `1px solid ${COR_INVALIDO}` : controlStyle.border,
          boxShadow: invalido ? `0 0 0 3px color-mix(in srgb, ${COR_INVALIDO} 18%, transparent)` : undefined,
          color: invalido ? COR_INVALIDO : controlStyle.color,
        }}
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
            return (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12.5, color: 'var(--ws-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange(on ? selected.filter(s => s !== opt.value) : [...selected, opt.value])}
                  style={{ accentColor: 'var(--ws-accent, #2ABCB5)', cursor: 'pointer' }}
                />
                {opt.label}
              </label>
            )
          })}
          {options.length > 0 && (
            <div style={{ display: 'flex', marginTop: 4, borderTop: '1px solid var(--ws-border)', paddingTop: 4 }}>
              <button
                type="button"
                disabled={!selecionarTudoAtivo}
                onClick={() => onChange(optionValues)}
                style={rodapeBtn(selecionarTudoAtivo)}
              >
                Selecionar tudo
              </button>
              <button
                type="button"
                disabled={!limparAtivo}
                onClick={() => onChange([])}
                style={rodapeBtn(limparAtivo)}
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
