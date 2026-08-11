import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

const IFRAME_URL = 'https://n8n.wescale.com.br/webhook/wescale-objecoes'
const TIMEOUT_MS = 15_000 // se n8n não responder em 15s, mostra erro

export function AnaliseObjecoes() {
  const [state, setState] = useState<'loading' | 'ok' | 'timeout'>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setState('loading')
    // Se onLoad não disparar em TIMEOUT_MS, assume que caiu
    timerRef.current = window.setTimeout(() => {
      setState(prev => (prev === 'loading' ? 'timeout' : prev))
    }, TIMEOUT_MS)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [reloadKey])

  function retry() {
    setReloadKey(k => k + 1)
  }

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <iframe
        key={reloadKey}
        src={IFRAME_URL}
        onLoad={() => {
          if (timerRef.current) window.clearTimeout(timerRef.current)
          setState('ok')
        }}
        style={{
          flex: 1, border: 'none', width: '100%',
          // esconde o iframe até carregar OU se der timeout
          visibility: state === 'ok' ? 'visible' : 'hidden',
        }}
        title="Análise de Objeções"
        allow="clipboard-read; clipboard-write"
      />

      {state === 'loading' && (
        <div style={overlayStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid var(--ws-border)',
              borderTopColor: 'var(--brand-accent)',
              animation: 'spin 0.9s linear infinite',
            }} />
            <div style={{ color: 'var(--ws-text-secondary)', fontSize: 13 }}>Carregando análise…</div>
          </div>
        </div>
      )}

      {state === 'timeout' && (
        <div style={overlayStyle}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            maxWidth: 380, textAlign: 'center', padding: '0 24px',
          }}>
            <AlertTriangle size={36} style={{ color: 'var(--status-atencao, #F2A93B)' }} />
            <div style={{ fontWeight: 500, fontSize: 16, color: 'var(--ws-text-primary)' }}>
              Serviço indisponível
            </div>
            <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', lineHeight: 1.5 }}>
              O relatório está demorando pra responder ou o servidor n8n não está acessível
              agora. Tenta de novo em alguns segundos.
            </div>
            <button
              onClick={retry}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 16px', borderRadius: 999,
                border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
                color: 'var(--ws-text-primary)', fontSize: 13, cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <RefreshCw size={14} /> Tentar de novo
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--ws-bg)',
  zIndex: 1,
}
