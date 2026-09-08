// Classificação Processo × Mercado dos motivos de perda (P5).
// Regra: "perda evitável" = motivos_processo / total_com_motivo.
// PROCESSO = endereçável pelo time (falha operacional/execução).
// MERCADO  = não endereçável (perfil, momento, decisão do lead).

export type CategoriaMotivo = 'processo' | 'mercado' | 'ignorar'

// Entradas já normalizadas (sem acento, minúsculas, sem espaço ao redor de "/")
// — normalize() abaixo aplica a mesma transformação no motivo recebido antes
// do lookup, então aqui não precisa mais duplicar variante de grafia.
const PROCESSO = new Set<string>([
  'atingiu o fim da cadencia',
  'parou de responder',
  'sem contato apos cadencia sdr',
  'sem contato apos cadencia',
  'no-show sem retorno apos reagendamento',
  'sem resposta',
  'dados invalidos',
])

const MERCADO = new Set<string>([
  'sem perfil (fora do icp)',
  'sem interesse/nao quis conversa',
  'momento atual ate 6 meses',
  'nossa solucao nao atende',
  'optou por outro investimento',
  'escolheu concorrente',
  'sem budget/momento',
  'desqualificado (lixo)',
  'desqualificado',
])

const IGNORAR = new Set<string>([
  'duplicado/teste',
  'teste',
])

/**
 * Normaliza pra comparação: remove prefixo "[NOVO]", remove acento (NFD +
 * strip de diacríticos), colapsa espaço ao redor de "/" e espaços repetidos,
 * e passa pra minúsculo. Sem isso, cada variação de digitação do RD (motivo
 * é campo livre) vira uma entrada nova nos Sets acima — já aconteceu 3x com
 * "Sem interesse / não quis conversa" e 2x com o espaçamento de "Sem
 * budget/momento".
 */
function normalize(s: string): string {
  return s
    .replace(/^\[NOVO\]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function classificarMotivo(motivo: string | null | undefined): CategoriaMotivo | null {
  if (!motivo) return null
  const n = normalize(motivo)
  if (!n) return null
  if (PROCESSO.has(n)) return 'processo'
  if (MERCADO.has(n))  return 'mercado'
  if (IGNORAR.has(n))  return 'ignorar'
  return null // motivo não catalogado — cai fora do cálculo de perda evitável
}
