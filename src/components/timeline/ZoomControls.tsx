import { Minus, Plus, Maximize2 } from 'lucide-react'
import type { NivelZoom } from '@/lib/timeline/zoom'

const NOME: Record<NivelZoom, string> = { macro: 'Macro', etapas: 'Etapas', micro: 'Micro' }
const btn = { width: 28, height: 28, border: '1px solid var(--ws-border)', borderRadius: 8, background: 'var(--ws-surface)', color: 'var(--ws-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as const

export function ZoomControls({ nivel, onMais, onMenos, onAjustar }: { nivel: NivelZoom; onMais: () => void; onMenos: () => void; onAjustar: () => void }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ws-vinho-b)', background: '#F7E9F5', borderRadius: 999, padding: '4px 10px' }}>{NOME[nivel]}</span>
      <button type="button" title="Afastar (−)" onClick={onMenos} style={btn}><Minus size={14} /></button>
      <button type="button" title="Aproximar (+)" onClick={onMais} style={btn}><Plus size={14} /></button>
      <button type="button" title="Ajustar ao deal (0)" onClick={onAjustar} style={btn}><Maximize2 size={14} /></button>
      <span style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginLeft: 6 }}>Ctrl + scroll pra zoom · arraste pra mover</span>
    </div>
  )
}
