export function GpSetembro() {
  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      <iframe
        src="/gp-setembro.html"
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="GP Setembro"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  )
}
