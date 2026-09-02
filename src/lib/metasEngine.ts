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
    if (!cfg.etapaOrigem) continue

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

  const fechamento = valores['Fechamento']
  const faturamento = fechamento != null ? fechamento * ticketMedio : null

  return { valores, faturamento, erros }
}
