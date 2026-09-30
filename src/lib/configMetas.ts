/**
 * Configuração das Metas — modelo do rascunho e regras do funil reverso.
 * Spec: docs/superpowers/specs/2026-09-30-configuracao-metas-wizard-design.md
 *
 * Puro (sem React nem Supabase): a tela monta um `RascunhoConfig`, este módulo
 * calcula o funil de cada marca, diz o que falta e converte pro formato que
 * `publicar_meta_versao` já grava (`ConfigEtapa[]` + linhas do espelho).
 */
import { BRAND_LIST } from '@/constants/brands'
import {
  gerarLinhasEspelho, gerarSemanas, resolverFunilMarca,
  type ConfigEtapa, type DiaSemana, type EtapaMeta, type LinhaEspelho,
  type PessoaComFuncao, type ResolucaoFunil, type Semana,
} from '@/lib/metasEngine'
import type { DistribuicaoSemanalItem, EstadoMes, EstadoMesMarca, VersaoMeta } from '@/hooks/useMetaMes'

// ── Etapas ───────────────────────────────────────────────────────────────

/** Funil de cima pra baixo, na ordem em que a tela desenha. Vendas (Fechamento) é a âncora. */
export const ETAPAS_FUNIL = ['Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Oportunidade COF', 'Fechamento'] as const
export type EtapaFunil = typeof ETAPAS_FUNIL[number]

/** Etapas que o gestor configura, na ordem em que o cálculo sobe (de baixo pra
 *  cima). Ligações fica fora da cadeia, pendurada no SQL. */
export const ETAPAS_CONFIGURAVEIS = ['Oportunidade COF', 'SAL', 'Reunião Realizada', 'Reunião Agendada SQL', 'Ligações'] as const
export type EtapaConfiguravel = typeof ETAPAS_CONFIGURAVEIS[number]

export type EtapaMetaConfig = EtapaFunil | 'Ligações'

export const ROTULO_ETAPA: Record<EtapaMetaConfig, string> = {
  'Ligações': 'Ligações',
  'Reunião Agendada SQL': 'SQL',
  'Reunião Realizada': 'Diagnóstico',
  SAL: 'SAL',
  'Oportunidade COF': 'COF',
  Fechamento: 'Vendas',
}

/** A conversão de uma etapa é sempre dela pra de baixo: taxa = valor(baixo) ÷ valor(etapa). */
export const ETAPA_ABAIXO: Record<EtapaConfiguravel, EtapaFunil> = {
  'Ligações': 'Reunião Agendada SQL',
  'Reunião Agendada SQL': 'Reunião Realizada',
  'Reunião Realizada': 'SAL',
  SAL: 'Oportunidade COF',
  'Oportunidade COF': 'Fechamento',
}

/** Quem leva a meta de cada etapa — mesma partição de `gerarLinhasEspelho`. */
export const ETAPAS_SDR: readonly EtapaMetaConfig[] = ['Ligações', 'Reunião Agendada SQL', 'Reunião Realizada', 'SAL']
export const ETAPAS_CLOSER: readonly EtapaMetaConfig[] = ['Oportunidade COF', 'Fechamento']

/** Etapas da distribuição semanal manual (as mesmas do Hub antigo). */
export const ETAPAS_SEMANAIS: Record<'SDR' | 'Closer', readonly EtapaMeta[]> = {
  SDR: ['Ligações', 'Reunião Agendada SQL'],
  Closer: ['Oportunidade COF', 'Fechamento'],
}

export function funcaoDaEtapaSemanal(etapa: EtapaMeta): 'SDR' | 'Closer' {
  return etapa === 'Oportunidade COF' || etapa === 'Fechamento' ? 'Closer' : 'SDR'
}

// ── Modelo ───────────────────────────────────────────────────────────────

export type ModoEtapaConfig =
  | { tipo: 'referencia' }
  | { tipo: 'conversao'; taxa: number | null }
  | { tipo: 'manual'; valor: number | null }
  | { tipo: 'sem_meta' }

