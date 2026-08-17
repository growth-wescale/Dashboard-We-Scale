/**
 * Barra de filtros das abas de Vendas.
 *
 * Fica congelada no topo ao rolar (como "congelar painéis" do Excel), porque o
 * funil tem 12 etapas e o usuário perde de vista qual recorte está olhando.
 * A sombra só aparece depois que a barra descola do topo — daí o sentinela.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { BRANDS_WITH_OVERVIEW } from '@/constants/brands'
import { SUB_FONTE_GRUPOS } from '@/lib/fonteMapping'
import { PERIOD_LABEL, useSharedFilters } from '@/contexts/SharedFiltersContext'
import { opcoesPara } from '@/lib/periodo'
import type { PeriodMode } from '@/lib/periodo'

const PERIOD_MODES: PeriodMode[] = ['dia', 'mes', 'trimestre', 'ano']

/**
 * Cestos genéricos vão para o fim da lista; o resto em ordem alfabética.
 *
 * As opções de Fonte NÃO são fixas no código: vêm dos dados carregados. Uma
 * lista fixa aqui já quebrou uma vez — quando "Prospecção Ativa" passou a
 * existir no CRM, o filtro continuou oferecendo só os três valores antigos e
 * 174 deals ficaram inalcançáveis.
 */
const CESTOS = ['Sem Classificação', 'Outros', 'Não identificado']

function ordenarOpcoes(valores: string[]): string[] {
  return [...valores].sort((a, b) => {
    const ia = CESTOS.indexOf(a), ib = CESTOS.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? -1 : ia) - (ib === -1 ? -1 : ib)
    return a.localeCompare(b, 'pt-BR')
  })
}

/* ── Peças ────────────────────────────────────────────────────────────────── */

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--ws-text-secondary)',
  whiteSpace: 'nowrap',
}

const controlStyle: CSSProperties = {
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--ws-surface)',
  color: 'var(--ws-text-primary)',
  fontSize: 12.5,
  fontFamily: 'var(--font-body)',
  padding: '6px 10px',
  outline: 'none',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  )
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--ws-bg)', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 2, gap: 2 }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 4,
              padding: '4px 10px', fontSize: 12, fontWeight: on ? 700 : 500,
              fontFamily: 'var(--font-body)',
              background: on ? 'var(--ws-surface)' : 'transparent',
              color: on ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)',
              boxShadow: on ? 'var(--shadow-sm)' : 'none',
              transition: 'background .15s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Multi-seleção simples. Nenhum item marcado = sem filtro. */
