/**
 * Painéis do Metabase (TI, banco oralunic_dw) listados na aba Vendas › Relatórios.
 *
 * Lista mantida à mão: o navegador não tem chave do Metabase, então não dá pra
 * buscar a lista sozinho. Painel novo = 1 item aqui. `id` e `abas[].id` são os
 * números da URL do Metabase (/dashboard/<id>?tab=<id da aba>), conferidos em
 * GET /api/dashboard/<id> em 11/11/2026.
 *
 * Abrir o link exige login no Metabase. Nada aqui é dado de negócio.
 */

export const METABASE_URL = 'https://metabase.wescale.com.br'

export interface AbaRelatorio {
  id: number
  nome: string
}

export interface RelatorioMetabase {
  id: number
  nome: string
  descricao: string
  /** Filtros que o painel oferece no Metabase. */
  filtros: string[]
  /** Abas na ordem do painel. Vazio = painel de uma página só. */
  abas: AbaRelatorio[]
  /** Data da última alteração do painel no Metabase (AAAA-MM-DD). */
  atualizadoEm: string
  /** Aviso curto que aparece no cartão (ex.: dado parcial). */
  aviso?: string
}

export const RELATORIOS_METABASE: readonly RelatorioMetabase[] = [
  {
    id: 8,
    nome: 'Marketing, Pré-vendas e Vendas',
    descricao: 'Painel principal do funil, de ponta a ponta: resultados, conversões, atendimento, pré-vendas, vendas, perdas, tarefas dos SDRs e ciclo de vida do Inbound (cadência e bot).',
    filtros: ['Período', 'Marca', 'Agrupar por', 'Responsável da tarefa', 'Tipo de tarefa', 'Cadência'],
    abas: [
      { id: 44, nome: 'Resumo' },
      { id: 45, nome: 'Marketing' },
      { id: 46, nome: 'Atendimento' },
      { id: 48, nome: 'Pré-vendas' },
      { id: 49, nome: 'Vendas' },
      { id: 50, nome: 'Perdas e detalhe' },
      { id: 51, nome: 'Tarefas' },
      { id: 53, nome: 'Ciclo Inbound' },
    ],
    atualizadoEm: '2026-11-04',
  },
  {
    id: 7,
    nome: 'Marketing e Vendas (V2)',
    descricao: 'Versão anterior do painel, mais ampla: mídia, termos, captação, funil, jornada, custos, equipe, e-mails, WhatsApp e redes sociais.',
    filtros: ['Período', 'Marca ou perfil', 'Agrupar por'],
    abas: [
      { id: 28, nome: 'Resumo' },
      { id: 29, nome: 'Mídia' },
      { id: 39, nome: 'Termos' },
      { id: 30, nome: 'Captação' },
      { id: 31, nome: 'Funil' },
      { id: 32, nome: 'Jornada' },
      { id: 40, nome: 'Conversões' },
      { id: 41, nome: 'Custos' },
      { id: 33, nome: 'Vendas' },
      { id: 34, nome: 'Equipe' },
      { id: 35, nome: 'Perdas' },
      { id: 36, nome: 'E-mails' },
      { id: 37, nome: 'WhatsApp' },
      { id: 38, nome: 'Facebook' },
      { id: 42, nome: 'Instagram' },
    ],
    atualizadoEm: '2026-10-02',
  },
  {
    id: 5,
    nome: 'Cockpit antes e depois',
    descricao: 'Compara as etapas do CRM por marca e origem antes e depois de julho, em janelas do mesmo tamanho. Conversões com 30 dias de observação e vendas por mês completo.',
    filtros: ['Data', 'Marca', 'Origem CRM', 'Programa de e-mail', 'Tipo de e-mail'],
    abas: [
      { id: 25, nome: 'Comparativo mensal' },
      { id: 27, nome: 'Detalhes mensais' },
      { id: 26, nome: 'E-mail e Resgate' },
      { id: 24, nome: 'Funil comercial' },
    ],
    atualizadoEm: '2026-09-24',
  },
  {
    id: 6,
    nome: 'WhatsApp: consumo e custo por marca',
    descricao: 'Mensagens enviadas e custo estimado do WhatsApp por marca e por modelo de mensagem.',
    filtros: ['Período', 'Marca'],
    abas: [],
    atualizadoEm: '2026-09-30',
    aviso: 'Custo estimado, não é a fatura do RD.',
  },
]

/** Coleção com as bases prontas pra quem quiser montar a própria pergunta no Metabase. */
export const METABASE_BASES_COLECAO = 34

function slug(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Link do painel; com `aba`, abre direto nela (formato do Metabase: ?tab=<id>-<slug>). */
export function urlRelatorio(id: number, aba?: AbaRelatorio): string {
  const base = `${METABASE_URL}/dashboard/${id}`
  return aba ? `${base}?tab=${aba.id}-${slug(aba.nome)}` : base
}

export function urlColecao(id: number): string {
  return `${METABASE_URL}/collection/${id}`
}
