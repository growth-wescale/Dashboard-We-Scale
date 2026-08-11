// Classificação Processo × Mercado dos motivos de perda (P5).
// Regra: "perda evitável" = motivos_processo / total_com_motivo.
// PROCESSO = endereçável pelo time (falha operacional/execução).
// MERCADO  = não endereçável (perfil, momento, decisão do lead).

export type CategoriaMotivo = 'processo' | 'mercado' | 'ignorar'

const PROCESSO = new Set<string>([
  'Atingiu o fim da cadência',
  'Parou de responder',
  'Sem contato após cadência SDR',
  'Sem contato após cadência',
  'Sem contato apos cadencia',
  'Sem contato apos cadencia SDR',
  'No-Show sem retorno apos reagendamento',
  'No-Show sem retorno após reagendamento',
  'Sem resposta',
  'Dados inválidos',
  'Dados invalidos',
])

const MERCADO = new Set<string>([
  'Sem perfil (fora do ICP)',
  'Sem interesse / não quis conversa',
  'Sem interesse / Não quis Conversa',
  'Sem interesse / Não quis conversa',
  'Momento atual até 6 meses',
  'Nossa solução não atende',
  'Nossa solucao nao atende',
  'Optou por outro investimento',
  'Escolheu concorrente',
  'Sem budget / momento',
  'Sem budget/momento',
  'Desqualificado (lixo)',
  'Desqualificado',
])

const IGNORAR = new Set<string>([
  'Duplicado / teste',
  'Duplicado/teste',
  'Teste',
])

function normalize(s: string): string {
  return s.replace(/^\[NOVO\]\s*/i, '').trim()
}

export function classificarMotivo(motivo: string | null | undefined): CategoriaMotivo | null {
  if (!motivo) return null
  const n = normalize(motivo)
  if (PROCESSO.has(n)) return 'processo'
  if (MERCADO.has(n))  return 'mercado'
  if (IGNORAR.has(n))  return 'ignorar'
  return null // motivo não catalogado — cai fora do cálculo de perda evitável
}
