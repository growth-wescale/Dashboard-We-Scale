import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Rótulo pra facilitar identificar de onde veio o erro nos logs. */
  scope?: string
}

interface State {
  error: Error | null
  componentStack: string | null
  copied: boolean
}

/** Snapshot serializável do erro — copiado ou colado no report do bug. */
function serializeError(scope: string | undefined, error: Error, componentStack: string | null): string {
  return [
    `Contexto: ${scope ?? '(sem scope)'}`,
    `Data: ${new Date().toISOString()}`,
    `URL: ${typeof window !== 'undefined' ? window.location.href : '(no window)'}`,
    `UserAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : '(no navigator)'}`,
    '',
    `Mensagem: ${error.message}`,
    '',
    'Stack:',
    error.stack ?? '(sem stack)',
    '',
    'Component stack:',
    componentStack ?? '(sem component stack)',
  ].join('\n')
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    // Loga estruturado pra Sentry/console — inclui stack completo pra debugging remoto.
    console.error(
      `[ErrorBoundary${this.props.scope ? ' ' + this.props.scope : ''}]`,
      '\n', error,
      '\nStack:', error.stack,
      '\nComponent stack:', info.componentStack,
    )
  }

  reset = () => this.setState({ error: null, componentStack: null, copied: false })

  copy = async () => {
    if (!this.state.error) return
    const text = serializeError(this.props.scope, this.state.error, this.state.componentStack)
    try {
      await navigator.clipboard.writeText(text)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      // Sem permissão de clipboard (ex.: HTTP em algum ambiente) — o textarea abaixo já mostra.
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const detalhes = serializeError(this.props.scope, this.state.error, this.state.componentStack)
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 24, background: 'var(--ws-bg)',
      }}>
        <div style={{
          maxWidth: 720, width: '100%', padding: '32px 28px',
          background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <AlertTriangle size={30} style={{ color: 'var(--status-atencao, #F2A93B)', flexShrink: 0 }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ws-text-primary)' }}>
              Algo deu errado nesta tela
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            {this.state.error.message || 'Erro inesperado ao renderizar a página.'}
            {this.props.scope && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>Contexto: {this.props.scope}</div>}
          </div>

          <details style={{ marginBottom: 20, border: '1px solid var(--ws-border)', borderRadius: 8, padding: '10px 12px', background: 'var(--ws-bg)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ws-text-secondary)', fontWeight: 600, userSelect: 'none' }}>
              Detalhes técnicos (mande print/cópia disso pra correção)
            </summary>
            <textarea
              readOnly
              value={detalhes}
              onFocus={e => e.currentTarget.select()}
              style={{
                width: '100%', marginTop: 10, minHeight: 220,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11, padding: 10, border: '1px solid var(--ws-border)', borderRadius: 6,
                background: 'var(--ws-surface)', color: 'var(--ws-text-primary)', resize: 'vertical',
              }}
            />
          </details>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={this.reset} style={btnPrimary}>
              <RefreshCw size={14} /> Tentar de novo
            </button>
            <button onClick={() => window.location.reload()} style={btnGhost}>
              Recarregar página
            </button>
            <button onClick={this.copy} style={btnGhost}>
              <Copy size={14} /> {this.state.copied ? 'Copiado!' : 'Copiar detalhes'}
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
