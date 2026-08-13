import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { TermosPanel } from '@/components/ui/TermosPanel'
import { isoDate } from '@/lib/dateUtils'

const MARCAS_DISPONIVEIS = [
  'Oral Unic', 'Inpot', 'Eletrovias', 'Lisô Laser', 'B2Case', 'Viva',
  'Odonto Scale', 'Scale Partners',
]

type PeriodPreset = '7d' | '30d' | 'mes' | 'mes-1'

function resolvePeriod(preset: PeriodPreset): { start: string; end: string; label: string } {
  const now = new Date()
  const today = isoDate(now)
  if (preset === '7d') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    return { start: isoDate(d), end: today, label: 'Últimos 7 dias' }
  }
  if (preset === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 29)
    return { start: isoDate(d), end: today, label: 'Últimos 30 dias' }
  }
  if (preset === 'mes') {
    const y = now.getFullYear(), m = now.getMonth()
    return { start: isoDate(new Date(y, m, 1)), end: today, label: 'Mês atual' }
  }
  const y = now.getFullYear(), m = now.getMonth()
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  return { start: isoDate(start), end: isoDate(end), label: 'Mês anterior' }
}

export function AnaliseTermos() {
  const [marca, setMarca] = useState<string>('')
  const [preset, setPreset] = useState<PeriodPreset>('30d')
  const period = useMemo(() => resolvePeriod(preset), [preset])

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--ws-text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Search size={20} /> Análise de Termos
          </h1>
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 6 }}>
            Google Ads — search terms (o que o usuário digitou) e keywords (o que você comprou) — {period.label}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={marca} onChange={e => setMarca(e.target.value)} style={selectStyle}>
            <option value="">Todas as marcas</option>
            {MARCAS_DISPONIVEIS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={preset} onChange={e => setPreset(e.target.value as PeriodPreset)} style={selectStyle}>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="mes">Mês atual</option>
            <option value="mes-1">Mês anterior</option>
          </select>
        </div>
      </div>

      <TermosPanel
        marca={marca || undefined}
        dataInicio={period.start}
        dataFim={period.end}
        hideHeader
      />
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--ws-border)',
  background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer',
}
