/** Controle local: tema oculto por padrão, sem aviso ou preferência global. */
export function OctagonOverviewVisibility({ hidden, onChange }: { hidden: boolean; onChange: (hidden: boolean) => void }) {
  if (!hidden) return null
  return <div style={{ padding: '12px 24px' }}><button type="button" onClick={() => onChange(false)}>Mostrar tema</button></div>
}
