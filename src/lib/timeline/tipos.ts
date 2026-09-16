import type { StageKey } from '@/lib/metrics'
import type { FunnelRow } from '@/lib/funnelTypes'

export type TipoMomento =
  | 'etapa' | 'no_show' | 'perda' | 'ganho' | 'retomada'
  | 'troca_responsavel' | 'mudanca_funil' | 'mudanca_campo'
  | 'tarefa' | 'reuniao'

/** Fase do nível Macro. 'Reaberto' = intervalo entre perda e retomada (reciclagem). */
export type Camada = 'MQL' | 'SDR' | 'Closer' | 'Desfecho'
export type TipoFase = 'MQL' | 'SDR' | 'Closer' | 'Reaberto'

export type Desvio = 'voltou' | 'pulou' | 'no_show' | 'trocou_funil' | 'perdeu' | 'reciclou'

export type TipoTarefa = 'call' | 'whatsapp' | 'email' | 'task' | 'lunch' | 'meeting' | 'outro'
export type StatusTarefa = 'concluida_no_prazo' | 'concluida_atrasada' | 'atrasada' | 'em_aberto'

export interface MetaTarefa {
  kind: 'tarefa'
  tipoTarefa: TipoTarefa
  status: StatusTarefa
  concluida: boolean
  atrasada: boolean
  prazo: string | null
  feitaEm: string | null
  /** Dias de atraso (feitaEm − prazo, ou agora − prazo se aberta). null quando não atrasada. */
  atrasoDias: number | null
  assunto: string
  notas: string | null
}

export interface SecaoResumo { titulo: string; itens: string[] }
export interface RespostaScorecard { categoria: string; pergunta: string; resposta: string }

export interface MetaReuniao {
  kind: 'reuniao'
  duracaoMin: number | null
  /** ai_score (0–1) × 10, 1 casa. */
  notaIA: number | null
  scorecard: string | null
  tipoReuniao: string | null
  resumo: SecaoResumo[]
  respostas: RespostaScorecard[]
  url: string | null
  participantes: string[]
}

export interface MetaEtapa {
  kind: 'etapa'
  etapaAnterior: string | null
  funil: string | null
  idEtapa: string | null
}

export interface MetaCampo { kind: 'campo'; campo: string; de: string | null; para: string | null }
export interface MetaPerda { kind: 'perda'; motivo: string | null; anotacao: string | null }

export type MetaMomento = MetaTarefa | MetaReuniao | MetaEtapa | MetaCampo | MetaPerda

/** O que os normalizadores produzem — sem camada/ciclo/desvio, que só existem depois de montar. */
export interface MomentoBruto {
  id: string
  idDeal: string
  instante: Date
  tipo: TipoMomento
  etapa?: StageKey | null
  /** Nome cru da etapa quando `resolveStage` não a conhece. */
  etapaCrua?: string
  ator: string | null
  titulo: string
  detalhe?: string
  meta?: MetaMomento
}

export interface Momento extends MomentoBruto {
  camada: Camada
  ciclo: number
  desvio?: Desvio
}

export interface Fase {
  tipo: TipoFase
  inicio: Date
  fim: Date
  duracaoDias: number
  /** Nome de quem estava com o deal na fase (último `ator` de etapa dentro dela). */
  ator: string | null
  etapas: number
  toques: number
  atrasados: number
  noShows: number
  reunioes: number
}

/** Intervalo entre dois nós de etapa consecutivos (ou do último até o fim). */
export interface Trecho {
  deId: string
  ateId: string | null
  inicio: Date
  fim: Date
  duracaoDias: number
  camada: Camada
  ciclo: number
  toques: number
  atrasados: number
  reunioes: number
  /** ids dos momentos micro (tarefa/reunião/troca/mudança) dentro do trecho. */
  momentos: string[]
}

export interface Desfecho {
  tipo: 'ganho' | 'perda' | 'em_andamento'
  instante: Date
  momentoId: string | null
}

export interface DealCabecalho {
  row: FunnelRow
  /** Todas as linhas do deal (1 por ciclo), ordenadas por ciclo. */
  ciclos: FunnelRow[]
}

export interface Timeline {
  idDeal: string
  inicio: Date
  fim: Date
  momentos: Momento[]
  /** Só os nós que viram círculo na pista: etapa, no_show, perda, ganho, retomada. */
  nos: Momento[]
  trechos: Trecho[]
  fases: Fase[]
  desfecho: Desfecho
  totais: { toques: number; atrasados: number; reunioes: number; noShows: number; diasNoFunil: number }
}

export const NOS_DE_ETAPA: ReadonlySet<TipoMomento> = new Set(['etapa', 'no_show', 'perda', 'ganho', 'retomada'])
export const MICRO: ReadonlySet<TipoMomento> = new Set(['tarefa', 'reuniao', 'troca_responsavel', 'mudanca_funil', 'mudanca_campo'])

export const MS_DIA = 86_400_000
export const diasEntre = (a: Date, b: Date): number => Math.max(0, (b.getTime() - a.getTime()) / MS_DIA)
