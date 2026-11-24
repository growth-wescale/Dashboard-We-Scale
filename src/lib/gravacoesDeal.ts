/**
 * Gravações do MeetRox de cada negócio — coluna "Gravações" dos pop-ups de
 * deal (todos das abas de Vendas, menos a Análise de Perda).
 *
 * Vem de `vw_deal_gravacoes` (docs/sql/2026-11-24-deal-gravacoes.sql): só
 * reunião de venda (o mesmo conjunto do bloco "Reuniões no MeetRox"), ligada
 * ao negócio pelo vínculo do próprio MeetRox ou pelo e-mail nos convidados.
 */

export interface GravacaoDeal {
  id_deal: string
  call_id: number
  /** R1–R5 do MeetRox; nulo = gravação sem tipo. */
  tipo: string | null
  /** A gravação é uma sessão de LIVE (`vw_reuniao_live`). */
  eh_live: boolean
  call_timestamp: string | null
  closer: string | null
  titulo: string | null
  url: string
}

export const COL_GRAVACOES = 'Gravações'

/** Por negócio, da mais antiga para a mais nova (mesma hora: menor call_id antes). */
export function agruparGravacoesPorDeal(rows: GravacaoDeal[]): Map<string, GravacaoDeal[]> {
  const m = new Map<string, GravacaoDeal[]>()
  for (const r of rows) {
    const lista = m.get(r.id_deal)
    if (lista) lista.push(r)
    else m.set(r.id_deal, [r])
  }
  for (const lista of m.values()) {
    lista.sort((a, b) => (a.call_timestamp ?? '').localeCompare(b.call_timestamp ?? '') || a.call_id - b.call_id)
  }
  return m
}

/** Texto do botão: LIVE vence o tipo (a LIVE costuma vir sem tipo, ou como R1). */
export function rotuloGravacao(g: Pick<GravacaoDeal, 'tipo' | 'eh_live'>): string {
  if (g.eh_live) return 'LIVE'
  return g.tipo ?? 'Gravação'
}

function dataHoraBrasilia(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '')
}

/** Dica ao passar o mouse: "R1 · 16/11/2026 11:00 · Douglas · R1| Eletrovias…". */
export function dicaGravacao(g: GravacaoDeal): string {
  return [rotuloGravacao(g), dataHoraBrasilia(g.call_timestamp), g.closer?.trim(), g.titulo?.trim()]
    .filter(Boolean)
    .join(' · ')
}
