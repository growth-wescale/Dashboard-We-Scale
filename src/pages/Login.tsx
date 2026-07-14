import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  color: 'var(--ws-text-primary)',
  background: 'var(--ws-bg)',
  border: '1px solid var(--ws-border-strong)',
  borderRadius: 'var(--radius-sm)',
  outline: 'none',
  transition: 'border-color .15s',
} as const

export function Login() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [focusField, setFocusField] = useState<string | null>(null)

  if (loading) return null
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('E-mail ou senha incorretos.')
    setSubmitting(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--ws-bg)',
      padding: 24,
    }}>
      {/* diagonal texture background */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.035,
        background: 'repeating-linear-gradient(-52deg, var(--ws-vinho-a) 0 2px, transparent 2px 26px)',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 400,
        background: 'var(--ws-surface)',
        border: '1px solid var(--ws-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: '40px 36px',
      }}>
        {/* Wordmark */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 26,
            letterSpacing: '-0.01em',
            color: 'var(--ws-text-primary)',
            lineHeight: 1,
          }}>
            We Scale
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--ws-text-secondary)',
            marginTop: 6,
            fontWeight: 400,
          }}>
            Dashboard de performance
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              onFocus={() => setFocusField('email')}
              onBlur={() => setFocusField(null)}
              style={{
                ...inputStyle,
                borderColor: focusField === 'email' ? 'var(--ws-vinho-b)' : 'var(--ws-border-strong)',
                boxShadow: focusField === 'email' ? `0 0 0 3px color-mix(in srgb, var(--ws-vinho-b) 12%, transparent)` : 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              onFocus={() => setFocusField('password')}
              onBlur={() => setFocusField(null)}
              style={{
                ...inputStyle,
                borderColor: focusField === 'password' ? 'var(--ws-vinho-b)' : 'var(--ws-border-strong)',
                boxShadow: focusField === 'password' ? `0 0 0 3px color-mix(in srgb, var(--ws-vinho-b) 12%, transparent)` : 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 13,
              color: 'var(--status-risco)',
              background: 'var(--status-risco-bg)',
              border: '1px solid color-mix(in srgb, var(--status-risco) 20%, transparent)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            onMouseDown={e => !submitting && (e.currentTarget.style.transform = 'scale(.98)')}
            onMouseUp={e => (e.currentTarget.style.transform = '')}
            onMouseLeave={e => (e.currentTarget.style.transform = '')}
            style={{
              marginTop: 4,
              width: '100%',
              padding: '12px 20px',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: '#fff',
              background: submitting ? 'var(--ws-vinho-b)' : 'var(--ws-vinho-a)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              transition: 'filter .15s, transform .05s',
              lineHeight: 1,
            }}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
