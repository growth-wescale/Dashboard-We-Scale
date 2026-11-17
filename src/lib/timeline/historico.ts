import { toLocalDate } from '@/lib/dateUtils'
import { MS_DIA, diasEntre, type Fase, type Momento, type Timeline, type TipoMomento } from './tipos'

/**
 * Histórico do negócio em lista: ciclo → dia → itens, na ordem em que as coisas
 * aconteceram. É o que a página da Linha do Tempo desenha (puro, testado).
 *
 * Duas regras pra lista não poluir:
 * - tarefas do mesmo dia (no mesmo ciclo) viram UM item, que abre a lista delas;
 * - a etapa que o RD regrava no minuto da reabertura (eco da retomada) não vira
 *   item: a própria reabertura já diz em que etapa o negócio voltou.
 */

export type CategoriaHistorico = 'etapas' | 'pessoas' | 'cadencia' | 'reunioes'

export const CATEGORIAS: { chave: CategoriaHistorico; rotulo: string }[] = [
  { chave: 'etapas', rotulo: 'Etapas, perda e reabertura' },
  { chave: 'pessoas', rotulo: 'Responsável, funil e marca' },
  { chave: 'cadencia', rotulo: 'Cadência e tarefas' },
  { chave: 'reunioes', rotulo: 'Reuniões' },
]

const CATEGORIA_DO_TIPO: Record<TipoMomento, CategoriaHistorico> = {
  etapa: 'etapas', no_show: 'etapas', perda: 'etapas', ganho: 'etapas', retomada: 'etapas',
  troca_responsavel: 'pessoas', mudanca_funil: 'pessoas', mudanca_campo: 'pessoas',
  tarefa: 'cadencia', cadencia: 'cadencia', disparo: 'cadencia',
  reuniao: 'reunioes',
}

export function categoriaDe(m: Momento): CategoriaHistorico {
  return CATEGORIA_DO_TIPO[m.tipo]
}

export interface ItemMomento { tipo: 'momento'; id: string; instante: Date; momento: Momento }
export interface ItemTarefas {
  tipo: 'tarefas'
  id: string
  instante: Date
  tarefas: Momento[]
  ligacoes: number
  whatsapps: number
  outras: number
  atrasadas: number
  abertas: number
  pessoas: string[]
}
export type ItemHistorico = ItemMomento | ItemTarefas

export interface DiaHistorico { dia: string; itens: ItemHistorico[] }

export interface CicloHistorico {
  ciclo: number
  inicio: Date
  fim: Date
  /** Ciclo aberto por reabertura (ciclo 2 em diante). */
  resgate: boolean
  /** Dias entre a perda anterior e a reabertura. */
  diasParado: number | null
  desfecho: 'perdido' | 'ganho' | 'em_andamento' | 'sem_desfecho'
  motivoPerda: string | null
  dias: DiaHistorico[]
  /** Quantos itens o ciclo tem sem filtro — pra dizer "nada neste filtro". */
  totalSemFiltro: number
}

/** Janela da reabertura: o RD grava etapa e tarefas a segundos dela. */
const JANELA_ECO_MS = 2 * 60_000

/** Etapa gravada a até 2 min da reabertura (antes ou depois) = eco da retomada. */
function ecosDaRetomada(tl: Timeline): Set<string> {
  const ecos = new Set<string>()
  tl.nos.forEach((n, i) => {
    if (n.tipo !== 'retomada') return
    for (const viz of [tl.nos[i - 1], tl.nos[i + 1]]) {
      if (viz?.tipo === 'etapa' && Math.abs(viz.instante.getTime() - n.instante.getTime()) <= JANELA_ECO_MS) ecos.add(viz.id)
    }
  })
  return ecos
}

/**
 * Ciclo de cada momento pra lista. O RD grava parte da reabertura (etapa,
 * tarefas encerradas) segundos ANTES do evento de retomada; sem isto esses
 * itens ficavam no fim do ciclo anterior, depois da perda.
 */
function cicloNaLista(m: Momento, retomadas: Momento[]): number {
  const r = retomadas.find(x => m.instante < x.instante && x.instante.getTime() - m.instante.getTime() <= JANELA_ECO_MS)
  return r ? r.ciclo : m.ciclo
}

const diaDe = (d: Date) => toLocalDate(d.toISOString()) ?? d.toISOString().slice(0, 10)

function grupoTarefas(ts: Momento[]): ItemTarefas {
  let ligacoes = 0, whatsapps = 0, outras = 0, atrasadas = 0, abertas = 0
  const pessoas: string[] = []
  for (const t of ts) {
    const meta = t.meta?.kind === 'tarefa' ? t.meta : null
    if (meta?.tipoTarefa === 'call') ligacoes += 1
    else if (meta?.tipoTarefa === 'whatsapp') whatsapps += 1
    else outras += 1
    if (meta?.atrasada) atrasadas += 1
    if (meta && !meta.concluida) abertas += 1
    if (t.ator && !pessoas.includes(t.ator)) pessoas.push(t.ator)
  }
  return { tipo: 'tarefas', id: `tarefas:${ts[0].id}`, instante: ts[0].instante, tarefas: ts, ligacoes, whatsapps, outras, atrasadas, abertas, pessoas }
}

