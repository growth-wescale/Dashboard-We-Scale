import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabaseVendas } from '@/lib/supabaseVendas'
import { normalizeMarcaRaw } from '@/constants/brands'
import { ID_DEAL_RE } from '@/lib/rd'
import { momentosDeEventos, type DealEventoRow } from '@/lib/timeline/eventos'
import { momentosDeTarefas, type TarefaRow } from '@/lib/timeline/tarefas'
import { momentosDeReunioes, type ReuniaoRow } from '@/lib/timeline/reunioes'
import { montarTimeline } from '@/lib/timeline/montar'
import type { DealCabecalho, Timeline } from '@/lib/timeline/tipos'
import type { FunnelRow } from '@/lib/funnelTypes'

type Fonte = 'eventos' | 'tarefas' | 'reunioes' | 'deal'
export type ErrosTimeline = Partial<Record<Fonte, string>>

const COLS_EVENTOS = 'id_evento,id_deal,tipo_evento,nome_funil,id_etapa,nome_etapa,nome_etapa_anterior,responsavel,valor_anterior,valor_novo,data_evento,motivo_perda,anotacao_perda'
const COLS_TAREFAS = 'task_id,subject,type,notes,done,status_calc,prazo,done_date,user_name,deal_id'
/** NUNCA transcription/api_payload/associations_raw/phrase_trackers/evaluators — pesados. */
const COLS_REUNIOES = 'id,title,url,call_timestamp,call_type_name,user_name,duration_minutes,ai_score,scorecard_name,summary,scorecard_answers,attendees,id_deal,crm_deal_id,has_summary,has_scorecard'
const COLS_DEAL = 'id_lead,ciclo,eh_reciclagem,eh_ciclo_atual,marca,nome_funil,etapa_funil,id_etapa_atual,status_atual,nome_sdr,nome_closer,nome_negociacao,fonte_macro,sub_fonte,sub_fonte_crm,utm_source,valor_contrato,quantidade_unidades,valor_produto,motivo_perda,data_criacao_original,data_novo_mql,data_tentando_contato,data_contato_efetivo,data_interesse_reuniao,data_conexao,data_agendamento_reuniao_sql,data_reuniao_realizada,data_no_show,data_sal,data_oportunidade,data_comite,data_pre_contrato,data_venda,data_perdido,origem_comercial'

interface Estado {
  eventos: DealEventoRow[]
  tarefas: TarefaRow[]
  reunioes: ReuniaoRow[]
  ciclos: FunnelRow[]
  erros: ErrosTimeline
}
const VAZIO: Estado = { eventos: [], tarefas: [], reunioes: [], ciclos: [], erros: {} }

async function buscar(idDeal: string): Promise<Estado> {
  const [ev, ta, re, de] = await Promise.allSettled([
    supabaseVendas.from('deal_eventos').select(COLS_EVENTOS).eq('id_deal', idDeal).order('data_evento', { ascending: true }),
    supabaseVendas.from('db_tarefas_sdr').select(COLS_TAREFAS).eq('deal_id', idDeal).order('prazo', { ascending: true }),
    // id_deal só existe em 8 de 1.550 linhas; o vínculo de verdade é crm_deal_id. idDeal já passou pelo ID_DEAL_RE.
    supabaseVendas.from('DB_Reunioes_MeetRox').select(COLS_REUNIOES).or(`id_deal.eq.${idDeal},crm_deal_id.eq.${idDeal}`).order('call_timestamp', { ascending: true }),
    supabaseVendas.from('vw_funil_vendas').select(COLS_DEAL).eq('id_lead', idDeal).order('ciclo', { ascending: true }),
  ])
  const erros: ErrosTimeline = {}
  const pega = <T,>(r: PromiseSettledResult<{ data: unknown; error: { message: string } | null }>, fonte: Fonte): T[] => {
    if (r.status === 'rejected') { erros[fonte] = String(r.reason); return [] }
    if (r.value.error) { erros[fonte] = r.value.error.message; return [] }
    return (r.value.data ?? []) as T[]
  }
  const ciclos = pega<FunnelRow>(de, 'deal')
  for (const r of ciclos) r.marca = normalizeMarcaRaw(r.marca) ?? r.marca
  return { eventos: pega(ev, 'eventos'), tarefas: pega(ta, 'tarefas'), reunioes: pega(re, 'reunioes'), ciclos, erros }
}

/**
 * Timeline de UM deal: dispara as 4 consultas em paralelo (eventos, tarefas,
 * reuniões, ciclos do funil) e tolera falha parcial — uma fonte fora do ar
 * não derruba as outras 3, só aparece em `erros`.
 */
export function useDealTimeline(idDeal: string | undefined) {
  const valido = !!idDeal && ID_DEAL_RE.test(idDeal)
  const [estado, setEstado] = useState<Estado>(VAZIO)
  const [loading, setLoading] = useState(valido)
  const ativo = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!valido || !idDeal) { setEstado(VAZIO); setLoading(false); return }
    ativo.current = idDeal
    setLoading(true)
    const r = await buscar(idDeal)
    if (ativo.current !== idDeal) return
    setEstado(r)
    setLoading(false)
  }, [idDeal, valido])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener('dashboard:refresh', onRefresh)
    return () => { ativo.current = null; window.removeEventListener('dashboard:refresh', onRefresh) }
  }, [load])

  const cabecalho = useMemo<DealCabecalho | null>(() => {
    if (!estado.ciclos.length) return null
    const row = estado.ciclos.find(c => c.eh_ciclo_atual) ?? estado.ciclos[estado.ciclos.length - 1]
    return { row, ciclos: estado.ciclos }
  }, [estado.ciclos])

  const timeline = useMemo<Timeline | null>(() => {
    if (!cabecalho) return null
    const agora = new Date()
    const brutos = [
      ...momentosDeEventos(estado.eventos),
      ...momentosDeTarefas(estado.tarefas, agora),
      ...momentosDeReunioes(estado.reunioes),
    ]
    return montarTimeline(brutos, cabecalho, agora)
  }, [estado, cabecalho])

  const naoEncontrado = !loading && (!valido || (cabecalho === null && !estado.erros.deal))
  return { timeline, cabecalho, loading, naoEncontrado, erros: estado.erros, reload: () => void load() }
}
