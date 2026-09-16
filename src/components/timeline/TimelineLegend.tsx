import { CORES } from '@/lib/timeline/layout'
import type { NivelZoom } from '@/lib/timeline/zoom'

const Item = ({ cor, label, contorno }: { cor: string; label: string; contorno?: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>
    <span style={{ width: 10, height: 10, borderRadius: 999, background: cor, border: contorno ? `2px solid ${contorno}` : undefined, display: 'inline-block' }} />{label}
  </span>
)

/** Só os símbolos que existem no nível atual. */
export function TimelineLegend({ nivel }: { nivel: NivelZoom }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
      <Item cor={CORES.MQL} label="MQL" /><Item cor={CORES.SDR} label="SDR" /><Item cor={CORES.Closer} label="Closer" />
      <Item cor={CORES.ganho} label="Ganho" /><Item cor={CORES.perda} label="Perdido" />
      {nivel !== 'macro' && <><Item cor={CORES.noShow} label="No-show" /><Item cor={CORES.desconhecida} label="Etapa fora do catálogo" /><Item cor={CORES.reaberto} label="Reaberto (reciclagem)" /></>}
      {nivel === 'micro' && <><Item cor={CORES.SDR} label="Toque (ligação · WhatsApp · e-mail)" /><Item cor={CORES.SDR} contorno={CORES.noShow} label="Toque atrasado" /><Item cor="#fff" contorno={CORES.SDR} label="Tarefa em aberto" /></>}
    </div>
  )
}