export function montarHistorico(tl: Timeline, filtros: ReadonlySet<CategoriaHistorico>): CicloHistorico[] {
  const ecos = ecosDaRetomada(tl)
  const retomadas = tl.nos.filter(n => n.tipo === 'retomada')
  const visiveis = tl.momentos.filter(m => !ecos.has(m.id))
  const porCiclo = new Map<number, Momento[]>()
  for (const m of visiveis) {
    const c = cicloNaLista(m, retomadas)
    const lista = porCiclo.get(c) ?? []
    lista.push(m)
    porCiclo.set(c, lista)
  }
  // a reabertura abre o ciclo na lista, mesmo com itens gravados segundos antes dela
  for (const lista of porCiclo.values()) {
    const i = lista.findIndex(m => m.tipo === 'retomada')
    if (i > 0) lista.unshift(...lista.splice(i, 1))
  }
  const ciclos = [...porCiclo.keys()].sort((a, b) => a - b)
  const perdas = tl.nos.filter(n => n.tipo === 'perda')

  return ciclos.map((ciclo, idx) => {
    const ms = porCiclo.get(ciclo)!
    const retomada = ms.find(m => m.tipo === 'retomada') ?? null
    const perdaAnterior = retomada ? [...perdas].reverse().find(p => p.instante <= retomada.instante) ?? null : null
    const ultimoNo = [...ms].reverse().find(m => m.tipo === 'perda' || m.tipo === 'ganho') ?? null
    const ultimoCiclo = idx === ciclos.length - 1
    const desfecho: CicloHistorico['desfecho'] = ultimoNo?.tipo === 'ganho' ? 'ganho'
      : ultimoNo?.tipo === 'perda' && (!ultimoCiclo || tl.desfecho.tipo === 'perda') ? 'perdido'
      : ultimoCiclo && tl.desfecho.tipo === 'em_andamento' ? 'em_andamento'
      : ultimoCiclo && tl.desfecho.tipo === 'ganho' ? 'ganho'
      : 'sem_desfecho'
    const inicio = retomada?.instante ?? ms[0].instante
    const fim = ultimoCiclo ? tl.fim : (ultimoNo?.instante ?? ms[ms.length - 1].instante)

    // dias → itens, com as tarefas do dia juntas no lugar da 1ª
    const dias: DiaHistorico[] = []
    const filtrados = ms.filter(m => filtros.has(categoriaDe(m)))
    for (const m of filtrados) {
      const dia = diaDe(m.instante)
      let d = dias[dias.length - 1]
      if (!d || d.dia !== dia) { d = { dia, itens: [] }; dias.push(d) }
      if (m.tipo === 'tarefa') {
        const grupo = d.itens.find((i): i is ItemTarefas => i.tipo === 'tarefas')
        if (grupo) { grupo.tarefas.push(m); continue }
        d.itens.push(grupoTarefas([m]))
        continue
      }
      d.itens.push({ tipo: 'momento', id: m.id, instante: m.instante, momento: m })
    }
    for (const d of dias) d.itens = d.itens.map(i => (i.tipo === 'tarefas' ? grupoTarefas(i.tarefas) : i))

    const motivo = ultimoNo?.tipo === 'perda' && ultimoNo.meta?.kind === 'perda' ? ultimoNo.meta.motivo : null
    return {
      ciclo, inicio, fim, resgate: !!retomada,
      diasParado: retomada && perdaAnterior ? diasEntre(perdaAnterior.instante, retomada.instante) : null,
      desfecho, motivoPerda: motivo, dias, totalSemFiltro: ms.length,
    }
  })
}

/** Primeiro nome + sobrenome no máximo ("Thiago Cotliarenco Gomes" → "Thiago Cotliarenco"). */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return partes.slice(0, 2).join(' ')
}

/**
 * Quem estava com o negócio em cada fase, pela troca de responsável: dono no
 * começo da fase (última troca até ali, ou o "de" da 1ª troca depois) e cada
 * troca dentro dela. Troca logo no começo da fase (até 1 h) substitui o dono
 * inicial — é o handoff, não uma pessoa a mais.
 */
export function donosDaFase(fase: Fase, momentos: Momento[]): string[] {
  const trocas = momentos.filter(m => m.tipo === 'troca_responsavel' && m.meta?.kind === 'campo')
    .sort((a, b) => a.instante.getTime() - b.instante.getTime())
  const para = (m: Momento) => (m.meta?.kind === 'campo' ? m.meta.para : null)
  const de = (m: Momento) => (m.meta?.kind === 'campo' ? m.meta.de : null)
  const antes = [...trocas].reverse().find(t => t.instante <= fase.inicio)
  const depois = trocas.find(t => t.instante > fase.inicio)
  const dentro = trocas.filter(t => t.instante > fase.inicio && t.instante < fase.fim)
  let inicial = antes ? para(antes) : depois ? de(depois) : fase.ator
  if (dentro[0] && dentro[0].instante.getTime() - fase.inicio.getTime() <= 3_600_000) inicial = null
  const nomes = [inicial, ...dentro.map(para)].filter((n): n is string => !!n?.trim()).map(nomeCurto)
  return nomes.filter((n, i) => i === 0 || n !== nomes[i - 1])
}

/** Posição (0–100) de um instante na faixa do negócio. */
export function posicaoNaFaixa(t: Date, tl: Timeline): number {
  const total = Math.max(MS_DIA / 24, tl.fim.getTime() - tl.inicio.getTime())
  return Math.min(100, Math.max(0, ((t.getTime() - tl.inicio.getTime()) / total) * 100))
}
