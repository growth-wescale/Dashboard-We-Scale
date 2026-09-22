import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { normalizeMarcaRaw } from '@/constants/brands'
import { buscarTodasPaginas } from '@/lib/paginacao'
import { carregarComCache, lerCache } from '@/lib/cacheConsulta'
import type { FunnelRow, OrigemComercial } from '@/lib/funnelTypes'

/**
 * Lê a base do funil de Vendas (view `vw_funil_vendas`, no Supabase de Expansão).
 *
 * Traz as linhas SEM filtro de data e deixa o recorte por período para a camada
 * `metrics.ts`. Isso é de propósito: o hook antigo filtrava no servidor com um
 * `.or()` sobre cinco colunas de data, e qualquer etapa fora dessa lista sumia
 * do funil. Além disso o modo safra precisa de deals cujo MQL está na janela
 * mas cuja etapa aconteceu fora dela — impossível de expressar num filtro só.
 *
 * São ~7,7 mil linhas (set/26: 5,9 mil Inbound + 1,8 mil Prospecção Ativa);
 * a view já exclui deals de teste, status Excluído e funis fora do escopo
 * comercial.
 *
 * `origem` (Inbound / Prospecção Ativa) É filtrada no servidor — é sempre um
 * valor só. Marca NÃO é filtrada aqui: as páginas filtram no cliente (igual
 * Fonte/SDR). Filtrar 1 marca no servidor colapsava a lista de "marcas com
 * dado" e fazia marcas sumirem/reaparecerem conforme a seleção.
 */

const PAGE_SIZE = 1000

/** Colunas explícitas: `select('*')` traria payload à toa e esconde quebras. */
const COLS = [
  'id_lead', 'ciclo', 'eh_reciclagem', 'eh_ciclo_atual',
  'marca', 'nome_funil', 'etapa_funil', 'id_etapa_atual', 'status_atual',
  'nome_sdr', 'nome_closer', 'nome_negociacao',
  'fonte_macro', 'sub_fonte', 'sub_fonte_crm', 'utm_source', 'utm_medium', 'utm_campaign',
  'valor_contrato', 'quantidade_unidades', 'valor_produto', 'motivo_perda',
  'data_criacao_negociacao', 'data_criacao_original',
  'data_novo_mql', 'data_tentando_contato', 'data_contato_efetivo',
  'data_interesse_reuniao', 'data_conexao',
  'data_agendamento_reuniao_sql', 'data_reuniao_realizada', 'data_no_show',
  'data_sal', 'data_oportunidade', 'data_comite', 'data_pre_contrato',
  'data_venda', 'data_perdido', 'origem_comercial',
].join(',')

export interface UseFunilVendasResult {
  data: FunnelRow[]
  loading: boolean
  error: string | null
  reload: () => void
}

/** Páginas simultâneas — ver `paginacao.ts`. */
const CONCORRENCIA = 4

/**
 * Ao voltar para uma aba, mostra o cache na hora e só rebusca em segundo plano
 * se ele tiver mais que isso. A matview por trás atualiza a cada 2 min, então
 * menos que 1 min seria só carga repetida no banco.
 */
const IDADE_REVALIDAR_MS = 60_000

async function fetchAll(origem: OrigemComercial): Promise<FunnelRow[]> {
  const { rows, error } = await buscarTodasPaginas<FunnelRow>(async (de, ate, contar) => {
    const { data, error: err, count } = await supabaseVendas
      .from('vw_funil_vendas')
      .select(COLS, contar ? { count: 'exact' } : undefined)
      .eq('origem_comercial', origem)
      // Desempate por (id_lead, ciclo), a chave da view: sem ordem total o
      // OFFSET pode repetir/pular linha entre páginas.
      .order('data_criacao_negociacao', { ascending: false })
      .order('id_lead', { ascending: true })
      .order('ciclo', { ascending: true })
      .range(de, ate)
    return { rows: (data ?? []) as unknown as FunnelRow[], error: err?.message ?? null, total: count }
  }, { tamanhoPagina: PAGE_SIZE, concorrencia: CONCORRENCIA })

  if (error) throw new Error(error)
  // Normaliza aliases de marca (ex.: 'Odonto Legacy' → 'Odonto Scale') antes
  // de qualquer filtro/agrupamento por marca — ver MARCA_ALIASES em brands.ts.
  for (const r of rows) r.marca = normalizeMarcaRaw(r.marca) ?? r.marca
  return rows
}

/**
 * Cache compartilhado por origem (`cacheConsulta.ts`): Visão Macro, Performance
 * e Análise de Perda usam a mesma base, então trocar de aba não baixa de novo.
 */
export function useFunilVendas(origem: OrigemComercial): UseFunilVendasResult {
  const chave = `vw_funil_vendas:${origem}`
  const [data, setData] = useState<FunnelRow[]>(() => lerCache<FunnelRow[]>(chave)?.valor ?? [])
  const [loading, setLoading] = useState(() => !lerCache(chave))
  const [error, setError] = useState<string | null>(null)
  // Chave ativa: resposta de uma origem antiga (usuário trocou o toggle no meio
  // da carga) ou que chega depois de desmontar é descartada.
  const chaveAtiva = useRef<string | null>(chave)

  const load = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true)
    try {
      // Carga já em voo para a mesma origem (polling, refresh, outra aba) é
      // reaproveitada em vez de disparar outra em cima.
      const rows = await carregarComCache(chave, () => fetchAll(origem))
      if (chaveAtiva.current !== chave) return
      setData(rows)
      setError(null)
    } catch (e) {
      if (chaveAtiva.current !== chave) return
      // Mantém os últimos dados bons na tela, como antes.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (chaveAtiva.current === chave) setLoading(false)
    }
  }, [chave, origem])

  useEffect(() => {
    chaveAtiva.current = chave
    const emCache = lerCache<FunnelRow[]>(chave)
    if (emCache) {
      setData(emCache.valor)
      setError(null)
      setLoading(false)
      if (Date.now() - emCache.atualizadoEm > IDADE_REVALIDAR_MS) void load(false)
    } else {
      void load(true)
    }

    // Mesmo protocolo dos hooks existentes: botão de refresh global + polling.
    const onRefresh = () => void load(false)
    window.addEventListener('dashboard:refresh', onRefresh)
    const timer = setInterval(() => void load(false), 300_000)

    return () => {
      chaveAtiva.current = null
      clearInterval(timer)
      window.removeEventListener('dashboard:refresh', onRefresh)
    }
  }, [chave, load])

  return { data, loading, error, reload: () => void load(false) }
}
