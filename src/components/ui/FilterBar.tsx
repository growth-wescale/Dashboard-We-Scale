/**
 * Barra de filtros das abas de Vendas.
 *
 * Fica congelada no topo ao rolar (como "congelar painéis" do Excel), porque o
 * funil tem 12 etapas e o usuário perde de vista qual recorte está olhando.
 * A sombra só aparece depois que a barra descola do topo — daí o sentinela.
 *
 * Celular/tablet (modo compacto): os 10 controles abertos ocupariam a tela
 * inteira, e grudados no topo cobririam a página. A barra vira uma linha só
 * (botão "Filtros" + resumo do recorte) e os controles abrem num painel por
 * cima da página — os mesmos componentes, aplicando na hora.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { BRAND_LIST, opcoesMarcaDisponiveis } from '@/constants/brands'
import { PERIOD_LABEL, useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useAcesso } from '@/contexts/AcessoContext'
import { useMediaQuery, MQ_COMPACTO } from '@/hooks/useMediaQuery'
import { opcoesPara } from '@/lib/periodo'
import type { OpcaoPeriodo, PeriodMode } from '@/lib/periodo'
import { MultiSelect, controlStyle, labelStyle, ordenarOpcoes } from './MultiSelect'
import { DateRangePicker } from './DateRangePicker'

const PERIOD_MODES: PeriodMode[] = ['dia', 'mes', 'trimestre', 'ano']

const COR_INVALIDO = 'var(--status-critico, #dc2626)'

const fmtIso = (iso: string) => iso.split('-').reverse().join('/')

/* ── Peças ────────────────────────────────────────────────────────────────── */

function Field({ label, largo, children }: { label: string; largo?: boolean; children: ReactNode }) {
  return (
    // `largo`: ocupa a linha inteira no painel compacto (grid); na barra (flex) não tem efeito.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, gridColumn: largo ? '1 / -1' : undefined }}>
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
    <div style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'var(--ws-bg)', border: '1px solid var(--ws-border)', borderRadius: 'var(--radius-sm)', padding: 2, gap: 2 }}>
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
  /** Chaves de BRAND_LIST presentes nos dados (ex.: dentro do toggle de origem). */
  marcasDisponiveis?: string[]
  /** Valores de fonte_macro presentes nos dados. Sem isso o filtro fica vazio. */
  fontesDisponiveis?: string[]
  /** Grupos de sub-fonte presentes nos dados. */
  subFontesDisponiveis?: string[]
  /** Nomes de SDR presentes nos dados. */
  sdrsDisponiveis?: string[]
  /** Nomes de Closer presentes nos dados. */
  closersDisponiveis?: string[]
  /** Esconde o toggle Negócios×Unidades — página sem conceito de venda fechada (ex.: Análise de Perda). */
  hideVendasToggle?: boolean
  /** Esconde o toggle Deals únicos×Passagens — página cujo evento é terminal único por natureza (ex.: Análise de Perda). */
  hideContagemToggle?: boolean
}

