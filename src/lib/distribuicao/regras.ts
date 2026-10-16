// Lógica pura da aba Distribuição de Leads: tipos iguais às views do Supabase de Expansão
// (vw_distribuicao_*) e as funções de texto/cálculo que a tela usa. Sem rede, sem React.

export type ModoRegra = 'desligado' | 'sombra' | 'ativo'
export type FonteTime = 'versao_ativa' | 'versao_anterior' | 'time_proprio' | 'nenhum'
export type ResultadoAtribuicao = 'atribuido' | 'barrado' | 'duplicado' | 'simulado' | 'fallback' | 'erro'

export interface PessoaPeso { nome: string; peso: number }

/** Linha de vw_distribuicao_regras. */
export interface RegraRow {
  id: number
  marca: string
  marca_rd: string
  versao: number
  vigente_de: string
  vigente_ate: string | null
  modo: ModoRegra
  evento_identificador: string
  id_funil: string
  id_etapa: string
  campaign_id: string | null
  barreira_campo: string | null
  barreira_valores_barrados: string[]
  responsavel_padrao_user_id: string
  nome_formato: string | null
  campos_extra: Record<string, string>
  time_proprio: PessoaPeso[] | null
  criado_por: string | null
  criado_em: string
  motivo: string | null
}

/** Linha de vw_distribuicao_atribuicoes (sem payload). */
export interface AtribuicaoRow {
  id: number
  recebido_em: string
  marca: string
  evento_identificador: string
  regra_id: number
  lead_email: string | null
  lead_uuid: string | null
  lead_nome: string | null
  resultado: ResultadoAtribuicao
  motivo: string | null
  barreira_valor_lido: string | null
  fonte_time: FonteTime | null
  meta_versao_id: number | null
  reinicio_em: string | null
  nome_sdr: string | null
  user_id: string | null
  /** { nome: [recebidos, peso] } no momento da escolha */
  contadores: Record<string, [number, number]> | null
  inelegiveis: Array<{ nome: string; peso: number; motivo: string }> | null
  id_deal: string | null
  tentativas: number
  erro_rd: string | null
  reprocessado_em: string | null
  reprocessado_por: string | null
}

/** Linha de vw_distribuicao_disponibilidade. */
export interface DisponibilidadeRow {
  id: number
  nome_sdr: string
  tipo: 'fora_agora' | 'ausencia'
  inicio: string
  fim: string | null
  motivo: string | null
  criado_por: string | null
  criado_em: string
  encerrado_em: string | null
  cobre_agora: boolean
}

/** Linha de vw_distribuicao_painel: 1 por SDR elegível (ou inelegível) da regra vigente da marca. */
export interface PainelMarca {
  marca: string
  marca_rd: string
  modo: ModoRegra
  fonte_time: FonteTime
  meta_versao_id: number | null
  reinicio_em: string
  nome_sdr: string | null
  user_id: string | null
  peso: number | null
  recebidos: number
  inelegivel_motivo: string | null
}

export function textoBarreira(campo: string | null, valores: string[]): string {
  if (!campo || !valores || valores.length === 0) return 'sem barreira'
  return `barra quando ${campo} é ${valores.join(' ou ')}`
}

function textoTime(t: PessoaPeso[] | null): string {
  if (!t || t.length === 0) return '(nenhum)'
  return t.map(p => `${p.nome} ${p.peso}%`).join(', ')
}

function textoCampos(c: Record<string, string> | null | undefined): string {
  const e = Object.entries(c ?? {})
  if (e.length === 0) return '(nenhum)'
  return e.map(([k, v]) => `${k} → ${v}`).join(', ')
}

/** Uma frase por campo que mudou entre duas versões (versão, datas e autor não contam). */
export function diffRegra(antes: RegraRow, depois: RegraRow): string[] {
  const out: string[] = []
  const cmp = (rotulo: string, a: string, b: string) => { if (a !== b) out.push(`${rotulo}: ${a} → ${b}`) }
  cmp('modo', antes.modo, depois.modo)
  cmp('evento', antes.evento_identificador, depois.evento_identificador)
  cmp('destino', `${antes.id_funil}/${antes.id_etapa}`, `${depois.id_funil}/${depois.id_etapa}`)
  cmp('campanha', antes.campaign_id ?? '(nenhuma)', depois.campaign_id ?? '(nenhuma)')
  cmp('barreira', textoBarreira(antes.barreira_campo, antes.barreira_valores_barrados), textoBarreira(depois.barreira_campo, depois.barreira_valores_barrados))
  cmp('responsável padrão', antes.responsavel_padrao_user_id, depois.responsavel_padrao_user_id)
  cmp('nome do deal', antes.nome_formato ?? '(nome do lead)', depois.nome_formato ?? '(nome do lead)')
  cmp('campos extra', textoCampos(antes.campos_extra), textoCampos(depois.campos_extra))
  cmp('time próprio', textoTime(antes.time_proprio), textoTime(depois.time_proprio))
  cmp('marca no RD', antes.marca_rd, depois.marca_rd)
  return out
}

export interface Desvio { nome: string; peso: number; recebidos: number; pctRecebido: number; desvio: number }

const r2 = (x: number) => Math.round(x * 100) / 100

/** Para cada SDR: recebidos desde o reinício, % do total e desvio em leads (recebidos − cota). Mais abaixo da cota primeiro. */
export function desvios(sdrs: PessoaPeso[], contadores: Record<string, number>): Desvio[] {
  const total = sdrs.reduce((s, p) => s + (contadores[p.nome] ?? 0), 0)
  return sdrs
    .map(p => {
      const recebidos = contadores[p.nome] ?? 0
      return {
        nome: p.nome, peso: p.peso, recebidos,
        pctRecebido: total > 0 ? r2((recebidos * 100) / total) : 0,
        desvio: r2(recebidos - (p.peso * total) / 100),
      }
    })
    .sort((a, b) => a.desvio - b.desvio || b.peso - a.peso || a.nome.localeCompare(b.nome))
}

export function rotuloFonteTime(fonte: FonteTime | string | null | undefined): string {
  switch (fonte) {
    case 'versao_ativa': return 'meta do mês'
    case 'versao_anterior': return 'última meta publicada (sem meta neste mês)'
    case 'time_proprio': return 'time próprio (marca sem meta)'
    default: return 'sem SDR elegível'
  }
}

export const ROTULO_RESULTADO: Record<ResultadoAtribuicao, string> = {
  atribuido: 'Atribuído', barrado: 'Barrado', duplicado: 'Duplicado', simulado: 'Simulado',
  fallback: 'Responsável padrão', erro: 'Erro',
}

export const ROTULO_MODO: Record<ModoRegra, string> = { desligado: 'Desligado', sombra: 'Sombra', ativo: 'Ativo' }
