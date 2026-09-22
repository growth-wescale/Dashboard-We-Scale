import { MS_DIA, type MomentoBruto, type StatusTarefa, type TipoTarefa } from './tipos'

/** Linha de `db_tarefas_sdr` (só as colunas que o hook seleciona). */
export interface TarefaRow {
  task_id: string
  subject: string | null
  type: string | null
  notes: string | null
  done: boolean | null
  status_calc: string | null
  prazo: string | null
  done_date: string | null
  user_name: string | null
  deal_id: string | null
}

const TIPOS: ReadonlySet<string> = new Set(['call', 'whatsapp', 'email', 'task', 'lunch', 'meeting'])
const STATUS: ReadonlySet<string> = new Set(['concluida_no_prazo', 'concluida_atrasada', 'atrasada', 'em_aberto'])

const parse = (s: string | null): Date | null => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * `db_tarefas_sdr` → momentos. Instante = conclusão (se concluída) ou prazo.
 * Atraso em dias = conclusão − prazo (ou agora − prazo, se ainda aberta),
 * arredondado; null quando não está atrasada.
 */
export function momentosDeTarefas(rows: TarefaRow[], agora: Date): MomentoBruto[] {
  const out: MomentoBruto[] = []
  for (const r of rows) {
    const prazo = parse(r.prazo)
    const feita = parse(r.done_date)
    const instante = feita ?? prazo
    if (!instante) continue
    const status: StatusTarefa = STATUS.has(r.status_calc ?? '') ? (r.status_calc as StatusTarefa) : (r.done ? 'concluida_no_prazo' : 'em_aberto')
    const concluida = status === 'concluida_no_prazo' || status === 'concluida_atrasada' || r.done === true
    const atrasada = status === 'concluida_atrasada' || status === 'atrasada'
    const ref = feita ?? agora
    const atrasoDias = atrasada && prazo ? Math.max(0, Math.round((ref.getTime() - prazo.getTime()) / MS_DIA)) : null
    const tipoTarefa: TipoTarefa = TIPOS.has(r.type ?? '') ? (r.type as TipoTarefa) : 'outro'
    out.push({
      id: `tarefa:${r.task_id}`,
      idDeal: r.deal_id ?? '',
      instante,
      tipo: 'tarefa',
      ator: r.user_name ?? null,
      titulo: r.subject?.trim() || 'Tarefa',
      meta: {
        kind: 'tarefa', tipoTarefa, status, concluida, atrasada,
        prazo: r.prazo, feitaEm: r.done_date, atrasoDias,
        assunto: r.subject?.trim() || 'Tarefa', notas: r.notes?.trim() || null,
      },
    })
  }
  return out
}