export function FilterBar({
  extra, marcasDisponiveis, fontesDisponiveis, subFontesDisponiveis, sdrsDisponiveis, closersDisponiveis,
  hideVendasToggle, hideContagemToggle,
}: FilterBarProps) {
  const {
    brandKeys, setBrandKeys,
    periodMode, setPeriodMode,
    periodValues, setPeriodValues,
    range, setRange,
    fontes, setFontes,
    subFontes, setSubFontes,
    sdrs, setSdrs,
    closers, setClosers,
    viewModes, setSalesMode, setFunnelView, setEventSource,
    resetFiltros,
  } = useSharedFilters()

  const compacto = useMediaQuery(MQ_COMPACTO)
  const [painelAberto, setPainelAberto] = useState(false)
  const painelVisivel = compacto && painelAberto

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

  // Painel aberto: Esc fecha e a página de trás não rola junto.
  useEffect(() => {
    if (!painelVisivel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPainelAberto(false) }
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflowAntes
      window.removeEventListener('keydown', onKey)
    }
  }, [painelVisivel])

  // Pessoa limitada a marcas (controle de acessos) só vê as marcas dela como opção.
  const { marcas: marcasPermitidas } = useAcesso()
  const opcoesMarca = useMemo(
    () => opcoesMarcaDisponiveis(marcasDisponiveis)
      .filter(b => !marcasPermitidas || marcasPermitidas.includes(b.key))
      .map(b => ({ value: b.key, label: b.label })),
    [marcasDisponiveis, marcasPermitidas],
  )
  const universoMarcas = marcasPermitidas?.length ?? BRAND_LIST.length
  const rotuloTodasMarcas = marcasPermitidas ? 'Todas as suas marcas' : 'Consolidado'

  // Opções vindas dos dados — já cruzadas com os demais filtros ativos e o
  // período (ver `opcoesFiltro` em FunilVendas). O que já está selecionado
  // entra na lista mesmo que suma do recorte, senão o usuário fica com um
  // filtro ativo que não consegue desmarcar. Sub-fonte deixou de ter piso
  // fixo: com o fallback pro campo "Sub-Fonte" do RD não é mais domínio fechado.
  const opcoesFonte = useMemo(
    () => ordenarOpcoes([...new Set([...(fontesDisponiveis ?? []), ...fontes])]).map(v => ({ value: v, label: v })),
    [fontesDisponiveis, fontes],
  )
  const opcoesSubFonte = useMemo(
    () => ordenarOpcoes([...new Set([...(subFontesDisponiveis ?? []), ...subFontes])]).map(v => ({ value: v, label: v })),
    [subFontesDisponiveis, subFontes],
  )
  const opcoesSdr = useMemo(
    () => ordenarOpcoes([...new Set([...(sdrsDisponiveis ?? []), ...sdrs])]).map(v => ({ value: v, label: v })),
    [sdrsDisponiveis, sdrs],
  )
  const opcoesCloser = useMemo(
    () => ordenarOpcoes([...new Set([...(closersDisponiveis ?? []), ...closers])]).map(v => ({ value: v, label: v })),
    [closersDisponiveis, closers],
  )
  const opcoesPeriodo: OpcaoPeriodo[] = useMemo(
    () => (periodMode === 'dia' ? [] : opcoesPara(periodMode)),
    [periodMode],
  )

  // Resumo da linha compacta: o recorte que está valendo, sem abrir o painel.
  const faltaObrigatorio = brandKeys.length === 0 || (periodMode !== 'dia' && periodValues.length === 0)
  const qtdOutrosFiltros = [fontes, subFontes, sdrs, closers].filter(f => f.length > 0).length
  const resumoMarca = brandKeys.length >= universoMarcas
    ? rotuloTodasMarcas
    : brandKeys.length === 1
      ? (BRAND_LIST.find(b => b.key === brandKeys[0])?.label ?? brandKeys[0])
      : `${brandKeys.length} marcas`
  const resumoPeriodo = periodMode === 'dia'
    ? (range.start === range.end ? fmtIso(range.start) : `${fmtIso(range.start)} – ${fmtIso(range.end)}`)
    : periodValues.length === 1
      ? (opcoesPeriodo.find(o => o.value === periodValues[0])?.label ?? periodValues[0])
      : `${periodValues.length} períodos`

  const campos = (
    <>
      <Field label="Marca">
        {/* obrigatório: vazio → borda vermelha + página esconde os dados */}
        <MultiSelect label="Marca" options={opcoesMarca} selected={brandKeys} onChange={setBrandKeys} required allLabel={rotuloTodasMarcas} universoTotal={universoMarcas} />
      </Field>

      <Field label="Período" largo>
        <div style={{
          display: 'flex', gap: 8,
          // No painel compacto cada peça ganha linha própria: o calendário abre
          // ancorado à esquerda do botão e não cabe se o botão estiver no meio da tela.
          ...(compacto
            ? { flexDirection: 'column', alignItems: 'stretch' }
            : { alignItems: 'center' }),
        }}>
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
              {/* Mês / trimestre / ano: multi-seleção estilo Excel. Obrigatório —
                  vazio → borda vermelha + página esconde os dados. */}
              <MultiSelect
                label={PERIOD_LABEL[periodMode]}
                options={opcoesPeriodo}
                selected={periodValues}
                onChange={setPeriodValues}
                required
              />
              <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {fmtIso(range.start)} — {fmtIso(range.end)}
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

      <Field label="SDR">
        <MultiSelect label="SDR" options={opcoesSdr} selected={sdrs} onChange={setSdrs} />
      </Field>

      <Field label="Closer">
        <MultiSelect label="Closer" options={opcoesCloser} selected={closers} onChange={setClosers} />
      </Field>

      {!compacto && <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--ws-border)', margin: '0 2px' }} />}

      {!hideVendasToggle && (
        <Field label="Vendas">
          <Segmented
            value={viewModes.salesMode}
            onChange={setSalesMode}
            options={[{ value: 'deals', label: 'Negócios' }, { value: 'units', label: 'Unidades' }]}
          />
        </Field>
      )}

      <Field label="Deals criados no período">
        <Segmented
          value={viewModes.funnelView}
          onChange={setFunnelView}
          options={[{ value: 'stageDate', label: 'Off' }, { value: 'cohort', label: 'On' }]}
        />
      </Field>

      {!hideContagemToggle && (
        <Field label="Contagem">
          <Segmented
            value={viewModes.eventSource}
            onChange={setEventSource}
            options={[{ value: 'unique', label: 'Deals únicos' }, { value: 'passages', label: 'Passagens' }]}
          />
        </Field>
      )}

      {extra}
    </>
  )

  const barraStyle = {
    // Compacto: gruda logo abaixo da barra do topo (56px), pra o botão do menu
    // continuar alcançável com a página rolada.
    position: 'sticky', top: compacto ? 56 : 0, zIndex: 30,
    background: 'var(--ws-surface)',
    borderBottom: '1px solid var(--ws-border)',
    borderRadius: grudado ? 0 : 'var(--radius-md)',
    boxShadow: grudado ? '0 6px 18px rgba(0,0,0,.10)' : 'var(--shadow-sm)',
    marginBottom: 20,
    transition: 'box-shadow .18s, border-radius .18s',
  } as const

  if (compacto) {
    return (
      <>
        <div ref={sentinela} style={{ height: 1 }} />
        <div style={{ ...barraStyle, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setPainelAberto(true)}
            aria-haspopup="dialog"
            style={{
              ...controlStyle,
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, flexShrink: 0,
              padding: '7px 11px',
              border: faltaObrigatorio ? `1px solid ${COR_INVALIDO}` : controlStyle.border,
              color: faltaObrigatorio ? COR_INVALIDO : controlStyle.color,
            }}
          >
            <SlidersHorizontal size={14} />
            Filtros
            {qtdOutrosFiltros > 0 && (
              <span style={{
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast, #fff)',
              }}>{qtdOutrosFiltros}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPainelAberto(true)}
            style={{
              flex: 1, minWidth: 0, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-body)', fontSize: 12.5,
              color: faltaObrigatorio ? COR_INVALIDO : 'var(--ws-text-secondary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {faltaObrigatorio ? 'Selecione marca e período' : `${resumoMarca} · ${resumoPeriodo}`}
          </button>
          <button
            type="button"
            onClick={resetFiltros}
            title="Voltar aos filtros padrão"
            aria-label="Voltar aos filtros padrão"
            style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center', padding: '7px 9px', cursor: 'pointer', color: 'var(--ws-text-secondary)', flexShrink: 0 }}
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {painelVisivel && (
          <>
            <div onClick={() => setPainelAberto(false)} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, backdropFilter: 'blur(2px)',
            }} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Filtros"
              className="ws-filter-sheet"
              style={{
                position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                width: 'min(640px, 100vw)', maxHeight: '88dvh', zIndex: 1001,
                background: 'var(--ws-surface)', borderRadius: '18px 18px 0 0',
                boxShadow: '0 -8px 40px rgba(0,0,0,.18)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--ws-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ws-text-primary)' }}>Filtros</span>
                <button type="button" onClick={() => setPainelAberto(false)} aria-label="Fechar filtros" style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ws-text-secondary)',
                  padding: 6, borderRadius: 6, display: 'flex',
                }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{
                overflowY: 'auto', padding: 16,
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                gap: '16px 12px', alignContent: 'start',
              }}>
                {campos}
              </div>

              <div style={{
                padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--ws-border)',
                display: 'flex', gap: 10, flexShrink: 0,
              }}>
                <button type="button" onClick={resetFiltros} style={{
                  ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  padding: '10px 14px', color: 'var(--ws-text-secondary)',
                }}>
                  <RotateCcw size={14} /> Limpar
                </button>
                <button type="button" onClick={() => setPainelAberto(false)} style={{
                  flex: 1, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  padding: '10px 14px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)',
                  background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast, #fff)',
                }}>
                  Ver resultados
                </button>
              </div>
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <>
      <div ref={sentinela} style={{ height: 1 }} />
      <div
        style={{
          ...barraStyle,
          padding: '12px 16px',
          display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap',
        }}
      >
        {campos}

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
