// Classificação Processo × Mercado dos motivos de perda (P5).
// Catálogo unificado em 22/09/2026: o RD passou de 463 motivos (79 nomes) para 36.
// Os nomes antigos seguem listados como rede de segurança até o espelho sincronizar.
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
  'nunca respondeu',
  'no-show sem retorno',
  'dados invalidos',
  'sem contato com a persona principal',
  'desistencia apos agendamento',
  'erro na lista de prospeccao',
  'nao e mql (erro)',
  'marca sem prova/numeros',
  'sem contato apos cadencia sdr',
  'sem contato apos cadencia',
  'no-show sem retorno apos reagendamento',
  'sem resposta',
  'reagendamento nao realizado',
  '[nj] lead atingiu o fim da cadencia',
])

const MERCADO = new Set<string>([
  'sem perfil (fora do icp)',
  'sem interesse/nao quis conversar',
  'nossa solucao nao atende',
  'fornecedor',
  'buscando servico (b2c)',
  'benchmark/apenas pesquisando',
  'praca indisponivel',
  'praca sem potencial',
  'sem budget - ate 50k',
  'sem budget - ate 100k',
  'sem budget - ate 200k',
  'sem budget - ate 300k',
  'capital descapitalizado',
  'perfil de operador, sem capital',
  'falta de socio',
  'timing - ate 6 meses',
  'timing - 6 a 12 meses',
  'timing - sem previsao',
  'optou por negocio proprio',
  'optou por outro investimento',
  'escolheu outra franqueadora',
  'nao aceitou condicoes comerciais',
  'nao abordar novamente (lgpd)',
  'momento atual ate 6 meses',
  'sem timing',
  'desqualificado (lixo)',
  'sem budget/momento',
  'escolheu concorrente',
])

const IGNORAR = new Set<string>([
  'duplicado',
  'teste/registro interno',
  'registro legado (migracao)',
  'teste',
  'teste/duplicado',
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
