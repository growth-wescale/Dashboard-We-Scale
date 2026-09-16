import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { FilterBar } from '@/components/ui/FilterBar'
import { OrigemToggle } from '@/components/ui/OrigemToggle'
import { QueryErrorBanner } from '@/components/ui/QueryErrorBanner'
import { FiltrosObrigatoriosAviso } from '@/components/ui/FiltrosObrigatoriosAviso'
import { DealCardMacro } from '@/components/timeline/DealCardMacro'
import { useSharedFilters } from '@/contexts/SharedFiltersContext'
import { useFunilVendas } from '@/hooks/useFunilVendas'
import { buildScopeFilter, toWindow } from '@/lib/metrics'
import { funilFilterOptions, dealNaJanela } from '@/lib/funilFilterOptions'
import { parseIdDeal } from '@/lib/rd'
import { BRAND_LIST } from '@/constants/brands'
import type { BrandDef } from '@/constants/brands'
import type { Marca } from '@/lib/types'
import { nf } from '@/lib/format'

const PAGINA = 50
const pad = { padding: 'var(--page-pad-top) var(--page-pad-x) 60px', maxWidth: 1400, margin: '0 auto' } as const

function useDebounce(v: string, ms: number): string {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}
/** Busca tolerante a acento e caixa — "jose" acha "José". */
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function LinhaDoTempo() {
  const navigate = useNavigate()
  const { origem, brandKeys, periodMode, periodValues, ranges, fontes, subFontes, sdrs, closers, viewModes } = useSharedFilters()
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca, 300)
  const [limite, setLimite] = useState(PAGINA)
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
      .filter(r => !t || semAcento(r.nome_negociacao ?? '').includes(t))
      .sort((a, b) => (b.data_novo_mql ?? '').localeCompare(a.data_novo_mql ?? ''))
  }, [rows, scope, win, cohort, termo])
  useEffect(() => { setLimite(PAGINA) }, [termo, scope, win, cohort])

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
      <div style={{ position: 'relative', margin: '16px 0' }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--ws-text-secondary)' }} />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar deal por nome, ou colar o id / link do RD"
          aria-label="Buscar deal por nome, ou colar o id / link do RD"
          style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 12, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)', fontSize: 14, color: 'var(--ws-text-primary)' }}
        />
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', marginBottom: 10 }}>
        {loading && rows.length === 0
          ? 'Carregando…'
          : `${nf(lista.length)} deals no recorte · alguma etapa dentro do período${cohort ? ' (safra de MQL)' : ''}`}
      </div>
      {lista.length === 0 && !loading && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ws-text-secondary)', fontSize: 13 }}>
          Nenhum deal com esse nome no recorte atual. Amplie o período ou cole o link do RD.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {lista.slice(0, limite).map(r => <DealCardMacro key={`${r.id_lead}::${r.ciclo}`} row={r} agora={agora} />)}
      </div>
      {lista.length > limite && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setLimite(l => l + PAGINA)}
            style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid var(--ws-border)', background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer' }}
          >
            Carregar mais ({nf(lista.length - limite)} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
