import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Rótulo pra facilitar identificar de onde veio o erro nos logs. */
  scope?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.scope ? ' ' + this.props.scope : ''}]`, error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'var(--ws-bg)',
      }}>
        <div style={{
          maxWidth: 440, textAlign: 'center', padding: '32px 28px',
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 12,
        }}>
          <AlertTriangle size={36} style={{ color: 'var(--status-atencao, #F2A93B)', marginBottom: 14 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-primary)', marginBottom: 8 }}>
            Algo deu errado nesta tela
          </div>
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
            {this.state.error.message || 'Erro inesperado ao renderizar a página.'}
            {this.props.scope && <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>Contexto: {this.props.scope}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={this.reset} style={btnPrimary}>
              <RefreshCw size={14} /> Tentar de novo
            </button>
            <button onClick={() => window.location.reload()} style={btnGhost}>
              Recarregar página
            </button>
          </div>
        </div>
      </div>
    )
  }
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 16px', borderRadius: 999,
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: 'none', background: 'var(--brand-accent)', color: '#fff',
}
const btnGhost: React.CSSProperties = {
  ...btnBase,
  border: '1px solid var(--ws-border)', background: 'transparent', color: 'var(--ws-text-primary)',
}
