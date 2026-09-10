import { toLocalDate } from '@/lib/dateUtils'

/**
 * Corrida de Performance — motor de pontuação da Campanha de Metas (tema F1).
 *
 * Regra (doc "corrida-de-performance-logica.md"):
 *
 *   PONTOS = Σ  (pontos de volume da unidade)  ×  multiplicador de velocidade(tempo daquela unidade)
 *
 * "unidade" = 1 RR realizada (trilha SDR) ou 1 venda fechada (trilha Closer).
 * O multiplicador é aplicado POR UNIDADE, nunca sobre a média do período —
 * senão uma venda rápida disfarça várias travadas atrás dela.
 *
 * Pontos de volume: por **Fonte Macro** (o campo `fonte_macro` de
 * `vw_funil_vendas`, o mesmo que o filtro de Fonte do dashboard usa).
 *   1 ponto:  Inbound · Indicação · Parceiro · inbound - Repasse · Sem Classificação (e vazio)
 *   2 pontos: todo o restante (Prospecção Ativa · Resgate · Evento · Outro CRM · Franqueado · …)
 * Se a pessoa fez mais de uma unidade no mesmo dia, todas as unidades desse
 * dia ganham +1,5×.
 *
 * Fora de escopo por decisão do Junior (08/09): guardrail de no-show e de
 * desconto máximo. Contamos só RR/venda que de fato aconteceu
 * (`data_reuniao_realizada` / `data_venda` preenchida), então o guardrail de
 * no-show já cai por construção.
 */

export interface SpeedTier {
  /** Limite superior da faixa, em dias (inclusivo). `null` = faixa aberta (última). */
  limiteDias: number | null
  mult: number
  tag: string
}

/** Trilha SDR — tempo entre MQL e agendamento do SQL. Mediana do time ≈ 1,0 dia (doc, n=63). */
export const SDR_SPEED_TIERS: readonly SpeedTier[] = [
  { limiteDias: 0.5, mult: 1.5, tag: 'Resposta Relâmpago' },
  { limiteDias: 1, mult: 1.2, tag: 'Ritmo Ideal' },
  { limiteDias: 3, mult: 1.0, tag: 'Padrão' },
  { limiteDias: 7, mult: 0.8, tag: 'Atenção' },
  { limiteDias: null, mult: 0.5, tag: 'Lento' },
]

/** Trilha Closer — tempo entre reunião realizada e venda. Mediana do time ≈ 16,8 dias (doc, n=24). */
export const CLOSER_SPEED_TIERS: readonly SpeedTier[] = [
  { limiteDias: 14, mult: 1.5, tag: 'Fechamento Relâmpago' },
  { limiteDias: 17, mult: 1.2, tag: 'Ritmo Ideal' },
  { limiteDias: 28, mult: 1.0, tag: 'Padrão' },
  { limiteDias: 40, mult: 0.8, tag: 'Atenção' },
  { limiteDias: null, mult: 0.5, tag: 'Lento' },
]

/* ── Peso de volume por Fonte Macro ────────────────────────────────────── */

/** Fontes que valem 1 ponto (chave já normalizada — ver `normalizarFonte`). */
const FONTES_UM_PONTO = new Set<string>([
  'inbound',
  'indicacao',
  'parceiro',
  'inbound - repasse',
  'sem classificacao',
])

/**
 * Normaliza o valor de Fonte Macro pra comparação: sem acento, minúsculo,
 * espaço colapsado e padronizado em volta do "-". Cobre as variantes de
 * digitação que existem no RD ("INBOUND", "inbound - Repasse", "Outro CRM").
 */
