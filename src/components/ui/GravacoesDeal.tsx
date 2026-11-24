import { Video } from 'lucide-react'
import { dicaGravacao, rotuloGravacao, type GravacaoDeal } from '@/lib/gravacoesDeal'

/**
 * Botões das gravações do MeetRox de um negócio ("R1", "LIVE", "R2"…), da
 * mais antiga para a mais nova; cada um abre a gravação numa aba nova.
 * "—" = sem gravação; "…" = ainda carregando.
 */
export function GravacoesBotoes({ gravacoes, pronto, accent }: {
  gravacoes: GravacaoDeal[] | undefined
  pronto: boolean
  accent: string
}) {
  if (!pronto) return <span style={{ color: 'var(--ws-text-secondary)' }}>…</span>
  if (!gravacoes?.length) return <span style={{ color: 'var(--ws-text-secondary)' }}>—</span>
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'nowrap' }}>
      {gravacoes.map(g => (
        <a key={g.call_id} href={g.url} target="_blank" rel="noreferrer" title={dicaGravacao(g)}
          aria-label={`Abrir gravação no MeetRox: ${dicaGravacao(g)}`}
          onClick={e => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999,
            border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`, color: accent,
            fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', lineHeight: 1.4,
          }}>
          <Video size={11} />
          {rotuloGravacao(g)}
        </a>
      ))}
    </span>
  )
}

/** Célula da coluna "Gravações" nas tabelas dos pop-ups de deal. */
export function CelulaGravacoes(props: {
  gravacoes: GravacaoDeal[] | undefined
  pronto: boolean
  accent: string
}) {
  return (
    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
      <GravacoesBotoes {...props} />
    </td>
  )
}
