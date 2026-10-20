import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { mensagemErroRecuperacao } from '@/lib/recuperarSenha'

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
} as const

const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--ws-text-primary)' } as const
const linkStyle = { fontSize: 14, fontWeight: 600, color: 'var(--ws-vinho-a)' } as const

/**
 * Pede o link de redefinir senha. O e-mail leva pra /definir-senha, a mesma
 * tela do convite, que já abre a sessão e só pede a senha nova.
 */
export function EsqueciSenha() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const emailInicial = (location.state as { email?: string } | null)?.email ?? ''
  const [email, setEmail] = useState(emailInicial)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)

  if (loading) return null
  if (session) return <Navigate to="/" replace />

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const destino = email.trim()
    const { error } = await supabase.auth.resetPasswordForEmail(destino, {
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    setEnviando(false)
    if (error) { setErro(mensagemErroRecuperacao(error)); return }
    setEnviadoPara(destino)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ws-bg)', padding: 24 }}>
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.035,
        background: 'repeating-linear-gradient(-52deg, var(--ws-vinho-a) 0 2px, transparent 2px 26px)',
      }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 400, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '40px 36px',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, letterSpacing: '-0.01em', color: 'var(--ws-text-primary)', lineHeight: 1 }}>
          We Scale
        </div>

        {enviadoPara ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-primary)', marginTop: 24 }}>Confira seu e-mail</div>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-secondary)', margin: '8px 0 20px' }}>
              Se <strong style={{ fontWeight: 500, color: 'var(--ws-text-primary)' }}>{enviadoPara}</strong> tiver
              acesso ao dashboard, vai chegar um link pra criar uma senha nova em alguns minutos. Olhe também
              a caixa de spam. O link vale por pouco tempo e só pode ser usado uma vez.
            </p>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <Link to="/login" style={linkStyle}>Voltar para o login</Link>
              <button
                type="button"
                onClick={() => setEnviadoPara(null)}
                style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                Não chegou? Enviar de novo
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 6, marginBottom: 28, lineHeight: 1.5 }}>
              Esqueceu a senha? Informe seu e-mail e mandamos um link pra criar uma nova.
            </div>

            <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  style={inputStyle}
                />
              </label>

              {erro && (
                <div style={{
                  fontSize: 13, color: 'var(--status-risco)', background: 'var(--status-risco-bg)',
                  borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                }}>{erro}</div>
              )}

              <button type="submit" disabled={enviando} style={{
                marginTop: 4, width: '100%', padding: '12px 20px', fontSize: 14, fontFamily: 'var(--font-body)',
                fontWeight: 600, color: '#fff', background: 'var(--ws-vinho-a)', border: 'none', lineHeight: 1,
                borderRadius: 'var(--radius-pill)', cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1,
              }}>
                {enviando ? 'Enviando…' : 'Enviar link'}
              </button>

              <Link to="/login" style={{ ...linkStyle, fontSize: 13, textAlign: 'center' }}>Voltar para o login</Link>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
