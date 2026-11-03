import { toLocalDate } from '@/lib/dateUtils'

/**
 * Corrida de Performance — motor de pontuação da Campanha de Metas (tema F1).
 *
 * Regra (doc "corrida-de-performance-logica.md"):
 *
 *   PONTOS = Σ  (pontos de volume da unidade)  ×  multiplicador de velocidade(tempo daquela unidade)
 *
 * "unidade" = 1 RR realizada (trilha SDR) ou 1 unidade de franquia vendida
 * (trilha Closer). Venda de 2 unidades conta 2, não 1 deal: a campanha mede
 * unidade vendida (decisão do Junior, 28/09), igual aos cards de meta.
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
 * Multiplicador de ticket: por **marca** — reconhece que uma venda de marca
 * de ticket alto (mais investimento do franqueado, ciclo mais longo, comprador
 * mais sofisticado) vale mais que uma de ticket baixo. Ver `TICKET_FAIXAS`.
 * Validado com o Brunno em 10-11/09.
 *
 * Fora de escopo por decisão do Junior (08/09): guardrail de no-show e de
 * desconto máximo. Contamos só RR/venda que de fato aconteceu
 * (`data_reuniao_realizada` / `data_venda` preenchida), então o guardrail de
 * no-show já cai por construção.
 *
 * Extrato (transparência, 03/11): `lancamentosSdr`/`lancamentosCloser` devolvem
 * 1 lançamento por RR/venda com cada fator da conta, e o card de cada pessoa
 * (`pontosSdr`/`pontosCloser`) é a soma deles (`somarLancamentos`). O texto em
 * português de cada fator mora em `corridaExtrato.ts`.
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
  'nao identificado', // opção criada na migração dos funis de marca (10/2026): sem evidência de fonte
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

/* ── Multiplicador de ticket por marca ─────────────────────────────────── */

export interface TicketTier {
  tier: 1 | 2 | 3 | 4
  mult: number
  /** Faixa de investimento total do franqueado — só pra exibição, não é lida de nenhuma tabela. */
  label: string
}

/**
 * Faixa de ticket por marca — investimento **total** do franqueado pra montar
 * a unidade (não a taxa de franquia de `DB_Valor_Franquia`, que é só o valor
 * do contrato). Não existe em nenhuma tabela do banco; decisão de negócio do
 * Junior, validada com o Brunno em 10-11/09/2026, mantida aqui à mão — mesmo
 * espírito das metas hardcoded de `constants/metasVendas.ts`.
 *
 * `TICKET_FAIXAS` é a fonte única: o motor (`multTicket`/`ticketTierDe`, via
 * `TICKET_POR_MARCA` derivado dela) E a régua "Como a pontuação funciona" na
 * aba Campanha de Metas leem daqui — nunca duplique a lista de marcas por
 * faixa em outro lugar, senão a régua visível e o cálculo real podem divergir
 * (é exatamente a pergunta que o Junior antecipou: "o que foi usado pra
 * definir o multiplicador de cada marca" tem que ter UMA resposta só).
 *
 * Marca fora daqui (marca nova, Odonto Legacy, Premium Club, Repasse…) cai em
 * `TICKET_PADRAO` (tier 1 · ×1,0): nunca é penalizada, só não ganha o bônus
 * até alguém classificar. Adicione a marca na faixa certa quando ela entrar
 * de fato na campanha.
 */
export interface TicketFaixa extends TicketTier {
  /** Marcas nessa faixa hoje, nome de exibição (não normalizado). */
  marcas: readonly string[]
}

export const TICKET_FAIXAS: readonly TicketFaixa[] = [
  { tier: 1, mult: 1.0, label: 'até R$ 200 mil', marcas: ['B2Case', 'Eletrovias'] },
  { tier: 2, mult: 1.5, label: 'R$ 201 mil – 500 mil', marcas: ['Inpot', 'Lisô Laser'] },
  { tier: 3, mult: 1.75, label: 'R$ 501 mil – 1 milhão', marcas: ['Oral Unic'] },
  { tier: 4, mult: 2.0, label: 'acima de R$ 1 milhão', marcas: ['Viva'] },
]

