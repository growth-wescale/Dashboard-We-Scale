import type { MomentoBruto, RespostaScorecard, SecaoResumo } from './tipos'

/** Linha de `DB_Reunioes_MeetRox` — SEM transcription/api_payload/associations_raw. */
export interface ReuniaoRow {
  id: number
  title: string | null
  url: string | null
  call_timestamp: string | null
  call_type_name: string | null
  user_name: string | null
  duration_minutes: number | null
  ai_score: number | null
  scorecard_name: string | null
  summary: Record<string, unknown> | null
  scorecard_answers: Array<Record<string, unknown>> | null
  attendees: string[] | null
  id_deal: string | null
  crm_deal_id: string | null
  has_summary: boolean | null
  has_scorecard: boolean | null
}

function secoes(summary: Record<string, unknown> | null): SecaoResumo[] {
  if (!summary || typeof summary !== 'object') return []
  const out: SecaoResumo[] = []
  for (const [titulo, v] of Object.entries(summary)) {
    const itens = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : typeof v === 'string' && v.trim() ? [v] : []
    if (itens.length) out.push({ titulo, itens })
  }
  return out
}

function respostas(raw: Array<Record<string, unknown>> | null): RespostaScorecard[] {
  if (!Array.isArray(raw)) return []
  return raw.map(a => ({
    categoria: typeof a.category_name === 'string' ? a.category_name : '',
    pergunta: typeof a.question_text === 'string' ? a.question_text : '',
    resposta: typeof a.answer === 'string' ? a.answer : '',
  })).filter(a => a.pergunta)
}

/** `DB_Reunioes_MeetRox` → momentos. Liga ao deal por `id_deal ?? crm_deal_id`. */
export function momentosDeReunioes(rows: ReuniaoRow[]): MomentoBruto[] {
  const out: MomentoBruto[] = []
  for (const r of rows) {
    const idDeal = r.id_deal ?? r.crm_deal_id
    if (!idDeal || !r.call_timestamp) continue
    const instante = new Date(r.call_timestamp)
    if (Number.isNaN(instante.getTime())) continue
    out.push({
      id: `reuniao:${r.id}`,
      idDeal,
      instante,
      tipo: 'reuniao',
      ator: r.user_name ?? null,
      titulo: r.title?.trim() || 'Reunião',
      detalhe: r.call_type_name ?? undefined,
      meta: {
        kind: 'reuniao',
        duracaoMin: r.duration_minutes == null ? null : Math.round(r.duration_minutes),
        notaIA: r.ai_score == null ? null : Math.round(r.ai_score * 100) / 10,
        scorecard: r.scorecard_name ?? null,
        tipoReuniao: r.call_type_name ?? null,
        resumo: secoes(r.summary),
        respostas: respostas(r.scorecard_answers),
        url: r.url ?? null,
        participantes: Array.isArray(r.attendees) ? r.attendees.filter((x): x is string => typeof x === 'string') : [],
        resumoDisponivel: r.has_summary === true,
        scorecardDisponivel: r.has_scorecard === true,
      },
    })
  }
  return out
}