export function normalizarFonte(fonte: string | null | undefined): string {
  return (fonte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Peso de volume da unidade pela Fonte Macro: 1 pt pras fontes "fáceis", 2 pro restante. Vazio → 1. */
export function pesoFonte(fonte: string | null | undefined): 1 | 2 {
  const f = normalizarFonte(fonte)
  if (f === '') return 1
  return FONTES_UM_PONTO.has(f) ? 1 : 2
}

/** Diferença em dias corridos (fracionária) entre dois timestamps ISO. `null` se faltar um dos lados ou for inválido. */
export function difDias(inicio: string | null | undefined, fim: string | null | undefined): number | null {
  if (!inicio || !fim) return null
  const a = new Date(inicio).getTime()
  const b = new Date(fim).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return (b - a) / 86_400_000
}

/** Faixa neutra usada quando o leadtime da unidade não pôde ser calculado. */
const TIER_SEM_DATA: SpeedTier = { limiteDias: null, mult: 1, tag: '—' }

/** Faixa de velocidade para um leadtime em dias. `null` (sem data) → multiplicador neutro 1. */
export function classificarVelocidade(dias: number | null, tiers: readonly SpeedTier[]): SpeedTier {
  if (dias === null) return TIER_SEM_DATA
  const d = Math.max(0, dias)
  for (const t of tiers) {
    if (t.limiteDias === null || d <= t.limiteDias) return t
  }
  return tiers[tiers.length - 1]
}

/* ── Entrada ────────────────────────────────────────────────────────────── */

/** 1 RR realizada no mês (trilha SDR). */
export interface RrUnidade {
  nome: string // nome_sdr canônico
  fonte: string | null // fonte_macro
  dataMql: string | null // data_novo_mql
  dataAgendamento: string | null // data_agendamento_reuniao_sql
  dataRr: string // data_reuniao_realizada (já filtrada no mês)
}

/** 1 venda fechada no mês (trilha Closer). */
export interface VendaUnidade {
  nome: string // nome_closer canônico
  fonte: string | null // fonte_macro
  dataRr: string | null // data_reuniao_realizada
  dataVenda: string // data_venda (já filtrada no mês)
}

/* ── Saída ──────────────────────────────────────────────────────────────── */

export interface LinhaTrilha {
  nome: string
  /** nº de RR / vendas no mês. */
  volume: number
  /** quantas dessas unidades vieram de fonte que pesa 2 pts. */
  volume2pts: number
  /** Σ (volume_unidade × mult_velocidade), arredondado a 1 casa decimal. */
  pontos: number
  /** Tempo mediano (dias) das unidades com data completa; `null` se nenhuma tem. */
  tempoMedianoDias: number | null
  /** Tag da faixa em que cai o tempo mediano. '—' quando não há dado. */
  tagVelocidade: string
}

interface UnidadeCalc {
  nome: string
  fonte: string | null
  leadtime: number | null
  /** Dia (Brasília) que define o bônus "+1 no mesmo dia"; `null` = fora do agrupamento. */
  diaBonus: string | null
}

/** Marca cada unidade como pertencente (ou não) a um dia com >1 unidade da mesma pessoa. */
function bonusMesmoDia(unidades: UnidadeCalc[]): Map<UnidadeCalc, boolean> {
  const porChave = new Map<string, UnidadeCalc[]>()
  for (const u of unidades) {
    if (!u.diaBonus) continue
    const chave = `${u.nome}|${u.diaBonus}`
    const arr = porChave.get(chave) ?? []
    arr.push(u)
    porChave.set(chave, arr)
  }
  const res = new Map<UnidadeCalc, boolean>()
  for (const arr of porChave.values()) {
    const temBonus = arr.length > 1
    for (const u of arr) res.set(u, temBonus)
  }
  return res
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function agrega(nomes: string[], unidades: UnidadeCalc[], tiers: readonly SpeedTier[]): LinhaTrilha[] {
  const bonus = bonusMesmoDia(unidades)
  const acc = new Map<string, { volume: number; dois: number; pontos: number; leadtimes: number[] }>()

  for (const u of unidades) {
    const cur = acc.get(u.nome) ?? { volume: 0, dois: 0, pontos: 0, leadtimes: [] }
    const peso = pesoFonte(u.fonte)
    const base = peso * (bonus.get(u) ? 1.5 : 1)
    const mult = classificarVelocidade(u.leadtime, tiers).mult
    cur.volume += 1
    if (peso === 2) cur.dois += 1
    cur.pontos += base * mult
    if (u.leadtime !== null) cur.leadtimes.push(Math.max(0, u.leadtime))
    acc.set(u.nome, cur)
  }

  return nomes.map(nome => {
    const c = acc.get(nome) ?? { volume: 0, dois: 0, pontos: 0, leadtimes: [] }
    const med = mediana(c.leadtimes)
    return {
      nome,
      volume: c.volume,
      volume2pts: c.dois,
      pontos: Math.round(c.pontos * 10) / 10,
      tempoMedianoDias: med,
      tagVelocidade: classificarVelocidade(med, tiers).tag,
    }
  })
}

/** Pontos da trilha SDR por pessoa. `nomes` fixa a ordem e garante linha (zerada) pra quem não teve RR. */
export function pontosSdr(rrs: RrUnidade[], nomes: string[]): LinhaTrilha[] {
  return agrega(
    nomes,
    rrs.map(r => ({
      nome: r.nome,
      fonte: r.fonte,
      leadtime: difDias(r.dataMql, r.dataAgendamento),
      diaBonus: toLocalDate(r.dataRr),
    })),
    SDR_SPEED_TIERS,
  )
}

/** Pontos da trilha Closer por pessoa. `nomes` fixa a ordem e garante linha (zerada) pra quem não vendeu. */
export function pontosCloser(vendas: VendaUnidade[], nomes: string[]): LinhaTrilha[] {
  return agrega(
    nomes,
    vendas.map(v => ({
      nome: v.nome,
      fonte: v.fonte,
      leadtime: difDias(v.dataRr, v.dataVenda),
      diaBonus: toLocalDate(v.dataVenda),
    })),
    CLOSER_SPEED_TIERS,
  )
}
