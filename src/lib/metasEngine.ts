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
