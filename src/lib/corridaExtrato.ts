import { marcaLabel } from '@/constants/brands'
import { MES_INICIO_CAMPANHA, nomeDoMes } from '@/constants/metasCampanhaF1'
import { toLocalDate } from '@/lib/dateUtils'
import { marcaTemFaixa, type Lancamento, type Trilha } from '@/lib/corridaPerformance'

/**
 * Corrida de Performance — o "porquê" de cada ponto, em português simples.
 *
 * Usado pelo extrato da Campanha de Metas (cada RR/venda com os 4 fatores e
 * a conta) e pelo link "pontos" dos pop-ups de negócio (quanto aquele
 * negócio deu e, se não deu, por quê). Só formata: os números vêm prontos de
 * `corridaPerformance.ts`, a mesma conta do card.
 */

/** Multiplicador sem o "×": mínimo 1 casa, máximo 2 ("1,0", "1,5", "1,75"). */
export function numMult(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

/** Pontos de uma linha do extrato: até 2 casas ("2,63", "4,5", "3"). */
export function pontosLinhaFmt(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/** "2,63 pts" / "1 pt". */
export function pontosTexto(n: number): string {
  const v = Math.round(n * 100) / 100
  return `${pontosLinhaFmt(v)} ${v === 1 ? 'pt' : 'pts'}`
}

/** Tempo em dias, 1 casa: "0,4 dia", "1 dia", "2,3 dias". */
export function diasTexto(d: number): string {
  const v = Math.round(Math.max(0, d) * 10) / 10
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${v <= 1 ? 'dia' : 'dias'}`
}

/** "14/10" (Brasília). */
export function diaCurto(iso: string | null | undefined): string {
  const d = toLocalDate(iso)
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—'
}

/** "14/10/2026" (Brasília). */
export function dataCompleta(iso: string | null | undefined): string {
  const d = toLocalDate(iso)
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—'
}

/** 'YYYY-MM-01' do mês (Brasília) da data; `null` se a data for vazia ou inválida. */
export function mesDaData(iso: string | null | undefined): string | null {
  const d = toLocalDate(iso)
  return d ? `${d.slice(0, 7)}-01` : null
}

/** "outubro de 2026" a partir de 'YYYY-MM-01'. */
export function mesTexto(mes: string): string {
  return `${nomeDoMes(mes).toLowerCase()} de ${mes.slice(0, 4)}`
}

/** Um fator da conta: o porquê (`motivo`) e quanto ele vale (`valor`). */
export interface Fator {
  motivo: string
  valor: string
}

function fonteLabel(l: Lancamento): string {
  return l.fonte?.trim() || 'sem Fonte Macro'
}

function marcaNome(l: Lancamento): string {
  return marcaLabel(l.marca) || 'sem marca'
}

/** Fonte Macro → peso de volume. */
export function fatorFonte(l: Lancamento): Fator {
  return { motivo: fonteLabel(l), valor: l.peso === 1 ? '1 pt' : `${l.peso} pts` }
}

/** Bônus de mais de 1 unidade no mesmo dia, dizendo quantas foram. */
export function fatorBonus(l: Lancamento): Fator {
  const n = l.unidadesNoDia
  if (l.trilha === 'sdr') {
    return l.bonus > 1
      ? { motivo: `${n} RR no dia`, valor: `×${numMult(l.bonus)}` }
      : { motivo: 'só 1 RR no dia', valor: 'sem bônus' }
  }
  if (l.bonus > 1) {
    return {
      motivo: n === l.unidades ? `${n} unidades nesta venda` : `${n} unidades no dia (esta e outras vendas)`,
      valor: `×${numMult(l.bonus)}`,
    }
  }
  return { motivo: 'só 1 unidade no dia', valor: 'sem bônus' }
}

/** Ticket da marca → faixa de investimento → multiplicador. */
export function fatorTicket(l: Lancamento): Fator {
  const motivo = marcaTemFaixa(l.marca)
    ? `${marcaNome(l)} · ${l.ticket.label}`
    : `${marcaNome(l)} · marca sem faixa de ticket (padrão)`
  return { motivo, valor: `×${numMult(l.ticket.mult)}` }
}

/** Frase curta do tempo da velocidade ("agendou 0,4 dia após o MQL"), ou o que faltou. */
function velocidadeCurta(l: Lancamento): string {
  const sdr = l.trilha === 'sdr'
  if (l.leadtimeDias === null) {
    if (!l.inicioVelocidade) return sdr ? 'sem data de MQL' : 'sem data de reunião realizada'
    return sdr ? 'sem data de agendamento' : 'sem data de venda'
  }
  if (l.leadtimeDias < 0) {
    return sdr ? 'agendamento registrado antes do MQL, conta 0 dia' : 'venda registrada antes da reunião, conta 0 dia'
  }
  return sdr
    ? `agendou ${diasTexto(l.leadtimeDias)} após o MQL`
    : `fechou ${diasTexto(l.leadtimeDias)} após a reunião realizada`
}

/** Velocidade: tempo medido e faixa, ou "sem data → neutro". */
export function fatorVelocidade(l: Lancamento): Fator {
  if (l.leadtimeDias === null) return { motivo: `${velocidadeCurta(l)} → neutro`, valor: `×${numMult(1)}` }
  return { motivo: `${velocidadeCurta(l)} · ${l.velocidade.tag}`, valor: `×${numMult(l.velocidade.mult)}` }
}

/**
 * A conta da linha, do jeito que o time lê:
 * "1 pt (Inbound) × 1,75 (Oral Unic) × 1,5 (agendou 0,4 dia após o MQL) = 2,63 pts".
 * O bônus só aparece quando vale (×1,5); as unidades, quando a venda tem mais de 1.
 */
export function contaTexto(l: Lancamento): string {
  const partes = [`${fatorFonte(l).valor} (${fonteLabel(l)})`]
  if (l.bonus > 1) partes.push(`${numMult(l.bonus)} (mesmo dia)`)
  partes.push(`${numMult(l.ticket.mult)} (${marcaNome(l)})`)
  const vel = l.leadtimeDias === null ? `${velocidadeCurta(l)} → neutro` : velocidadeCurta(l)
  partes.push(`${numMult(l.velocidade.mult)} (${vel})`)
  if (l.unidades > 1) partes.push(`${l.unidades} unidades`)
  return `${partes.join(' × ')} = ${pontosTexto(l.pontos)}`
}

/* ── Quem não pontuou, e por quê ────────────────────────────────────────── */

/** Pessoa do cadastro (`nome_cargo_foto`). */
export interface PessoaCadastro {
  nome: string
  cargo: string | null
  ativo: boolean
}

function papel(trilha: Trilha): 'SDR' | 'Closer' {
  return trilha === 'sdr' ? 'SDR' : 'Closer'
}

/**
 * Por que uma RR/venda do mês não entrou na Corrida: responsável vazio,
 * pessoa sem meta no mês (só quem tem meta participa) ou nome que nem está no
 * cadastro de pessoas.
 */
export function motivoForaCorrida(
  trilha: Trilha,
  nome: string | null | undefined,
  mes: string,
  cadastro: readonly PessoaCadastro[],
): string {
  const quem = nome?.trim()
  if (!quem) {
    return trilha === 'sdr'
      ? 'Negócio sem SDR no RD: a reunião não pontua para ninguém.'
      : 'Venda sem Closer no RD: não pontua para ninguém.'
  }
  const pessoa = cadastro.find(p => p.nome.trim().toLowerCase() === quem.toLowerCase())
  if (!pessoa) {
    return `${quem} não está no cadastro de pessoas do time nem tem meta de ${papel(trilha)} em ${mesTexto(mes)}.`
  }
  let texto = `${quem} não tem meta de ${papel(trilha)} em ${mesTexto(mes)} (versão das metas em vigor). Só quem tem meta no mês participa da Corrida.`
  if (pessoa.cargo && pessoa.cargo !== papel(trilha) && pessoa.cargo !== 'SDR/Closer') {
    texto += ` No cadastro, ${quem} está como ${pessoa.cargo}.`
  }
  if (!pessoa.ativo) texto += ` ${quem} está inativo no cadastro.`
  return texto
}

/* ── Um negócio do pop-up: quanto deu, ou por que não deu ───────────────── */

/** O que o pop-up de negócio precisa da linha (`FunnelRow` serve). */
export interface NegocioCorrida {
  id_lead: string
  ciclo: number
  nome_sdr: string | null
  nome_closer: string | null
  status_atual: string | null
  data_reuniao_realizada: string | null
  data_venda: string | null
}

/** Lançamentos e pilotos de UM mês inteiro da Corrida. */
export interface CorridaDoMes {
  mes: string
  pilotosSdr: readonly string[]
  pilotosCloser: readonly string[]
  lancamentosSdr: readonly Lancamento[]
  lancamentosCloser: readonly Lancamento[]
}

export type SituacaoTrilha =
  | { tipo: 'pontuou'; mes: string; lancamento: Lancamento; totalPessoaMes: number }
  | { tipo: 'nao_pontuou'; motivo: string }
  /** Precisa dos dados deste mês da Corrida pra responder. */
  | { tipo: 'precisa_mes'; mes: string }

/** Mês da Corrida em que a RR (SDR) conta — `null` se não há RR ou ela é anterior à campanha. */
export function mesDaRr(row: NegocioCorrida): string | null {
  const mes = mesDaData(row.data_reuniao_realizada)
  return mes && mes >= MES_INICIO_CAMPANHA ? mes : null
}

/** Mês da Corrida em que a venda (Closer) conta — `null` se não é venda ganha ou é anterior à campanha. */
export function mesDaVenda(row: NegocioCorrida): string | null {
  if (row.status_atual !== 'Ganho') return null
  const mes = mesDaData(row.data_venda)
  return mes && mes >= MES_INICIO_CAMPANHA ? mes : null
}

function totalDoMes(lancamentos: readonly Lancamento[], nome: string): number {
  return Math.round(lancamentos.filter(l => l.nome === nome).reduce((s, l) => s + l.pontos, 0) * 10) / 10
}

function ehPiloto(pilotos: readonly string[], nome: string): boolean {
  const k = nome.trim().toLowerCase()
  return pilotos.some(p => p.trim().toLowerCase() === k)
}

const INICIO_TEXTO = `${mesTexto(MES_INICIO_CAMPANHA)}`

function situacao(
  trilha: Trilha,
  row: NegocioCorrida,
  data: string,
  mes: string,
  dados: CorridaDoMes | null | undefined,
  cadastro: readonly PessoaCadastro[],
): SituacaoTrilha {
  if (!dados || dados.mes !== mes) return { tipo: 'precisa_mes', mes }
  const lancamentos = trilha === 'sdr' ? dados.lancamentosSdr : dados.lancamentosCloser
  const l = lancamentos.find(x => x.idLead === row.id_lead && x.ciclo === row.ciclo)
  if (l) return { tipo: 'pontuou', mes, lancamento: l, totalPessoaMes: totalDoMes(lancamentos, l.nome) }
  const nome = trilha === 'sdr' ? row.nome_sdr : row.nome_closer
  const pilotos = trilha === 'sdr' ? dados.pilotosSdr : dados.pilotosCloser
  if (!nome?.trim() || !ehPiloto(pilotos, nome)) {
    return { tipo: 'nao_pontuou', motivo: motivoForaCorrida(trilha, nome, mes, cadastro) }
  }
  const oQue = trilha === 'sdr' ? `A reunião de ${dataCompleta(data)}` : `A venda de ${dataCompleta(data)}`
  return {
    tipo: 'nao_pontuou',
    motivo: `${oQue} ainda não aparece na Corrida de ${mesTexto(mes)}. Os dados podem estar atualizando: tente de novo em alguns minutos.`,
  }
}

/** Trilha SDR de um negócio: pontos da RR realizada, ou o motivo de não ter. */
export function situacaoSdr(row: NegocioCorrida, dados: CorridaDoMes | null | undefined, cadastro: readonly PessoaCadastro[]): SituacaoTrilha {
  if (!row.data_reuniao_realizada) {
    const encerrado = row.status_atual === 'Ganho' || row.status_atual === 'Perdido' || row.status_atual === 'Excluído'
    return {
      tipo: 'nao_pontuou',
      motivo: encerrado
        ? 'Este ciclo do negócio não teve reunião realizada (Diagnóstico) registrada, e a trilha SDR só pontua reunião realizada.'
        : 'Ainda sem reunião realizada (Diagnóstico). A trilha SDR pontua quando a reunião acontece.',
    }
  }
  const mes = mesDaData(row.data_reuniao_realizada)
  if (!mes) return { tipo: 'nao_pontuou', motivo: 'A data da reunião realizada está inválida no RD.' }
  if (mes < MES_INICIO_CAMPANHA) {
    return { tipo: 'nao_pontuou', motivo: `Reunião realizada em ${dataCompleta(row.data_reuniao_realizada)}, antes de a Corrida começar (${INICIO_TEXTO}).` }
  }
  return situacao('sdr', row, row.data_reuniao_realizada, mes, dados, cadastro)
}

/** Trilha Closer de um negócio: pontos da venda, ou o motivo de não ter. */
export function situacaoCloser(row: NegocioCorrida, dados: CorridaDoMes | null | undefined, cadastro: readonly PessoaCadastro[]): SituacaoTrilha {
  if (row.status_atual !== 'Ganho') {
    if (row.data_venda) {
      return { tipo: 'nao_pontuou', motivo: 'Venda desfeita: o negócio tem data de venda, mas o status no RD não é Ganho. Só venda com status Ganho conta.' }
    }
    if (row.status_atual === 'Perdido') return { tipo: 'nao_pontuou', motivo: 'Negócio perdido: não houve venda.' }
    if (row.status_atual === 'Excluído') return { tipo: 'nao_pontuou', motivo: 'Negócio excluído no RD.' }
    return { tipo: 'nao_pontuou', motivo: 'Ainda sem venda (negócio em andamento). A trilha Closer pontua quando o negócio é ganho.' }
  }
  if (!row.data_venda) return { tipo: 'nao_pontuou', motivo: 'Venda sem data de venda no RD: não dá para saber em que mês ela conta.' }
  const mes = mesDaData(row.data_venda)
  if (!mes) return { tipo: 'nao_pontuou', motivo: 'A data da venda está inválida no RD.' }
  if (mes < MES_INICIO_CAMPANHA) {
    return { tipo: 'nao_pontuou', motivo: `Venda em ${dataCompleta(row.data_venda)}, antes de a Corrida começar (${INICIO_TEXTO}).` }
  }
  return situacao('closer', row, row.data_venda, mes, dados, cadastro)
}