/** Faixa padrão pra marca fora de `TICKET_FAIXAS` — tier 1, sem bônus. */
const TICKET_PADRAO: TicketTier = { tier: 1, mult: 1.0, label: 'até R$ 200 mil' }

/** Normaliza marca pra chave de lookup: sem acento, minúsculo, espaço colapsado. */
export function normalizarMarca(marca: string | null | undefined): string {
  return (marca ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lookup marca normalizada → faixa, derivado de `TICKET_FAIXAS` (nunca digitado à parte). */
const TICKET_POR_MARCA: ReadonlyMap<string, TicketTier> = new Map(
  TICKET_FAIXAS.flatMap(f => f.marcas.map(
    m => [normalizarMarca(m), { tier: f.tier, mult: f.mult, label: f.label }] as const,
  )),
)

/** Faixa de ticket completa (tier/multiplicador/rótulo) da marca. Fora do mapa → `TICKET_PADRAO`. */
export function ticketTierDe(marca: string | null | undefined): TicketTier {
  return TICKET_POR_MARCA.get(normalizarMarca(marca)) ?? TICKET_PADRAO
}

/** true se a marca está em `TICKET_FAIXAS`; false = caiu no padrão ×1,0 por não ter faixa. */
export function marcaTemFaixa(marca: string | null | undefined): boolean {
  return TICKET_POR_MARCA.has(normalizarMarca(marca))
}

/** Multiplicador de ticket da marca — atalho pra `ticketTierDe(marca).mult`. */
export function multTicket(marca: string | null | undefined): number {
  return ticketTierDe(marca).mult
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

/**
 * Identificação do negócio de onde veio a unidade. Opcional só pra não
 * obrigar teste a montar negócio: o hook sempre manda, e é ela que liga o
 * extrato de pontos ao pop-up do negócio (grão = `id_lead` + `ciclo`).
 */
interface NegocioDaUnidade {
  idLead?: string
  ciclo?: number
  negociacao?: string | null
}

/** 1 RR realizada no mês (trilha SDR). */
export interface RrUnidade extends NegocioDaUnidade {
  nome: string // nome_sdr canônico
  fonte: string | null // fonte_macro
  marca: string | null // marca do deal
  dataMql: string | null // data_novo_mql
  dataAgendamento: string | null // data_agendamento_reuniao_sql
  dataRr: string // data_reuniao_realizada (já filtrada no mês)
}

/** 1 venda (deal ganho) no mês (trilha Closer) — pontua por unidade de franquia vendida nela. */
export interface VendaUnidade extends NegocioDaUnidade {
  nome: string // nome_closer canônico
  fonte: string | null // fonte_macro
  marca: string | null // marca do deal
  dataRr: string | null // data_reuniao_realizada
  dataVenda: string // data_venda (já filtrada no mês)
  unidades: number // franquias vendidas no deal (`saleUnits`: sem produto conta 1)
}

/* ── Saída ──────────────────────────────────────────────────────────────── */

export type Trilha = 'sdr' | 'closer'

/**
 * Um lançamento do extrato de pontos: uma RR (trilha SDR) ou uma venda
 * (trilha Closer), com cada fator da conta. Venda de 2 unidades é UM
 * lançamento com `unidades: 2` — os pontos são `pontosUnidade × unidades`.
 * O card de cada pessoa (`LinhaTrilha`) é a soma dos lançamentos dela
 * (`somarLancamentos`), então extrato e card nunca divergem.
 */
export interface Lancamento {
  trilha: Trilha
  /** Piloto (nome canônico, como em `nomes`). */
  nome: string
  idLead: string
  ciclo: number
  negociacao: string | null
  marca: string | null
  fonte: string | null
  /** RR realizada (SDR) ou venda (Closer) — timestamp ISO. */
  data: string
  /** Dia (Brasília) da RR/venda; `null` se a data for inválida (aí não há bônus). */
  dia: string | null
  /** Unidades do placar: 1 RR (SDR) ou as unidades vendidas no negócio (Closer). */
  unidades: number
  /** Quantas unidades a pessoa fez nesse dia, contando as deste lançamento. */
  unidadesNoDia: number
  /** 1,5 quando a pessoa fez mais de 1 unidade no dia; senão 1. */
  bonus: number
  /** Peso de volume pela Fonte Macro. */
  peso: 1 | 2
  /** Faixa de ticket da marca. */
  ticket: TicketTier
  /** Início e fim do tempo da velocidade: MQL → agendamento (SDR) ou RR → venda (Closer). */
  inicioVelocidade: string | null
  fimVelocidade: string | null
  /** Tempo em dias (`fim − início`); `null` quando falta uma das datas. */
  leadtimeDias: number | null
  /** Faixa de velocidade — multiplicador neutro 1 e tag '—' quando falta data. */
  velocidade: SpeedTier
  /** peso × bônus × ticket × velocidade. */
  pontosUnidade: number
  /** pontosUnidade × unidades, SEM arredondar (o card arredonda só o total). */
  pontos: number
}

export interface LinhaTrilha {
  nome: string
  /** nº de RR (SDR) ou de unidades vendidas (Closer) no mês. */
  volume: number
  /** quantas dessas unidades vieram de fonte que pesa 2 pts. */
  volume2pts: number
  /** Σ (volume_unidade × mult_velocidade), arredondado a 1 casa decimal. */
  pontos: number
  /** Média do multiplicador de ticket das unidades da pessoa (1,0 quando não há unidade, ou todas em tier 1). */
  ticketMedio: number
  /** Tempo mediano (dias) das unidades com data completa; `null` se nenhuma tem. */
  tempoMedianoDias: number | null
  /** Tag da faixa em que cai o tempo mediano. '—' quando não há dado. */
  tagVelocidade: string
}

/** O que cada trilha manda pro cálculo dos lançamentos. */
interface EntradaLancamento {
  nome: string
  idLead: string
  ciclo: number
  negociacao: string | null
  marca: string | null
  fonte: string | null
  data: string
  unidades: number
  inicioVelocidade: string | null
  fimVelocidade: string | null
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Calcula os fatores de cada unidade. Só gera lançamento pra quem está em
 * `nomes` (os pilotos do mês). O bônus olha as unidades da MESMA pessoa no
 * mesmo dia (Brasília): mais de 1 → ×1,5 em todas elas — inclusive quando é
 * uma venda só de 2 unidades.
 */
function montarLancamentos(trilha: Trilha, entradas: EntradaLancamento[], nomes: readonly string[], tiers: readonly SpeedTier[]): Lancamento[] {
  const pilotos = new Set(nomes)
  const doTime = entradas.filter(e => pilotos.has(e.nome))
  const dias = doTime.map(e => toLocalDate(e.data))
  const porDia = new Map<string, number>()
  doTime.forEach((e, i) => {
    const dia = dias[i]
    if (!dia) return
    const chave = `${e.nome}|${dia}`
    porDia.set(chave, (porDia.get(chave) ?? 0) + e.unidades)
  })

  return doTime.map((e, i) => {
    const dia = dias[i]
    const unidadesNoDia = dia ? porDia.get(`${e.nome}|${dia}`) ?? e.unidades : e.unidades
    const bonus = dia && unidadesNoDia > 1 ? 1.5 : 1
    const peso = pesoFonte(e.fonte)
    const ticket = ticketTierDe(e.marca)
    const leadtimeDias = difDias(e.inicioVelocidade, e.fimVelocidade)
    const velocidade = classificarVelocidade(leadtimeDias, tiers)
    const pontosUnidade = peso * bonus * ticket.mult * velocidade.mult
    return {
      ...e,
      trilha,
      dia,
      unidadesNoDia,
      bonus,
      peso,
      ticket,
      leadtimeDias,
      velocidade,
      pontosUnidade,
      pontos: pontosUnidade * e.unidades,
    }
  })
}

/**
 * Card de cada pessoa a partir dos lançamentos dela. `nomes` fixa a ordem e
 * garante linha (zerada) pra quem não pontuou. Os pontos somam os valores
 * exatos e só o total é arredondado (1 casa) — é o número do card.
 */
export function somarLancamentos(nomes: readonly string[], lancamentos: readonly Lancamento[], tiers: readonly SpeedTier[]): LinhaTrilha[] {
  const acc = new Map<string, { volume: number; dois: number; pontos: number; ticketSum: number; leadtimes: number[] }>()
  for (const l of lancamentos) {
    const cur = acc.get(l.nome) ?? { volume: 0, dois: 0, pontos: 0, ticketSum: 0, leadtimes: [] }
    cur.volume += l.unidades
    if (l.peso === 2) cur.dois += l.unidades
    cur.pontos += l.pontos
    cur.ticketSum += l.ticket.mult * l.unidades
    if (l.leadtimeDias !== null) {
      for (let k = 0; k < l.unidades; k++) cur.leadtimes.push(Math.max(0, l.leadtimeDias))
    }
    acc.set(l.nome, cur)
  }

  return nomes.map(nome => {
    const c = acc.get(nome) ?? { volume: 0, dois: 0, pontos: 0, ticketSum: 0, leadtimes: [] }
    const med = mediana(c.leadtimes)
    return {
      nome,
      volume: c.volume,
      volume2pts: c.dois,
      pontos: Math.round(c.pontos * 10) / 10,
      ticketMedio: c.volume > 0 ? Math.round((c.ticketSum / c.volume) * 100) / 100 : 1,
      tempoMedianoDias: med,
      tagVelocidade: classificarVelocidade(med, tiers).tag,
    }
  })
}

/** Lançamentos da trilha SDR: 1 por RR realizada de piloto. Velocidade = MQL → agendamento do SQL. */
export function lancamentosSdr(rrs: RrUnidade[], nomes: readonly string[]): Lancamento[] {
  return montarLancamentos(
    'sdr',
    rrs.map(r => ({
      nome: r.nome,
      idLead: r.idLead ?? '',
      ciclo: r.ciclo ?? 1,
      negociacao: r.negociacao ?? null,
      marca: r.marca,
      fonte: r.fonte,
      data: r.dataRr,
      unidades: 1,
      inicioVelocidade: r.dataMql,
      fimVelocidade: r.dataAgendamento,
    })),
    nomes,
    SDR_SPEED_TIERS,
  )
}

/** Pontos da trilha SDR por pessoa. `nomes` fixa a ordem e garante linha (zerada) pra quem não teve RR. */
export function pontosSdr(rrs: RrUnidade[], nomes: string[]): LinhaTrilha[] {
  return somarLancamentos(nomes, lancamentosSdr(rrs, nomes), SDR_SPEED_TIERS)
}

/** Quantas unidades a venda vale no placar: inteiro ≥ 1 — venda nunca some nem vale menos que 1. */
function unidadesDaVenda(v: VendaUnidade): number {
  const q = Math.round(v.unidades)
  return Number.isFinite(q) && q > 0 ? q : 1
}

/**
 * Lançamentos da trilha Closer: 1 por venda de piloto, com as unidades
 * vendidas nela. Velocidade = reunião realizada → venda.
 */
export function lancamentosCloser(vendas: VendaUnidade[], nomes: readonly string[]): Lancamento[] {
  return montarLancamentos(
    'closer',
    vendas.map(v => ({
      nome: v.nome,
      idLead: v.idLead ?? '',
      ciclo: v.ciclo ?? 1,
      negociacao: v.negociacao ?? null,
      marca: v.marca,
      fonte: v.fonte,
      data: v.dataVenda,
      unidades: unidadesDaVenda(v),
      inicioVelocidade: v.dataRr,
      fimVelocidade: v.dataVenda,
    })),
    nomes,
    CLOSER_SPEED_TIERS,
  )
}

/**
 * Pontos da trilha Closer por pessoa. Cada unidade vendida entra como uma
 * unidade do placar (venda de 2 unidades = 2 no volume, nos pontos e no bônus
 * de "mais de 1 unidade no mesmo dia"). `nomes` fixa a ordem e garante linha
 * (zerada) pra quem não vendeu.
 */
export function pontosCloser(vendas: VendaUnidade[], nomes: string[]): LinhaTrilha[] {
  return somarLancamentos(nomes, lancamentosCloser(vendas, nomes), CLOSER_SPEED_TIERS)
}
