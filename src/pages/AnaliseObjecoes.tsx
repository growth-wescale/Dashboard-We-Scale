export function AnaliseObjecoes() {
  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      <iframe
        src="https://n8n.wescale.com.br/webhook/wescale-objecoes"
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Análise de Objeções"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  )
}
