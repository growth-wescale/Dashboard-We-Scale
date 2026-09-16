import { STAGE_ORDER, stageOwnerRole } from '@/lib/metrics'
import type { StageKey } from '@/lib/metrics'
import {
  NOS_DE_ETAPA, MICRO, diasEntre,
  type Camada, type DealCabecalho, type Desfecho, type Fase, type Momento, type MomentoBruto,
  type Timeline, type TipoFase, type Trecho,
} from './tipos'

/** Empate de instante: nós de etapa antes de tarefas/reuniões. */
const PESO: Record<Momento['tipo'], number> = {
  retomada: 0, etapa: 1, no_show: 1, mudanca_funil: 2, troca_responsavel: 3, mudanca_campo: 3,
  tarefa: 4, reuniao: 4, perda: 5, ganho: 5,
}

function camadaDaEtapa(etapa: StageKey | null | undefined, anterior: Camada): Camada {
  if (!etapa) return anterior === 'Desfecho' ? 'SDR' : anterior
  if (etapa === 'MQL') return 'MQL'
  if (etapa === 'No Show') return 'SDR'
  return stageOwnerRole(etapa) === 'closer' ? 'Closer' : 'SDR'
}

const idxEtapa = (e: StageKey | null | undefined): number => (e && e !== 'No Show' ? STAGE_ORDER.indexOf(e) : -1)

/**
 * Momentos brutos (das 3 fontes) → Timeline pronta pra desenhar.
 * Regras de negócio aqui: ciclo por `retomada`; handoff SDR→Closer na mesma
 * etapa vira um nó só; camada pela etapa (herdada quando desconhecida);
 * desvio comparando com STAGE_ORDER; desfecho pela trava de venda
 * (`status_atual`), nunca só pelo evento.
 */
