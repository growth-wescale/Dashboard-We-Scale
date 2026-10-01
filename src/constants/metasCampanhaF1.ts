import { toLocalDate } from '@/lib/dateUtils'
import { gerarSemanas } from '@/lib/metasEngine'

/**
 * Campanha de Metas — recortes por volta (semana), mês a mês.
 *
 * A campanha começou em setembro/2026. Setembro mantém as 4 voltas que a
 * campanha de fato usou (1–7, 8–14, 15–21, 22–30). De outubro em diante, as
 * voltas são as SEMANAS da versão ativa do mês na Configuração das Metas
 * (`meta_semana`, com o dia de virada que o gestor escolheu); mês ainda sem
 * meta publicada cai em semanas com virada na terça.
 *
 * O seletor de voltas é multi-seleção: a janela ativa é a UNIÃO das voltas
 * marcadas (voltas não-contíguas mantêm o buraco de fora).
 *
 * Meta de uma volta:
 *  - Closer: setembro usa a FORMA da planilha "Metas 2026.xlsx" (aba Closer ·
 *    "FECHAMENTO POR SEMANA"). Dali em diante, a distribuição semanal das
 *    vendas feita na Configuração das Metas; sem ela, rateio pelos dias.
 *  - SDR: rateio pelos dias das voltas (`fracaoDias`).
 */

export interface Janela {
  /** 'YYYY-MM-DD' (Brasília), inclusivo. */
  inicio: string
  /** 'YYYY-MM-DD' (Brasília), inclusivo. */
  fim: string
}

export interface VoltaDef extends Janela {
  num: number
  diaInicio: number
  diaFim: number
  label: string
  /** dias da volta ÷ dias do mês — usado no rateio da meta. */
  fracaoDias: number
}

/** Semana como vem de `meta_semana`. */
export interface SemanaCampanha {
  numero: number
  inicio: string
  fim: string
}

export interface CampanhaMes {
  /** 'YYYY-MM-01' */
  mes: string
  /** 'Outubro 2026' */
  rotulo: string
  /** 'Outubro' */
  nomeMes: string
  /** 'out' */
  abrev: string
  diasMes: number
  inicio: string
  fim: string
  voltas: VoltaDef[]
}

/** Primeiro mês da campanha. */
export const MES_INICIO_CAMPANHA = '2026-09-01'

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ABREV_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Setembro/2026: as 4 voltas que a campanha usou (não as semanas da meta). */
export const VOLTAS_SETEMBRO: readonly VoltaDef[] = [
  { num: 1, inicio: '2026-09-01', fim: '2026-09-07', diaInicio: 1, diaFim: 7, label: 'Volta 1 · 1–7 set', fracaoDias: 7 / 30 },
  { num: 2, inicio: '2026-09-08', fim: '2026-09-14', diaInicio: 8, diaFim: 14, label: 'Volta 2 · 8–14 set', fracaoDias: 7 / 30 },
  { num: 3, inicio: '2026-09-15', fim: '2026-09-21', diaInicio: 15, diaFim: 21, label: 'Volta 3 · 15–21 set', fracaoDias: 7 / 30 },
  { num: 4, inicio: '2026-09-22', fim: '2026-09-30', diaInicio: 22, diaFim: 30, label: 'Volta 4 · 22–30 set', fracaoDias: 9 / 30 },
]

/**
 * Setembro: fração da meta MENSAL de cada closer em cada volta (índice 0 =
 * volta 1). Forma de "Metas 2026.xlsx" · aba Closer · "FECHAMENTO POR SEMANA".
 */
export const FRACAO_VOLTA_CLOSER_SETEMBRO: Record<string, readonly number[]> = {
  Douglas: [0.2, 0.4, 0.2, 0.2],
  Jéssica: [0.2, 0.4, 0.2, 0.2],
  Bruna: [0.25, 0.25, 0.25, 0.25],
  'Aurélio Briano': [0.125, 0.25, 0.375, 0.25],
}

function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Mês corrente da campanha (nunca antes de setembro/2026). */
export function mesAtualCampanha(hoje: Date = new Date()): string {
  const atual = chaveMes(hoje)
  return atual < MES_INICIO_CAMPANHA ? MES_INICIO_CAMPANHA : atual
}

/** Meses selecionáveis: de setembro/2026 até o mês corrente. */
export function mesesDaCampanha(hoje: Date = new Date()): string[] {
  const fim = mesAtualCampanha(hoje)
  const meses: string[] = []
  let [a, m] = MES_INICIO_CAMPANHA.split('-').map(Number)
  for (;;) {
    const k = `${a}-${String(m).padStart(2, '0')}-01`
    meses.push(k)
    if (k >= fim) break
    m += 1
    if (m > 12) { m = 1; a += 1 }
  }
  return meses
}