/** O que a marca tinha na versão de onde o rascunho partiu (mês anterior ou versão base). */
export interface ReferenciaMarca {
  /** 'setembro', 'V1'… — só rótulo pra tela. */
  rotulo: string
  vendas: number | null
  ticketMedio: number | null
  /** Conversão etapa → etapa de baixo. */
  taxas: Partial<Record<EtapaConfiguravel, number>>
  /** Meta de cada etapa na referência, já arredondada. */
  valores: Partial<Record<EtapaMetaConfig, number>>
}

export interface MarcaConfig {
  marca: string
  vendas: number | null
  ticketMedio: number | null
  etapas: Record<EtapaConfiguravel, ModoEtapaConfig>
  pessoas: PessoaComFuncao[]
  referencia: ReferenciaMarca | null
}

export type OrigemRascunho =
  | { tipo: 'mes_anterior'; mes: string; rotulo: string }
  | { tipo: 'versao'; versaoId: number; numero: number; rotulo: string }
  | { tipo: 'branco' }

export interface RascunhoConfig {
  mesReferencia: string
  origem: OrigemRascunho
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: MarcaConfig[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  atualizadoEm: string
}

/** Meta inteira pra cima. O -1e-9 evita que 28,000000000000004 vire 29. */
export function arredondarMeta(x: number): number {
  return Math.max(0, Math.ceil(x - 1e-9))
}

export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  const d = new Date(ano, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Referência e rascunhos ───────────────────────────────────────────────

/**
 * Lê uma versão publicada como referência. A taxa de cada etapa é a gravada,
 * quando a etapa derivava da de baixo; senão, a implícita dos valores exatos
 * (`exato(baixo) / exato(etapa)`) — é o caso de toda a V1 de setembro, que foi
 * importada com números fixos.
 */
export function referenciaDeVersao(estado: EstadoMesMarca, rotulo: string): ReferenciaMarca {
  const exato = resolverFunilMarca(estado.etapas, estado.ticketMedio).valores
  const porEtapa = new Map(estado.etapas.map(e => [e.etapa, e]))
  const taxas: Partial<Record<EtapaConfiguravel, number>> = {}
  for (const x of ETAPAS_CONFIGURAVEIS) {
    const abaixo = ETAPA_ABAIXO[x]
    const cfg = porEtapa.get(x)
    if (cfg?.modo === 'derivado' && cfg.etapaOrigem === abaixo && cfg.taxa != null && cfg.taxa > 0) {
      taxas[x] = cfg.taxa
      continue
    }
    const vx = exato[x]
    const vb = exato[abaixo]
    if (vx != null && vx > 0 && vb != null && vb > 0) taxas[x] = vb / vx
  }
  const valores: Partial<Record<EtapaMetaConfig, number>> = {}
  for (const e of [...ETAPAS_FUNIL, 'Ligações'] as EtapaMetaConfig[]) {
    const v = exato[e]
    if (v != null) valores[e] = arredondarMeta(v)
  }
  return {
    rotulo,
    vendas: exato['Fechamento'] ?? null,
    ticketMedio: estado.ticketMedio > 0 ? estado.ticketMedio : null,
    taxas,
    valores,
  }
}

function etapasPadrao(fn: (x: EtapaConfiguravel) => ModoEtapaConfig): Record<EtapaConfiguravel, ModoEtapaConfig> {
  return Object.fromEntries(ETAPAS_CONFIGURAVEIS.map(x => [x, fn(x)])) as Record<EtapaConfiguravel, ModoEtapaConfig>
}

/** Marca de um mês novo a partir do mês anterior: tudo preenchido menos as vendas. */
export function marcaDoMesAnterior(estado: EstadoMesMarca, rotulo: string): MarcaConfig {
  const referencia = referenciaDeVersao(estado, rotulo)
  return {
    marca: estado.marca,
    vendas: null,
    ticketMedio: referencia.ticketMedio,
    etapas: etapasPadrao(x => {
      if (referencia.taxas[x] != null) return { tipo: 'referencia' }
      const v = referencia.valores[x]
      return v != null && v > 0 ? { tipo: 'manual', valor: v } : { tipo: 'sem_meta' }
    }),
    pessoas: estado.pessoas.map(p => ({ ...p })),
    referencia,
  }
}

/**
 * Marca de uma revisão (V2 a partir de V{k}). Etapa fixa de versão montada no
 * Hub volta como manual (foi escolha do gestor); de versão importada, como
 * referência (o fixo era só o jeito de importar a planilha).
 */
export function marcaDeVersao(estado: EstadoMesMarca, rotulo: string, importada: boolean): MarcaConfig {
  const referencia = referenciaDeVersao(estado, rotulo)
  const porEtapa = new Map(estado.etapas.map(e => [e.etapa, e]))
  return {
    marca: estado.marca,
    vendas: referencia.vendas,
    ticketMedio: referencia.ticketMedio,
    etapas: etapasPadrao(x => {
      const cfg = porEtapa.get(x)
      if (!cfg || cfg.modo === 'desligado') return { tipo: 'sem_meta' }
      if (cfg.modo === 'derivado' || importada) {
        if (referencia.taxas[x] != null) return { tipo: 'referencia' }
        const v = referencia.valores[x]
        return v != null ? { tipo: 'manual', valor: v } : { tipo: 'sem_meta' }
      }
      return { tipo: 'manual', valor: cfg.valorFixo ?? null }
    }),
    pessoas: estado.pessoas.map(p => ({ ...p })),
    referencia,
  }
}

export function marcaEmBranco(marca: string): MarcaConfig {
  return {
    marca,
    vendas: null,
    ticketMedio: null,
    etapas: etapasPadrao(() => ({ tipo: 'conversao', taxa: null })),
    pessoas: [],
    referencia: null,
  }
}

const ORDEM_MARCA = new Map(BRAND_LIST.flatMap((b, i) => (b.marca ? [[b.marca as string, i] as const] : [])))

export function ordenarMarcas<T extends { marca: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    (ORDEM_MARCA.get(a.marca) ?? 99) - (ORDEM_MARCA.get(b.marca) ?? 99) || a.marca.localeCompare(b.marca, 'pt-BR'))
}

export function marcasDisponiveis(r: RascunhoConfig): string[] {
  const presentes = new Set(r.marcas.map(m => m.marca))
  return BRAND_LIST.flatMap(b => (b.marca && !presentes.has(b.marca) ? [b.marca as string] : []))
}

export function rascunhoDoMesAnterior(mesReferencia: string, anterior: EstadoMes, rotulo: string, agora = new Date()): RascunhoConfig {
  return {
    mesReferencia,
    origem: { tipo: 'mes_anterior', mes: mesAnterior(mesReferencia), rotulo },
    diaViradaSemana: anterior.diaViradaSemana,
    semanas: gerarSemanas(mesReferencia, anterior.diaViradaSemana),
    marcas: ordenarMarcas(anterior.marcas.map(m => marcaDoMesAnterior(m, rotulo))),
    distribuicaoSemanal: [],
    atualizadoEm: agora.toISOString(),
  }
}

export function rascunhoDeVersao(
  mesReferencia: string,
  versao: Pick<VersaoMeta, 'id' | 'numero' | 'rotulo' | 'origem'>,
  estado: EstadoMes,
  agora = new Date(),
): RascunhoConfig {
  const rotulo = `V${versao.numero}`
  return {
    mesReferencia,
    origem: { tipo: 'versao', versaoId: versao.id, numero: versao.numero, rotulo: versao.rotulo },
    diaViradaSemana: estado.diaViradaSemana,
    semanas: estado.semanas,
    marcas: ordenarMarcas(estado.marcas.map(m => marcaDeVersao(m, rotulo, versao.origem === 'importado'))),
    distribuicaoSemanal: estado.distribuicaoSemanal,
    atualizadoEm: agora.toISOString(),
  }
}

export function rascunhoEmBranco(mesReferencia: string, marcas: string[], agora = new Date()): RascunhoConfig {
  return {
    mesReferencia,
    origem: { tipo: 'branco' },
    diaViradaSemana: 'terca',
    semanas: gerarSemanas(mesReferencia, 'terca'),
    marcas: ordenarMarcas(marcas.map(marcaEmBranco)),
    distribuicaoSemanal: [],
    atualizadoEm: agora.toISOString(),
  }
}

// ── Cálculo do funil ─────────────────────────────────────────────────────

export type OrigemValor = 'ancora' | 'referencia' | 'conversao' | 'manual' | 'sem_meta'

export interface EtapaCalculada {
  etapa: EtapaMetaConfig
  exato: number | null
  meta: number | null
  /** Conversão etapa → de baixo usada no cálculo (implícita, se manual). */
  taxa: number | null
  origem: OrigemValor
  /** Nova conversão diferente da de referência. */
  alterada: boolean
  problema: string | null
}

export interface FunilCalculado {
  etapas: Record<EtapaMetaConfig, EtapaCalculada>
  faturamento: number | null
}

/**
 * Resolve o funil de baixo pra cima. Cada etapa parte do valor EXATO da de
 * baixo e só o resultado é arredondado (sem cascata). Etapa cuja de baixo
 * ainda não tem valor (vendas em branco, conversão faltando) fica sem valor e
 * sem reclamar — o problema já está apontado na etapa de baixo.
 */
export function calcularFunil(m: MarcaConfig): FunilCalculado {
  const etapas = {} as Record<EtapaMetaConfig, EtapaCalculada>
  etapas.Fechamento = {
    etapa: 'Fechamento', exato: m.vendas, meta: m.vendas, taxa: null,
    origem: 'ancora', alterada: false, problema: null,
  }

  for (const x of ETAPAS_CONFIGURAVEIS) {
    const modo = m.etapas[x]
    const abaixo = etapas[ETAPA_ABAIXO[x]]
    const refTaxa = m.referencia?.taxas[x] ?? null
    let exato: number | null = null
    let taxa: number | null = null
    let problema: string | null = null
    let alterada = false
    let origem: OrigemValor = 'sem_meta'

    if (modo.tipo === 'manual') {
      origem = 'manual'
      if (modo.valor == null || !(modo.valor >= 0)) {
        problema = `Informe o número de ${ROTULO_ETAPA[x]}`
      } else {
        exato = modo.valor
        if (abaixo.exato != null && modo.valor > 0) taxa = abaixo.exato / modo.valor
      }
    } else if (modo.tipo === 'referencia' || modo.tipo === 'conversao') {
      origem = modo.tipo
      taxa = modo.tipo === 'referencia' ? refTaxa : modo.taxa
      if (modo.tipo === 'conversao') {
        alterada = refTaxa == null || taxa == null || Math.abs(taxa - refTaxa) > 0.0005
      }
      if (taxa == null || !(taxa > 0)) {
        problema = modo.tipo === 'referencia'
          ? `${ROTULO_ETAPA[x]} não tem conversão de referência — informe uma nova`
          : `Informe a conversão ${ROTULO_ETAPA[x]} → ${ROTULO_ETAPA[abaixo.etapa]}`
        taxa = null
      } else if (abaixo.origem === 'sem_meta') {
        problema = `${ROTULO_ETAPA[abaixo.etapa]} está sem meta — informe ${ROTULO_ETAPA[x]} como número manual ou marque sem meta`
      } else if (abaixo.exato != null) {
        exato = abaixo.exato / taxa
      }
    }

    etapas[x] = {
      etapa: x, exato, meta: exato != null ? arredondarMeta(exato) : null,
      taxa, origem, alterada, problema,
    }
  }

  const faturamento = m.vendas != null && m.ticketMedio != null ? m.vendas * m.ticketMedio : null
  return { etapas, faturamento }
}

/** Troca o modo de uma etapa. "Sem meta" leva junto as de cima até a primeira manual. */
export function definirModoEtapa(m: MarcaConfig, etapa: EtapaConfiguravel, modo: ModoEtapaConfig): MarcaConfig {
  const etapas = { ...m.etapas, [etapa]: modo }
  if (modo.tipo === 'sem_meta') {
    for (const acima of ETAPAS_CONFIGURAVEIS.slice(ETAPAS_CONFIGURAVEIS.indexOf(etapa) + 1)) {
      if (etapas[acima].tipo === 'manual') break
      etapas[acima] = { tipo: 'sem_meta' }
    }
  }
  return { ...m, etapas }
}

// ── Pendências e status ──────────────────────────────────────────────────

export interface Pendencia {
  secao: 'base' | 'funil' | 'time'
  texto: string
}

export type StatusMarca = 'nao_configurada' | 'em_configuracao' | 'configurada'

function fmtPeso(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('pt-BR')
}

export function pendenciasMarca(m: MarcaConfig, funil: FunilCalculado = calcularFunil(m)): Pendencia[] {
  const p: Pendencia[] = []
  if (m.vendas == null) p.push({ secao: 'base', texto: 'Informe as vendas previstas do mês' })
  if (m.ticketMedio == null || !(m.ticketMedio > 0)) p.push({ secao: 'base', texto: 'Informe a taxa de franquia média' })

  for (const x of [...ETAPAS_CONFIGURAVEIS].reverse()) {
    const problema = funil.etapas[x].problema
    if (problema) p.push({ secao: 'funil', texto: problema })
  }

  const sdrs = m.pessoas.filter(x => x.funcao === 'SDR')
  const closers = m.pessoas.filter(x => x.funcao === 'Closer')
  const sdrComMeta = ETAPAS_SDR.some(e => funil.etapas[e].origem !== 'sem_meta')
  if (closers.length === 0) p.push({ secao: 'time', texto: 'Adicione pelo menos um Closer' })
  if (sdrComMeta && sdrs.length === 0) p.push({ secao: 'time', texto: 'Adicione pelo menos um SDR — ou marque as etapas de SDR como sem meta' })
  const somaSdr = sdrs.reduce((s, x) => s + x.peso, 0)
  if (sdrs.length > 0 && Math.abs(somaSdr - 100) > 0.01) p.push({ secao: 'time', texto: `Os pesos dos SDRs somam ${fmtPeso(somaSdr)}% — precisam somar 100%` })
  const somaCloser = closers.reduce((s, x) => s + x.peso, 0)
  if (closers.length > 0 && Math.abs(somaCloser - 100) > 0.01) p.push({ secao: 'time', texto: `Os pesos dos Closers somam ${fmtPeso(somaCloser)}% — precisam somar 100%` })
  return p
}

export function statusMarca(m: MarcaConfig, pendencias: Pendencia[] = pendenciasMarca(m)): StatusMarca {
  if (m.vendas == null) return 'nao_configurada'
  return pendencias.length > 0 ? 'em_configuracao' : 'configurada'
}

// ── Pessoas ──────────────────────────────────────────────────────────────

/** 100% repartido igualmente entre as pessoas da função; a última fecha a soma. */
export function dividirIgualmente(pessoas: PessoaComFuncao[], funcao: 'SDR' | 'Closer'): PessoaComFuncao[] {
  const n = pessoas.filter(p => p.funcao === funcao).length
  if (n === 0) return pessoas
  const base = Math.floor((100 / n) * 100) / 100
  const ultima = Math.round((100 - base * (n - 1)) * 100) / 100
  let i = 0
  return pessoas.map(p => {
    if (p.funcao !== funcao) return p
    i += 1
    return { ...p, peso: i === n ? ultima : base }
  })
}

export interface MetaPessoa {
  nome: string
  funcao: 'SDR' | 'Closer'
  peso: number
  valores: Partial<Record<EtapaMetaConfig, number>>
  faturamento: number | null
}

export function metasPorPessoa(m: MarcaConfig, funil: FunilCalculado = calcularFunil(m)): MetaPessoa[] {
  return m.pessoas.map(p => {
    const fracao = p.peso / 100
    const valores: Partial<Record<EtapaMetaConfig, number>> = {}
    for (const e of p.funcao === 'SDR' ? ETAPAS_SDR : ETAPAS_CLOSER) {
      const meta = funil.etapas[e].meta
      if (meta != null) valores[e] = meta * fracao
    }
    return {
      nome: p.nome, funcao: p.funcao, peso: p.peso, valores,
      faturamento: p.funcao === 'Closer' && funil.faturamento != null ? funil.faturamento * fracao : null,
    }
  })
}

// ── Persistência ─────────────────────────────────────────────────────────

/** Rascunho → formato de `meta_marca_etapa` (spec §5). */
export function paraConfigEtapas(m: MarcaConfig): ConfigEtapa[] {
  const cfgs: ConfigEtapa[] = [{ etapa: 'Fechamento', modo: 'fixo', valorFixo: m.vendas ?? 0 }]
  for (const x of ETAPAS_CONFIGURAVEIS) {
    const modo = m.etapas[x]
    const etapaOrigem = ETAPA_ABAIXO[x]
    if (modo.tipo === 'referencia' && m.referencia?.taxas[x] != null) {
      cfgs.push({ etapa: x, modo: 'derivado', etapaOrigem, taxa: m.referencia.taxas[x], taxaOrigem: 'mes_anterior' })
    } else if (modo.tipo === 'conversao' && modo.taxa != null) {
      cfgs.push({ etapa: x, modo: 'derivado', etapaOrigem, taxa: modo.taxa, taxaOrigem: 'manual' })
    } else if (modo.tipo === 'manual' && modo.valor != null) {
      cfgs.push({ etapa: x, modo: 'fixo', valorFixo: modo.valor })
    } else {
      cfgs.push({ etapa: x, modo: 'desligado' })
    }
  }
  return cfgs
}

/** Metas arredondadas no formato que `gerarLinhasEspelho` consome. */
export function resolucaoArredondada(m: MarcaConfig, funil: FunilCalculado = calcularFunil(m)): ResolucaoFunil {
  const valores: Partial<Record<EtapaMeta, number>> = {}
  for (const e of [...ETAPAS_FUNIL, 'Ligações'] as EtapaMetaConfig[]) {
    const meta = funil.etapas[e].meta
    if (meta != null) valores[e] = meta
  }
  return { valores, faturamento: funil.faturamento, erros: [] }
}

export interface Publicacao {
  marcas: EstadoMesMarca[]
  linhasEspelho: LinhaEspelho[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
}

export function montarPublicacao(r: RascunhoConfig): Publicacao {
  const semanas = new Set(r.semanas.map(s => s.numero))
  const existe = (d: DistribuicaoSemanalItem) => r.marcas.some(m => m.marca === d.marca
    && m.pessoas.some(p => p.nome === d.nomePessoa && p.funcao === funcaoDaEtapaSemanal(d.etapa)))
  return {
    marcas: r.marcas.map(m => ({ marca: m.marca, ticketMedio: m.ticketMedio ?? 0, etapas: paraConfigEtapas(m), pessoas: m.pessoas })),
    linhasEspelho: gerarLinhasEspelho(r.mesReferencia, r.marcas.map(m => ({ marca: m.marca, resolucao: resolucaoArredondada(m), pessoas: m.pessoas }))),
    distribuicaoSemanal: r.distribuicaoSemanal.filter(d => d.valor > 0 && semanas.has(d.semanaNumero) && existe(d)),
  }
}

// ── Semanas ──────────────────────────────────────────────────────────────

export function diasDaSemana(s: Semana): number {
  const [a1, m1, d1] = s.inicio.split('-').map(Number)
  const [a2, m2, d2] = s.fim.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000) + 1
}

/** Reparte o total (arredondado pra cima) pelos dias de cada semana, em inteiros que somam o total. */
export function distribuirProporcional(total: number, semanas: Semana[]): number[] {
  const inteiro = arredondarMeta(total)
  const dias = semanas.map(diasDaSemana)
  const somaDias = dias.reduce((a, b) => a + b, 0)
  if (somaDias === 0) return semanas.map(() => 0)
  const brutos = dias.map(d => (inteiro * d) / somaDias)
  const base = brutos.map(Math.floor)
  let resto = inteiro - base.reduce((a, b) => a + b, 0)
  const ordem = brutos.map((b, i) => ({ i, frac: b - Math.floor(b) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of ordem) {
    if (resto <= 0) break
    base[i] += 1
    resto -= 1
  }
  return base
}

// ── Resumo ───────────────────────────────────────────────────────────────

export function resumoRascunho(r: RascunhoConfig): { vendas: number; faturamento: number; prontas: number; total: number } {
  let vendas = 0
  let faturamento = 0
  let prontas = 0
  for (const m of r.marcas) {
    const funil = calcularFunil(m)
    vendas += m.vendas ?? 0
    faturamento += funil.faturamento ?? 0
    if (statusMarca(m, pendenciasMarca(m, funil)) === 'configurada') prontas += 1
  }
  return { vendas, faturamento, prontas, total: r.marcas.length }
}
