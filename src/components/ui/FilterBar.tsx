/**
 * Barra de filtros das abas de Vendas.
 *
 * Fica congelada no topo ao rolar (como "congelar painéis" do Excel), porque o
 * funil tem 12 etapas e o usuário perde de vista qual recorte está olhando.
 * A sombra só aparece depois que a barra descola do topo — daí o sentinela.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { BRAND_LIST } from '@/constants/brands'
import { SUB_FONTE_GRUPOS } from '@/lib/fonteMapping'
import { PERIOD_LABEL, useSharedFilters } from '@/contexts/SharedFiltersContext'
import { opcoesPara } from '@/lib/periodo'
import type { OpcaoPeriodo, PeriodMode } from '@/lib/periodo'
import { MultiSelect, controlStyle, labelStyle, ordenarOpcoes } from './MultiSelect'
import { DateRangePicker } from './DateRangePicker'

const PERIOD_MODES: PeriodMode[] = ['dia', 'mes', 'trimestre', 'ano']

/* ── Peças ────────────────────────────────────────────────────────────────── */

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
    brandKeys, setBrandKeys,
    periodMode, setPeriodMode,
    periodValues, setPeriodValues,
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

  const opcoesMarca = useMemo(() => BRAND_LIST.map(b => ({ value: b.key, label: b.label })), [])

  // Opções vindas dos dados. O que já está selecionado entra na lista mesmo que
  // suma dos dados — senão o usuário fica com um filtro ativo que não consegue
  // desmarcar. SUB_FONTE_GRUPOS entra como piso porque é um domínio fechado.
  const opcoesFonte = useMemo(
    () => ordenarOpcoes([...new Set([...(fontesDisponiveis ?? []), ...fontes])]).map(v => ({ value: v, label: v })),
    [fontesDisponiveis, fontes],
  )
  const opcoesSubFonte = useMemo(
    () => ordenarOpcoes([...new Set([...(subFontesDisponiveis ?? SUB_FONTE_GRUPOS), ...subFontes])]).map(v => ({ value: v, label: v })),
    [subFontesDisponiveis, subFontes],
  )
  const opcoesPeriodo: OpcaoPeriodo[] = useMemo(
    () => (periodMode === 'dia' ? [] : opcoesPara(periodMode)),
    [periodMode],
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
          <MultiSelect label="Marca" options={opcoesMarca} selected={brandKeys} onChange={setBrandKeys} minSelected={1} allLabel="Consolidado" />
        </Field>

        <Field label="Período">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Segmented
              value={periodMode}
              onChange={setPeriodMode}
              options={PERIOD_MODES.map(m => ({ value: m, label: PERIOD_LABEL[m] }))}
            />

            {periodMode === 'dia' ? (
              // Calendário + atalhos (Hoje, Ontem, Últimos 7 dias...), um só
              // clique pra aplicar o range — antes eram 2 calendários nativos
              // separados (início, depois fim), incômodo pra escolher qualquer
              // recorte e fácil de deixar o range invertido sem perceber.
              <DateRangePicker value={range} onChange={setRange} />
            ) : (
              <>
                {/* Mês / trimestre / ano: multi-seleção estilo Excel — pelo menos 1 marcado sempre. */}
                <MultiSelect
                  label={PERIOD_LABEL[periodMode]}
                  options={opcoesPeriodo}
                  selected={periodValues}
                  onChange={setPeriodValues}
                  minSelected={1}
                />
                <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {range.start.split('-').reverse().join('/')} — {range.end.split('-').reverse().join('/')}
                </span>
              </>
            )}
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
