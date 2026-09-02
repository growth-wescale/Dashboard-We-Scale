/** As 13 etapas do funil de metas, na ordem. 'Faturamento' fica de fora de
 *  propósito — nunca é um nó do grafo, é sempre `Fechamento × ticketMedio`,
 *  calculado depois da resolução (ver resolverFunilMarca). */
export const ETAPAS_META_ORDEM = [
  'Ligações',
  'MQL',
  'Tentando Contato',
  'Contato Efetivo',
  'Interesse Reunião',
  'Conexão',
  'Reunião Agendada SQL',
  'Reunião Realizada',
  'SAL',
  'Oportunidade COF',
  'Comitê',
  'Pré-Contrato',
  'Fechamento',
] as const

export type EtapaMeta = typeof ETAPAS_META_ORDEM[number]

export type ModoEtapa = 'fixo' | 'derivado' | 'desligado'

export type DiaSemana = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo'

const DIA_SEMANA_INDICE: Record<DiaSemana, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
}

export interface Semana {
  numero: number
  inicio: string // 'YYYY-MM-DD'
  fim: string    // 'YYYY-MM-DD'
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Gera as semanas de um mês a partir do dia de virada escolhido pelo gerente.
 * A primeira semana SEMPRE começa no dia 1 do mês (mesmo que o dia 1 não seja
 * o dia de virada) — o gerente define a virada pras semanas CHEIAS seguintes,
 * não corta os primeiros dias do mês fora de uma semana.
 */
export function gerarSemanas(mesReferencia: string, diaVirada: DiaSemana): Semana[] {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0) // dia 0 do mês seguinte = último do atual

  const semanas: Semana[] = []
  let inicio = new Date(primeiroDia)
  let numero = 1

  while (inicio <= ultimoDia) {
    // Próxima virada a partir de `inicio + 1 dia` (a semana corrente vai até o
    // dia anterior à próxima ocorrência do dia de virada).
    const proximaVirada = new Date(inicio)
    proximaVirada.setDate(proximaVirada.getDate() + 1)
    while (proximaVirada.getDay() !== DIA_SEMANA_INDICE[diaVirada]) {
      proximaVirada.setDate(proximaVirada.getDate() + 1)
    }
    const fimSemana = new Date(proximaVirada)
    fimSemana.setDate(fimSemana.getDate() - 1)
    const fim = fimSemana > ultimoDia ? ultimoDia : fimSemana

    semanas.push({ numero, inicio: toIso(inicio), fim: toIso(fim) })
    numero += 1
    inicio = new Date(fim)
    inicio.setDate(inicio.getDate() + 1)
  }

  return semanas
}

export interface ConfigEtapa {
  etapa: EtapaMeta
  modo: ModoEtapa
  valorFixo?: number
  etapaOrigem?: EtapaMeta
  taxa?: number
  /** De onde veio a taxa confirmada (D10) — não participa da resolução do
   *  funil, é só proveniência exibida no Passo 2. Undefined = etapa não é
   *  'derivado' ou a origem da taxa ainda não foi registrada. */
  taxaOrigem?: 'mes_anterior' | 'historico_crm' | 'manual'
}

export interface ErroResolucao {
  tipo: 'ciclo' | 'origem_desligada' | 'origem_inexistente' | 'sem_ancora'
  etapas: EtapaMeta[]
  mensagem: string
}

export interface ResolucaoFunil {
  valores: Partial<Record<EtapaMeta, number>>
  faturamento: number | null
  erros: ErroResolucao[]
}

const INDICE_ETAPA: Record<EtapaMeta, number> = Object.fromEntries(
  ETAPAS_META_ORDEM.map((e, i) => [e, i]),
) as Record<EtapaMeta, number>

