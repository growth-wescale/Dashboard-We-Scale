import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { OrigemToggle } from '@/components/ui/OrigemToggle'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { FiltrosObrigatoriosAviso } from '@/components/ui/FiltrosObrigatoriosAviso'
import { DealCardKanban } from '@/components/timeline/DealCardKanban'
import { MultiSelect, labelStyle } from '@/components/ui/MultiSelect'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { buildScopeFilter, stageLabel, toWindow } from '@/lib/metrics'
import { montarKanban } from '@/lib/timeline/kanban'
import { funilFilterOptions, dealNaJanela } from '@/lib/funilFilterOptions'
import { parseIdDeal } from '@/lib/rd'
import { BRAND_LIST } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'
import { nf } from '@/lib/format'

/** Cards renderizados por coluna antes do "ver mais". */
const POR_COLUNA = 20
const LARGURA_COLUNA = 280
const pad = { padding: 'var(--page-pad-top) var(--page-pad-x) 60px', maxWidth: 1400, margin: '0 auto' } as const

/**
 * Filtro de status LOCAL desta página — de propósito fora da `FilterBar` e do
 * `SharedFiltersContext`, que são compartilhados com Visão Macro, Performance e
 * Análise de Perda: lá um filtro de status mudaria métrica calada (ou não teria
 * sentido nenhum, já que Análise de Perda é 100% perdido por definição).
 *
 * Padrão "Em andamento": medido, na coluna mais cheia os perdidos são ~8x os
 * vivos (1790 contra 228), então o quadro sem filtro abre como um cemitério.
 * Seleção vazia = sem restrição, igual aos outros filtros.
 */
const STATUS_OPCOES = [
  { value: 'Em andamento', label: 'Em andamento' },
  { value: 'Ganho', label: 'Ganho' },
  { value: 'Perdido', label: 'Perdido' },
] as const
const STATUS_PADRAO = ['Em andamento']

