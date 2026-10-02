// Classificação Processo × Mercado dos motivos de perda (P5).
// Lista fixa aprovada em 02/10/2026: 32 motivos, sem o prefixo [NOVO].
// (Antes: 463 registros / 79 nomes em 22/09, depois 36.)
// Os nomes antigos seguem listados como rede de segurança até o espelho sincronizar.
// Regra: "perda evitável" = motivos_processo / total_com_motivo.
// PROCESSO = endereçável pelo time (falha operacional/execução).
// MERCADO  = não endereçável (perfil, momento, decisão do lead).

export type CategoriaMotivo = 'processo' | 'mercado' | 'ignorar'

// Entradas já normalizadas (sem acento, minúsculas, sem espaço ao redor de "/")
// — normalize() abaixo aplica a mesma transformação no motivo recebido antes
// do lookup, então aqui não precisa mais duplicar variante de grafia.
const PROCESSO = new Set<string>([
  'fim da cadencia sem resposta',
  'parou de responder',
  'no-show sem retorno',
  'dados invalidos',
  'nao chegou ao decisor',
  'desmarcou antes da reuniao',
  'erro na lista de prospeccao',
  'nao era mql',
  'marca sem resultados comprovados',
  'atingiu o fim da cadencia',
  'nunca respondeu',
  'sem contato apos cadencia sdr',
  'no-show sem retorno apos reagendamento',
  'sem resposta',
  '[nj] lead atingiu o fim da cadencia',
  'sem contato com a persona principal',
  'desistencia apos agendamento',
  'nao e mql (erro)',
])

const MERCADO = new Set<string>([
  'fora do perfil (icp)',
  'sem interesse',
  'buscava outro modelo de negocio',
  'fornecedor ou prestador',
  'apenas pesquisando (benchmark)',
  'praca ja ocupada',
  'praca sem viabilidade',
  'sem budget - ate r$ 200 mil',
  'sem budget - r$ 200 a 500 mil',
  'sem liquidez no momento',
  'falta de socio',
  'timing - ate 6 meses',
  'timing - 6 a 12 meses',
  'timing - sem previsao',
  'optou por negocio proprio',
  'optou por outro investimento',
  'optou por outra franqueadora',
  'nao aceitou as condicoes comerciais',
  'pediu exclusao (lgpd)',
  'reprovado na analise da franqueadora',
  'sem perfil (fora do icp)',
  'sem interesse/nao quis conversar',
  'nossa solucao nao atende',
  'capital descapitalizado',
  'perfil de operador, sem capital',
  'momento atual ate 6 meses',
  'sem timing',
  'desqualificado (lixo)',
  'sem budget/momento',
  'escolheu concorrente',
  'praca indisponivel',
  'escolheu outra franqueadora',
  'nao aceitou condicoes comerciais',
  'benchmark/apenas pesquisando',
  'sem budget - ate 50k',
  'sem budget - ate 100k',
  'sem budget - ate 200k',
  'sem budget - ate 300k',
  'praca sem potencial',
  'fornecedor',
  'nao abordar novamente (lgpd)',
  'marca sem prova/numeros',
])

const IGNORAR = new Set<string>([
  'duplicado',
  'registro de teste',
  'base migrada de outro crm',
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
