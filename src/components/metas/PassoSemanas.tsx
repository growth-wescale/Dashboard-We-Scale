import { gerarSemanas, type DiaSemana, type Semana } from '@/lib/metasEngine'

const DIAS: DiaSemana[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']
const DIA_LABEL: Record<DiaSemana, string> = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo',
}

export function PassoSemanas({
  mesReferencia, diaViradaSemana, onMudar,
}: {
  mesReferencia: string
  diaViradaSemana: DiaSemana
  onMudar: (diaViradaSemana: DiaSemana, semanas: Semana[]) => void
}) {
  const semanas = gerarSemanas(mesReferencia, diaViradaSemana)

  return (
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 24 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Semana começa em</span>
        <select value={diaViradaSemana} onChange={e => onMudar(e.target.value as DiaSemana, gerarSemanas(mesReferencia, e.target.value as DiaSemana))}
          style={{ padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 6 }}>
          {DIAS.map(d => <option key={d} value={d}>{DIA_LABEL[d]}</option>)}
        </select>
      </label>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {semanas.map(s => (
          <div key={s.numero} style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'var(--ws-bg)', borderRadius: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>S{s.numero}</span>
            <span>{s.inicio} → {s.fim}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