function detectarCiclos(porEtapa: Map<EtapaMeta, ConfigEtapa>): Set<EtapaMeta> {
  const emCiclo = new Set<EtapaMeta>()
  const estado = new Map<EtapaMeta, 'visitando' | 'feito'>()

  function visitar(etapa: EtapaMeta, caminho: EtapaMeta[]): void {
    const cfg = porEtapa.get(etapa)
    if (!cfg || cfg.modo !== 'derivado' || !cfg.etapaOrigem) { estado.set(etapa, 'feito'); return }

    const st = estado.get(etapa)
    if (st === 'visitando') {
      const inicioCiclo = caminho.indexOf(etapa)
      for (const e of caminho.slice(inicioCiclo)) emCiclo.add(e)
      return
    }
    if (st === 'feito') return

    estado.set(etapa, 'visitando')
    visitar(cfg.etapaOrigem, [...caminho, etapa])
    estado.set(etapa, 'feito')
  }

  for (const etapa of porEtapa.keys()) visitar(etapa, [])
  return emCiclo
}

/**
 * Resolve o funil de uma marca a partir da configuração de cada etapa.
 * Derivado sempre lê o sentido natural da taxa (origem→etapa se a origem vem
 * ANTES na ordem do funil; senão o motor divide, porque a âncora está embaixo
 * subindo). Faturamento nunca é um nó do grafo — é sempre
 * `valores['Fechamento'] × ticketMedio`, calculado no final.
 */
export function resolverFunilMarca(configs: ConfigEtapa[], ticketMedio: number): ResolucaoFunil {
  const porEtapa = new Map<EtapaMeta, ConfigEtapa>(configs.map(c => [c.etapa, c]))
  const erros: ErroResolucao[] = []
  const valores: Partial<Record<EtapaMeta, number>> = {}

  const emCiclo = detectarCiclos(porEtapa)
  if (emCiclo.size > 0) {
    erros.push({
      tipo: 'ciclo',
      etapas: [...emCiclo],
      mensagem: `As etapas ${[...emCiclo].join(', ')} formam um ciclo — cada uma deriva da outra. Escolha uma âncora fixa.`,
    })
  }

  // Fixa os valores 'fixo' primeiro.
  for (const cfg of configs) {
    if (cfg.modo === 'fixo' && cfg.valorFixo != null && !emCiclo.has(cfg.etapa)) {
      valores[cfg.etapa] = cfg.valorFixo
    }
  }

  // Fixpoint: resolve derivados cuja origem já tem valor, até não sobrar nada pra resolver.
  let mudou = true
  while (mudou) {
    mudou = false
    for (const cfg of configs) {
      if (cfg.modo !== 'derivado' || emCiclo.has(cfg.etapa) || valores[cfg.etapa] != null) continue
      if (!cfg.etapaOrigem || cfg.taxa == null) continue
      const valorOrigem = valores[cfg.etapaOrigem]
      if (valorOrigem == null) continue

      const origemAntes = INDICE_ETAPA[cfg.etapaOrigem] < INDICE_ETAPA[cfg.etapa]
      valores[cfg.etapa] = origemAntes ? valorOrigem * cfg.taxa : valorOrigem / cfg.taxa
      mudou = true
    }
  }

  // Detecta origem desligada e origem nunca configurada, pros derivados que sobraram sem valor.
  for (const cfg of configs) {
    if (cfg.modo !== 'derivado' || emCiclo.has(cfg.etapa) || valores[cfg.etapa] != null) continue

    if (!cfg.etapaOrigem) {
      erros.push({
        tipo: 'sem_ancora',
        etapas: [cfg.etapa],
        mensagem: `${cfg.etapa} está marcada como derivada, mas nenhuma etapa de origem foi escolhida.`,
      })
    } else if (cfg.taxa == null) {
      erros.push({
        tipo: 'sem_ancora',
        etapas: [cfg.etapa, cfg.etapaOrigem],
        mensagem: `${cfg.etapa} deriva de ${cfg.etapaOrigem}, mas a taxa ainda não foi definida.`,
      })
    } else {
      const origemCfg = porEtapa.get(cfg.etapaOrigem)
      if (!origemCfg) {
        erros.push({
          tipo: 'origem_inexistente',
          etapas: [cfg.etapa, cfg.etapaOrigem],
          mensagem: `${cfg.etapa} deriva de ${cfg.etapaOrigem}, mas essa etapa não tem configuração nesta marca.`,
        })
      } else if (origemCfg.modo === 'desligado') {
        erros.push({
          tipo: 'origem_desligada',
          etapas: [cfg.etapa, cfg.etapaOrigem],
          mensagem: `${cfg.etapa} deriva de ${cfg.etapaOrigem}, que está desligada nesta marca.`,
        })
      } else {
        erros.push({
          tipo: 'sem_ancora',
          etapas: [cfg.etapa],
          mensagem: `${cfg.etapa} não alcança nenhuma âncora fixa pela cadeia de derivação configurada.`,
        })
      }
    }
  }

  const fechamento = valores['Fechamento']
  const faturamento = fechamento != null ? fechamento * ticketMedio : null

  return { valores, faturamento, erros }
}