function useDebounce(v: string, ms: number): string {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}
/** Busca tolerante a acento e caixa — "jose" acha "José". */
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function LinhaDoTempo() {
  const navigate = useNavigate()
  const { origem, brandKeys, periodMode, periodValues, ranges, fontes, subFontes, sdrs, closers, viewModes } = useSharedFilters()
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca, 300)
  const [status, setStatus] = useState<string[]>(STATUS_PADRAO)
  /** Quantos cards cada coluna já revelou. Sem entrada = `POR_COLUNA`. */
  const [limites, setLimites] = useState<Record<string, number>>({})
  const agora = useMemo(() => new Date(), [])

  const marcasParaEscopo = useMemo(
    () => brandKeys
      .map(k => BRAND_LIST.find(b => b.key === k))
      .filter((b): b is BrandDef => !!b)
      .map(b => b.marca)
      .filter((m): m is Marca => !!m),
    [brandKeys],
  )

  // Sempre carrega o recorte inteiro da origem — marca filtrada no cliente
  // (via `scope`), igual às outras abas de Vendas.
  const { data: rows, error: rowsError, loading } = useFunilVendas(origem)

  const scope = useMemo(
    () => buildScopeFilter({ origem, marcas: marcasParaEscopo, fontes, subFontes, sdrs, closers }),
    [origem, marcasParaEscopo, fontes, subFontes, sdrs, closers],
  )
  const win = useMemo(() => toWindow(null, null, ranges.map(r => ({ from: r.start, to: r.end }))), [ranges])
  const cohort = viewModes.funnelView === 'cohort'
  const opcoes = useMemo(
    () => funilFilterOptions({ rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers, cohort }),
    [rows, win, marcasParaEscopo, fontes, subFontes, sdrs, closers, cohort],
  )
  const marcasDisponiveis = useMemo(
    () => BRAND_LIST.filter(b => b.marca && opcoes.marcas.includes(b.marca)).map(b => b.key),
    [opcoes.marcas],
  )

  // Id ou link do RD colado: vai direto, ignorando os filtros (o deal pode estar fora do recorte).
  useEffect(() => { const id = parseIdDeal(termo); if (id) navigate(`/linha-do-tempo/${id}`) }, [termo, navigate])

  const lista = useMemo(() => {
    const t = semAcento(termo.trim())
    return rows
      .filter(r => r.eh_ciclo_atual && scope(r) && dealNaJanela(r, win, cohort))
      .filter(r => status.length === 0 || status.includes(r.status_atual ?? ''))
      .filter(r => !t || semAcento(r.nome_negociacao ?? '').includes(t))
  }, [rows, scope, win, cohort, termo, status])
  const colunas = useMemo(() => montarKanban(lista, agora), [lista, agora])
  useEffect(() => { setLimites({}) }, [termo, scope, win, cohort, status])

  // Filtro obrigatório sem nada marcado → esconde os dados e pede a seleção.
  const faltando = [
    brandKeys.length === 0 ? 'uma marca' : null,
    periodMode !== 'dia' && periodValues.length === 0 ? 'um período' : null,
  ].filter((x): x is string => x !== null)

  const barra = (
    <FilterBar
      marcasDisponiveis={marcasDisponiveis}
      fontesDisponiveis={opcoes.fontes}
      subFontesDisponiveis={opcoes.subFontes}
      sdrsDisponiveis={opcoes.sdrs}
      closersDisponiveis={opcoes.closers}
      hideVendasToggle
      hideContagemToggle
    />
  )

  if (faltando.length > 0) {
    return (
      <div style={pad}>
        <PageTop title="Linha do Tempo" titleAside={<OrigemToggle />} subtitle="Selecione os filtros obrigatórios" />
        {barra}
        <QueryErrorBanner errors={[rowsError]} scope="Linha do Tempo" />
        <FiltrosObrigatoriosAviso faltando={faltando} />
      </div>
    )
  }

  return (
    <div style={pad}>
      <PageTop
        title="Linha do Tempo"
        titleAside={<OrigemToggle />}
        subtitle="Entre num deal e veja a história dele: etapas, toques e reuniões, com zoom."
      />
      {barra}
      <QueryErrorBanner errors={[rowsError]} scope="Linha do Tempo" />
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', margin: '16px 0' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 0 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--ws-text-secondary)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar deal por nome, ou colar o id / link do RD"
            aria-label="Buscar deal por nome, ou colar o id / link do RD"
            style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 12, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)', fontSize: 14, color: 'var(--ws-text-primary)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>Status</span>
          <MultiSelect label="Status do deal" options={STATUS_OPCOES} selected={status} onChange={setStatus} />
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', marginBottom: 10 }}>
        {loading && rows.length === 0
          ? 'Carregando…'
          : `${nf(lista.length)} deals no recorte · alguma etapa dentro do período${cohort ? ' (safra de MQL)' : ''}`}
      </div>
      {lista.length === 0 && !loading && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ws-text-secondary)', fontSize: 13 }}>
          Nenhum deal no recorte atual. Amplie o período, revise o status, ou cole o link do RD.
        </div>
      )}
      {/* Quadro: rola na horizontal, cada coluna rola na vertical por conta própria. */}
      <div style={{ display: lista.length === 0 ? 'none' : 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
        {colunas.map(col => {
          const limite = limites[col.etapa] ?? POR_COLUNA
          const restantes = col.cards.length - limite
          return (
            <div
              key={col.etapa}
              style={{
                flex: `0 0 ${LARGURA_COLUNA}px`, width: LARGURA_COLUNA, display: 'flex', flexDirection: 'column',
                background: 'var(--ws-bg)', border: '1px solid var(--ws-border)', borderRadius: 12, maxHeight: '70vh',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
                padding: '10px 12px', borderBottom: '1px solid var(--ws-border)', position: 'sticky', top: 0,
                background: 'var(--ws-bg)', borderRadius: '12px 12px 0 0',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ws-text-primary)' }}>
                  {stageLabel(col.etapa, origem)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {nf(col.cards.length)}
                </span>
              </div>
              <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.cards.length === 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', padding: '6px 4px' }}>Sem deals</div>
                )}
                {col.cards.slice(0, limite).map(c => (
                  <DealCardKanban key={`${c.row.id_lead}::${c.row.ciclo}`} card={c} />
                ))}
                {restantes > 0 && (
                  <button
                    type="button"
                    onClick={() => setLimites(l => ({ ...l, [col.etapa]: limite + POR_COLUNA }))}
                    style={{ padding: '8px 10px', borderRadius: 999, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                  >
                    Ver mais ({nf(restantes)})
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