export function montarTimeline(brutos: MomentoBruto[], cabecalho: DealCabecalho | null, agora: Date): Timeline {
  const ordenados = [...brutos].sort((a, b) => a.instante.getTime() - b.instante.getTime() || PESO[a.tipo] - PESO[b.tipo])

  // 1) ciclo + fusão de handoff + camada + desvio
  const momentos: Momento[] = []
  let ciclo = 1
  let camada: Camada = 'MQL'
  let ultimoNo: Momento | null = null
  let ultimoIdx = -1
  for (const b of ordenados) {
    if (b.tipo === 'retomada') { ciclo += 1; ultimoIdx = -1 }
    if (b.tipo === 'etapa' && b.etapa && ultimoNo?.tipo === 'etapa' && ultimoNo.etapa === b.etapa && ultimoNo.ciclo === ciclo) {
      // mesmo StageKey duas vezes seguidas = handoff de funil, não passagem nova
      const funilNovo = b.meta?.kind === 'etapa' ? b.meta.funil : null
      const funilAntigo = ultimoNo.meta?.kind === 'etapa' ? ultimoNo.meta.funil : null
      if (funilNovo && funilNovo !== funilAntigo) ultimoNo.detalhe = `passou pro funil do ${funilNovo}`
      continue
    }
    const m: Momento = { ...b, ciclo, camada }
    switch (b.tipo) {
      case 'etapa': {
        m.camada = camadaDaEtapa(b.etapa, camada)
        const idx = idxEtapa(b.etapa)
        if (idx >= 0 && ultimoIdx >= 0) {
          if (idx < ultimoIdx) m.desvio = 'voltou'
          else if (idx > ultimoIdx + 1) m.desvio = 'pulou'
        }
        if (idx >= 0) ultimoIdx = idx
        break
      }
      case 'no_show': m.camada = 'SDR'; m.desvio = 'no_show'; break
      case 'perda': m.camada = 'Desfecho'; m.desvio = 'perdeu'; break
      case 'ganho': m.camada = 'Desfecho'; break
      case 'retomada': m.camada = 'SDR'; m.desvio = 'reciclou'; break
      case 'mudanca_funil': {
        const para = b.meta?.kind === 'campo' ? b.meta.para : null
        if (para && para !== 'Closer' && para !== 'SDR') m.desvio = 'trocou_funil'
        break
      }
      default: break
    }
    if (NOS_DE_ETAPA.has(m.tipo)) { ultimoNo = m; if (m.camada !== 'Desfecho') camada = m.camada }
    momentos.push(m)
  }
  // retomada assume a camada do primeiro nó de etapa depois dela
  momentos.forEach((m, i) => {
    if (m.tipo !== 'retomada') return
    const prox = momentos.slice(i + 1).find(x => x.tipo === 'etapa' || x.tipo === 'no_show')
    m.camada = prox?.camada ?? 'SDR'
  })

  const nos = momentos.filter(m => NOS_DE_ETAPA.has(m.tipo))
  const micro = momentos.filter(m => MICRO.has(m.tipo))

  // 2) desfecho pela trava de venda
  const status = cabecalho?.row.status_atual ?? null
  const noGanho = [...nos].reverse().find(n => n.tipo === 'ganho')
  const noPerda = [...nos].reverse().find(n => n.tipo === 'perda')
  const dataVenda = cabecalho?.row.data_venda ? new Date(cabecalho.row.data_venda) : null
  const dataPerdido = cabecalho?.row.data_perdido ? new Date(cabecalho.row.data_perdido) : null
  let desfecho: Desfecho
  if (status === 'Ganho') desfecho = { tipo: 'ganho', instante: noGanho?.instante ?? dataVenda ?? agora, momentoId: noGanho?.id ?? null }
  else if (status === 'Perdido') desfecho = { tipo: 'perda', instante: noPerda?.instante ?? dataPerdido ?? agora, momentoId: noPerda?.id ?? null }
  else if (!status && noGanho) desfecho = { tipo: 'ganho', instante: noGanho.instante, momentoId: noGanho.id }
  else if (!status && noPerda && nos[nos.length - 1]?.tipo === 'perda') desfecho = { tipo: 'perda', instante: noPerda.instante, momentoId: noPerda.id }
  else desfecho = { tipo: 'em_andamento', instante: agora, momentoId: null }

  const mql = cabecalho?.row.data_novo_mql ? new Date(cabecalho.row.data_novo_mql) : null
  const primeiro = momentos[0]?.instante ?? mql ?? agora
  const inicio = mql && mql < primeiro ? mql : primeiro
  const fim = desfecho.instante < inicio ? inicio : desfecho.instante

  // 3) trechos: entre nós consecutivos (pulando perda→retomada) + o último até o fim
  const trechos: Trecho[] = []
  for (let i = 0; i < nos.length; i++) {
    const de = nos[i]
    const ate = nos[i + 1] ?? null
    if (de.tipo === 'perda' && ate?.tipo === 'retomada') continue
    if (!ate && (de.tipo === 'perda' || de.tipo === 'ganho')) continue
    trechos.push({
      deId: de.id, ateId: ate?.id ?? null, inicio: de.instante, fim: ate?.instante ?? fim,
      duracaoDias: diasEntre(de.instante, ate?.instante ?? fim), camada: de.camada === 'Desfecho' ? camada : de.camada,
      ciclo: de.ciclo, toques: 0, atrasados: 0, reunioes: 0, momentos: [],
    })
  }
  if (trechos.length === 0 && nos.length === 0) {
    trechos.push({ deId: '', ateId: null, inicio, fim, duracaoDias: diasEntre(inicio, fim), camada: 'SDR', ciclo: 1, toques: 0, atrasados: 0, reunioes: 0, momentos: [] })
  }
  const trechoDe = (t: Date): Trecho | undefined => {
    if (trechos.length === 0) return undefined
    return trechos.find(x => t >= x.inicio && t < x.fim) ?? (t < trechos[0].inicio ? trechos[0] : trechos[trechos.length - 1])
  }
  for (const m of micro) {
    const tr = trechoDe(m.instante)
    if (!tr) continue
    tr.momentos.push(m.id)
    if (m.tipo === 'tarefa') { tr.toques += 1; if (m.meta?.kind === 'tarefa' && m.meta.atrasada) tr.atrasados += 1 }
    if (m.tipo === 'reuniao') tr.reunioes += 1
  }

  // 4) fases: muda quando a camada de um nó muda; perda→retomada vira 'Reaberto'
  const fases: Fase[] = []
  const abrir = (tipo: TipoFase, t: Date): Fase => ({ tipo, inicio: t, fim: t, duracaoDias: 0, ator: null, etapas: 0, toques: 0, atrasados: 0, noShows: 0, reunioes: 0 })
  let atual: Fase | null = null
  const fechar = (t: Date) => { if (atual) { atual.fim = t; atual.duracaoDias = diasEntre(atual.inicio, t); fases.push(atual); atual = null } }
  for (const n of nos) {
    if (n.tipo === 'perda' || n.tipo === 'ganho') { fechar(n.instante); if (n.tipo === 'perda') atual = abrir('Reaberto', n.instante); continue }
    if (n.tipo === 'retomada') { if (atual?.tipo === 'Reaberto') fechar(n.instante); atual = abrir(n.camada as TipoFase, n.instante); continue }
    const tipo = n.camada as TipoFase
    if (!atual || atual.tipo !== tipo) { fechar(n.instante); atual = abrir(tipo, n.instante) }
    atual.etapas += 1
    if (n.tipo === 'no_show') atual.noShows += 1
    if (n.ator) atual.ator = n.ator
  }
  if (atual && atual.tipo === 'Reaberto' && desfecho.tipo === 'perda') atual = null   // perdido e não reaberto: sem fase pendurada
  fechar(fim)
  if (fases.length === 0) fases.push({ ...abrir('MQL', inicio), fim, duracaoDias: diasEntre(inicio, fim) })
  for (const m of micro) {
    const f = fases.find(x => m.instante >= x.inicio && m.instante < x.fim) ?? fases[fases.length - 1]
    if (m.tipo === 'tarefa') { f.toques += 1; if (m.meta?.kind === 'tarefa' && m.meta.atrasada) f.atrasados += 1 }
    if (m.tipo === 'reuniao') f.reunioes += 1
  }

  const totais = {
    toques: micro.filter(m => m.tipo === 'tarefa').length,
    atrasados: micro.filter(m => m.tipo === 'tarefa' && m.meta?.kind === 'tarefa' && m.meta.atrasada).length,
    reunioes: micro.filter(m => m.tipo === 'reuniao').length,
    noShows: nos.filter(n => n.tipo === 'no_show').length,
    diasNoFunil: diasEntre(inicio, fim),
  }

  return { idDeal: cabecalho?.row.id_lead ?? brutos[0]?.idDeal ?? '', inicio, fim, momentos, nos, trechos, fases, desfecho, totais }
}