function MultiSelect({ label, options, selected, onChange }: {
  label: string
  options: readonly string[]
  selected: string[]
  onChange: (v: string[]) => void
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

  const resumo = selected.length === 0 ? 'Todas' : selected.length === 1 ? selected[0] : `${selected.length} selecionadas`

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
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 40,
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
          borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,.12))',
          padding: 6, minWidth: 190,
        }}>
          <div style={{ ...labelStyle, padding: '4px 8px 6px' }}>{label}</div>
          {options.map(opt => {
            const on = selected.includes(opt)
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12.5, color: 'var(--ws-text-primary)' }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange(on ? selected.filter(s => s !== opt) : [...selected, opt])}
                  style={{ accentColor: 'var(--ws-accent, #2ABCB5)', cursor: 'pointer' }}
                />
                {opt}
              </label>
            )
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{ width: '100%', marginTop: 4, padding: '5px 8px', border: 'none', background: 'transparent', color: 'var(--ws-text-secondary)', fontSize: 11.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Barra ────────────────────────────────────────────────────────────────── */

interface FilterBarProps {
  extra?: ReactNode
  /** Valores de fonte_macro presentes nos dados. Sem isso o filtro fica vazio. */
  fontesDisponiveis?: string[]
  /** Grupos de sub-fonte presentes nos dados. */
  subFontesDisponiveis?: string[]
}

export function FilterBar({ extra, fontesDisponiveis, subFontesDisponiveis }: FilterBarProps) {
  const {
    brandKey, setBrandKey,
    periodMode, setPeriodMode,
    periodValue, setPeriodValue,
    range, setRange,
    fontes, setFontes,
    subFontes, setSubFontes,
    viewModes, setSalesMode, setFunnelView, setEventSource,
    resetFiltros,
  } = useSharedFilters()

  const sentinela = useRef<HTMLDivElement>(null)
  const [grudado, setGrudado] = useState(false)

  useEffect(() => {
    const el = sentinela.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setGrudado(!entry.isIntersecting),
      { threshold: 1 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const marcaAtual = BRANDS_WITH_OVERVIEW.find(b => b.key === brandKey) ?? BRANDS_WITH_OVERVIEW[0]

  // Opções vindas dos dados. O que já está selecionado entra na lista mesmo que
  // suma dos dados — senão o usuário fica com um filtro ativo que não consegue
  // desmarcar. SUB_FONTE_GRUPOS entra como piso porque é um domínio fechado.
  const opcoesFonte = useMemo(
    () => ordenarOpcoes([...new Set([...(fontesDisponiveis ?? []), ...fontes])]),
    [fontesDisponiveis, fontes],
  )
  const opcoesSubFonte = useMemo(
    () => ordenarOpcoes([...new Set([...(subFontesDisponiveis ?? SUB_FONTE_GRUPOS), ...subFontes])]),
    [subFontesDisponiveis, subFontes],
  )

  return (
    <>
      <div ref={sentinela} style={{ height: 1 }} />
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--ws-surface)',
          borderBottom: '1px solid var(--ws-border)',
          borderRadius: grudado ? 0 : 'var(--radius-md)',
          boxShadow: grudado ? '0 6px 18px rgba(0,0,0,.10)' : 'var(--shadow-sm)',
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap',
          transition: 'box-shadow .18s, border-radius .18s',
        }}
      >
        <Field label="Marca">
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <span style={{
              position: 'absolute', left: 10, width: 8, height: 8, borderRadius: '50%',
              background: marcaAtual.accent, pointerEvents: 'none',
            }} />
            <select
              value={brandKey}
              onChange={e => setBrandKey(e.target.value)}
              style={{ ...controlStyle, appearance: 'none', paddingLeft: 26, paddingRight: 24, cursor: 'pointer' }}
            >
              {BRANDS_WITH_OVERVIEW.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </div>
        </Field>

        <Field label="Período">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Segmented
              value={periodMode}
              onChange={setPeriodMode}
              options={PERIOD_MODES.map(m => ({ value: m, label: PERIOD_LABEL[m] }))}
            />

            {periodMode === 'dia' ? (
              // Intervalo livre: os dois calendários nativos do navegador.
              <>
                <input
                  type="date"
                  value={range.start}
                  max={range.end}
                  onChange={e => setRange({ ...range, start: e.target.value })}
                  style={{ ...controlStyle, padding: '5px 8px' }}
                />
                <span style={{ color: 'var(--ws-text-secondary)', fontSize: 12 }}>—</span>
                <input
                  type="date"
                  value={range.end}
                  min={range.start}
                  onChange={e => setRange({ ...range, end: e.target.value })}
                  style={{ ...controlStyle, padding: '5px 8px' }}
                />
              </>
            ) : (
              // Mês / trimestre / ano: escolhe QUAL período daquela granularidade.
              <select
                value={periodValue}
                onChange={e => setPeriodValue(e.target.value)}
                style={{ ...controlStyle, cursor: 'pointer', minWidth: 148 }}
              >
                {opcoesPara(periodMode).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}

            <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {range.start.split('-').reverse().join('/')} — {range.end.split('-').reverse().join('/')}
            </span>
          </div>
        </Field>

        <Field label="Fonte">
          <MultiSelect label="Fonte macro" options={opcoesFonte} selected={fontes} onChange={setFontes} />
        </Field>

        <Field label="Sub-fonte">
          <MultiSelect label="Origem do tráfego" options={opcoesSubFonte} selected={subFontes} onChange={setSubFontes} />
        </Field>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--ws-border)', margin: '0 2px' }} />

        <Field label="Vendas">
          <Segmented
            value={viewModes.salesMode}
            onChange={setSalesMode}
            options={[{ value: 'deals', label: 'Negócios' }, { value: 'units', label: 'Unidades' }]}
          />
        </Field>

        <Field label="Deals criados no período">
          <Segmented
            value={viewModes.funnelView}
            onChange={setFunnelView}
            options={[{ value: 'stageDate', label: 'Off' }, { value: 'cohort', label: 'On' }]}
          />
        </Field>

        <Field label="Contagem">
          <Segmented
            value={viewModes.eventSource}
            onChange={setEventSource}
            options={[{ value: 'unique', label: 'Deals únicos' }, { value: 'passages', label: 'Passagens' }]}
          />
        </Field>

        {extra}

        <button
          type="button"
          onClick={resetFiltros}
          title="Voltar aos filtros padrão"
          style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: 'var(--ws-text-secondary)' }}
        >
          <RotateCcw size={13} /> Limpar
        </button>
      </div>
    </>
  )
}