export interface GapAncoras {
  etapaTopo: EtapaMeta
  etapaFundo: EtapaMeta
  taxaImplicita: number
  taxaConfigurada: number | null
  diverge: boolean
}

const TOLERANCIA_GAP = 0.003 // diferença ABSOLUTA entre taxas (0-1), não relativa

/**
 * Para cada par de âncoras fixas (em ordem de funil), calcula a taxa
 * implícita entre elas. Quando `topo` é a origem configurada de uma cadeia
 * de etapas derivadas (uma deriva da outra em sequência), calcula também o
 * produto dessas taxas e compara — diverge quando a diferença ABSOLUTA passa
 * da tolerância. Sem nenhuma etapa derivando de `topo`, mostra só a
 * implícita (informativo, nada pra discordar).
 *
 * A cadeia caminha PRA FRENTE a partir de `topo` (quem deriva de `topo`,
 * depois quem deriva dessa, etc.) — nunca de trás pra frente a partir de
 * `fundo`. `fundo` é sempre uma âncora `fixo` (é assim que `ancoras` é
 * filtrado, logo abaixo) e uma etapa `fixo` nunca tem `modo: 'derivado'`,
 * então tentar caminhar A PARTIR de `fundo` esperando achar `modo:'derivado'`
 * nela mesma nunca funcionaria — sempre devolveria cadeia incompleta.
 */
export function detectarGaps(configs: ConfigEtapa[], resolucao: ResolucaoFunil): GapAncoras[] {
  const consumidorPorOrigem = new Map<EtapaMeta, ConfigEtapa>()
  for (const c of configs) {
    if (c.modo === 'derivado' && c.etapaOrigem) consumidorPorOrigem.set(c.etapaOrigem, c)
  }

  const ancoras = configs
    .filter(c => c.modo === 'fixo' && resolucao.valores[c.etapa] != null)
    .map(c => c.etapa)
    .sort((a, b) => INDICE_ETAPA[a] - INDICE_ETAPA[b])

  const gaps: GapAncoras[] = []

  for (let i = 0; i < ancoras.length - 1; i++) {
    const topo = ancoras[i]
    const fundo = ancoras[i + 1]
    const valorTopo = resolucao.valores[topo]!
    const valorFundo = resolucao.valores[fundo]!
    if (valorTopo === 0) continue
    const taxaImplicita = valorFundo / valorTopo

    let atual: EtapaMeta = topo
    let produtoTaxas = 1
    let achouAlgumaEtapa = false
    const visitados = new Set<EtapaMeta>([topo])

    while (consumidorPorOrigem.has(atual)) {
      const cfg = consumidorPorOrigem.get(atual)!
      if (cfg.taxa == null) break
      produtoTaxas *= cfg.taxa
      achouAlgumaEtapa = true
      atual = cfg.etapa
      if (visitados.has(atual)) break
      visitados.add(atual)
    }

    const taxaConfigurada = achouAlgumaEtapa ? produtoTaxas : null
    const diverge = taxaConfigurada != null && Math.abs(taxaConfigurada - taxaImplicita) > TOLERANCIA_GAP

    gaps.push({ etapaTopo: topo, etapaFundo: fundo, taxaImplicita, taxaConfigurada, diverge })
  }

  return gaps
}