/** Monta a campanha de um mês. `semanas` = semanas da versão ativa (ignoradas em setembro). */
export function montarCampanha(mes: string, semanas?: readonly SemanaCampanha[] | null): CampanhaMes {
  const [ano, m] = mes.split('-').map(Number)
  const diasMes = new Date(ano, m, 0).getDate()
  const abrev = ABREV_MES[m - 1]
  const fim = `${ano}-${String(m).padStart(2, '0')}-${String(diasMes).padStart(2, '0')}`
  let voltas: VoltaDef[]
  if (mes === MES_INICIO_CAMPANHA) {
    voltas = [...VOLTAS_SETEMBRO]
  } else {
    const base = semanas && semanas.length > 0
      ? [...semanas].sort((a, b) => a.numero - b.numero)
      : gerarSemanas(mes, 'terca')
    voltas = base.map((s, i) => {
      const diaInicio = Number(s.inicio.slice(8, 10))
      const diaFim = Number(s.fim.slice(8, 10))
      return {
        num: i + 1,
        inicio: s.inicio,
        fim: s.fim,
        diaInicio,
        diaFim,
        label: `Volta ${i + 1} · ${diaInicio}–${diaFim} ${abrev}`,
        fracaoDias: (diaFim - diaInicio + 1) / diasMes,
      }
    })
  }
  return { mes, rotulo: `${NOMES_MES[m - 1]} ${ano}`, nomeMes: NOMES_MES[m - 1], abrev, diasMes, inicio: mes, fim, voltas }
}

/** Fator da meta mensal do closer para o conjunto de voltas selecionado. */
export function fatorMetaCloser(
  c: CampanhaMes,
  nome: string,
  voltas: readonly number[],
  fracoesSemanais?: ReadonlyMap<string, readonly number[]> | null,
): number {
  const fracoes = c.mes === MES_INICIO_CAMPANHA
    ? FRACAO_VOLTA_CLOSER_SETEMBRO[nome.trim()]
    : fracoesSemanais?.get(nome.trim())
  if (fracoes) return voltas.reduce((s, v) => s + (fracoes[v - 1] ?? 0), 0)
  return fatorMetaSdr(c, voltas)
}

/** Fator da meta mensal (rateio pelos dias) para o conjunto de voltas. */
export function fatorMetaSdr(c: CampanhaMes, voltas: readonly number[]): number {
  return voltas.reduce((s, v) => s + (c.voltas[v - 1]?.fracaoDias ?? 0), 0)
}

/** true se a data (timestamptz ISO ou 'YYYY-MM-DD') cai em ALGUMA janela
 *  (comparação por dia, Brasília). `janelas` vazio/undefined = sem recorte. */
export function emJanelas(ts: string | null | undefined, janelas?: readonly Janela[]): boolean {
  if (!janelas || janelas.length === 0) return true
  if (!ts) return false
  const d = toLocalDate(ts)
  if (!d) return false
  return janelas.some(j => d >= j.inicio && d <= j.fim)
}

/** Chave estável de um array de janelas — pra usar em deps de hook. */
export function janelasKey(janelas?: readonly Janela[]): string {
  return janelas && janelas.length ? janelas.map(j => `${j.inicio}~${j.fim}`).join('|') : ''
}

/** Janelas (para os hooks) a partir das voltas selecionadas, em ordem. */
export function janelasDasVoltas(c: CampanhaMes, voltas: readonly number[]): Janela[] {
  return [...voltas]
    .sort((a, b) => a - b)
    .map(v => c.voltas[v - 1])
    .filter((v): v is VoltaDef => !!v)
    .map(v => ({ inicio: v.inicio, fim: v.fim }))
}

/** Rótulo da janela ativa. */
export function janelaLabel(c: CampanhaMes, ciclo: 'semanal' | 'mensal', voltas: readonly number[]): string {
  if (ciclo === 'mensal') return c.rotulo
  const s = [...voltas].sort((a, b) => a - b).filter(n => c.voltas[n - 1])
  if (s.length === 0) return c.rotulo
  if (s.length === 1) return c.voltas[s[0] - 1].label
  const contiguo = s.every((n, i) => i === 0 || n === s[i - 1] + 1)
  const di = c.voltas[s[0] - 1].diaInicio
  const df = c.voltas[s[s.length - 1] - 1].diaFim
  return contiguo ? `Voltas ${s[0]}–${s[s.length - 1]} · ${di}–${df} ${c.abrev}` : `Voltas ${s.join(', ')}`
}

/** % do período já decorrido (ritmo esperado) para a janela ativa, dado o dia do mês de hoje. */
export function pctDecorridoJanela(c: CampanhaMes, ciclo: 'semanal' | 'mensal', voltas: readonly number[], diaHoje: number): number {
  const alvo = ciclo === 'mensal' ? c.voltas.map(v => v.num) : [...voltas].sort((a, b) => a - b)
  let total = 0
  let decorrido = 0
  for (const v of alvo) {
    const def = c.voltas[v - 1]
    if (!def) continue
    const dias = def.diaFim - def.diaInicio + 1
    total += dias
    decorrido += Math.max(0, Math.min(dias, diaHoje - (def.diaInicio - 1)))
  }
  return total > 0 ? (decorrido / total) * 100 : 0
}

/** Dia da campanha no mês (0 = antes do mês começar, último dia = depois que acabou). */
export function diaDaCampanha(c: CampanhaMes, hoje: Date = new Date()): number {
  const [ano, m] = c.mes.split('-').map(Number)
  const inicio = new Date(ano, m - 1, 1)
  const fim = new Date(ano, m - 1, c.diasMes, 23, 59, 59)
  if (hoje < inicio) return 0
  if (hoje > fim) return c.diasMes
  return hoje.getDate()
}

/** Volta em que cai o dia da campanha. Dia 0 conta como a primeira volta. */
export function voltaDoDia(c: CampanhaMes, dia: number): number {
  return c.voltas.find(v => dia <= v.diaFim)?.num ?? c.voltas.length
}