export interface PessoaComPeso {
  nome: string
  peso: number
}

/**
 * Divide `metaTotal` entre `pessoas` proporcional ao peso de cada uma.
 * Normaliza pelos pesos informados (não exige que somem 100) — sem limite de
 * quantas pessoas (D3). A soma dos valores devolvidos sempre bate com
 * `metaTotal` (a menos de arredondamento de ponto flutuante).
 */
export function ratearPorPeso(metaTotal: number, pessoas: PessoaComPeso[]): Record<string, number> {
  const somaPesos = pessoas.reduce((s, p) => s + p.peso, 0)
  if (somaPesos <= 0) return {}
  const resultado: Record<string, number> = {}
  for (const p of pessoas) {
    resultado[p.nome] = metaTotal * (p.peso / somaPesos)
  }
  return resultado
}

export interface LinhaEspelho {
  mes_referencia: string
  marca: string
  nome_colaborador: string
  funcao: 'SDR' | 'Closer'
  meta_sql: number | null
  meta_agendamento: number | null
  meta_reuniao_realizada: number | null
  meta_cof: number | null
  meta_financeira: number | null
  meta_qtd_vendas: number | null
}

export interface PessoaComFuncao extends PessoaComPeso {
  funcao: 'SDR' | 'Closer'
}

/**
 * Gera as linhas no formato de `DB_Metas_Performance` (o espelho, §5.2 do
 * spec) a partir da resolução de cada marca e de quem está alocado nela. Cada
 * pessoa recebe sua fatia rateada por peso — nunca o total da marca inteira.
 */
export function gerarLinhasEspelho(
  mesReferencia: string,
  marcas: Array<{ marca: string; resolucao: ResolucaoFunil; pessoas: PessoaComFuncao[] }>,
): LinhaEspelho[] {
  const linhas: LinhaEspelho[] = []

  for (const { marca, resolucao, pessoas } of marcas) {
    const sdrs = pessoas.filter(p => p.funcao === 'SDR')
    const closers = pessoas.filter(p => p.funcao === 'Closer')

    const sql = resolucao.valores['Reunião Agendada SQL']
    const reuniao = resolucao.valores['Reunião Realizada']
    const cof = resolucao.valores['Oportunidade COF']
    const fechamento = resolucao.valores['Fechamento']
    const faturamento = resolucao.faturamento

    const rateioSql = sql != null ? ratearPorPeso(sql, sdrs) : {}
    const rateioReuniao = reuniao != null ? ratearPorPeso(reuniao, sdrs) : {}
    const rateioCof = cof != null ? ratearPorPeso(cof, closers) : {}
    const rateioFaturamento = faturamento != null ? ratearPorPeso(faturamento, closers) : {}
    const rateioQtd = fechamento != null ? ratearPorPeso(fechamento, closers) : {}

    for (const sdr of sdrs) {
      linhas.push({
        mes_referencia: mesReferencia,
        marca,
        nome_colaborador: sdr.nome,
        funcao: 'SDR',
        meta_sql: rateioSql[sdr.nome] ?? null,
        meta_agendamento: rateioSql[sdr.nome] ?? null,
        meta_reuniao_realizada: rateioReuniao[sdr.nome] ?? null,
        meta_cof: null,
        meta_financeira: null,
        meta_qtd_vendas: null,
      })
    }

    for (const closer of closers) {
      linhas.push({
        mes_referencia: mesReferencia,
        marca,
        nome_colaborador: closer.nome,
        funcao: 'Closer',
        meta_sql: null,
        meta_agendamento: null,
        meta_reuniao_realizada: null,
        meta_cof: rateioCof[closer.nome] ?? null,
        meta_financeira: rateioFaturamento[closer.nome] ?? null,
        meta_qtd_vendas: rateioQtd[closer.nome] ?? null,
      })
    }
  }

  return linhas
}
