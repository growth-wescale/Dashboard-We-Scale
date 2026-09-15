import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, linkAuth } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const SENHA_MINIMA = 8

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

/**
 * Onde cai quem clica no e-mail de convite (ou de redefinir senha). O link já
 * abre uma sessão; aqui a pessoa só escolhe a senha e segue pro dashboard.
 */
export function DefinirSenha() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  if (loading) return null

  const convite = linkAuth.tipo === 'invite'

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < SENHA_MINIMA) { setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`); return }
    if (senha !== confirmacao) { setErro('As duas senhas não são iguais.'); return }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) {
      setErro(/different from the old/i.test(error.message)
        ? 'Escolha uma senha diferente da anterior.'
        : 'Não foi possível salvar a senha. Tente de novo.')
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ws-bg)', padding: 24 }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '40px 36px',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, letterSpacing: '-0.01em', color: 'var(--ws-text-primary)', lineHeight: 1 }}>
          We Scale
        </div>

        {!session ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-primary)', marginTop: 24 }}>Link expirado ou já usado</div>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-secondary)', margin: '8px 0 20px' }}>
              {linkAuth.erro ? 'Esse link de e-mail não vale mais. ' : ''}
              Peça a um administrador do dashboard pra enviar um convite novo.
            </p>
            <Link to="/login" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-vinho-a)' }}>Ir para o login</Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 6, marginBottom: 28 }}>
              {convite ? 'Crie sua senha pra entrar no dashboard' : 'Defina uma nova senha'}
              {session.user.email && <> · <strong style={{ fontWeight: 500 }}>{session.user.email}</strong></>}
            </div>

            <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Senha</span>
                <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required autoComplete="new-password" style={inputStyle} />
                <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Pelo menos {SENHA_MINIMA} caracteres.</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Repita a senha</span>
                <input type="password" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} required autoComplete="new-password" style={inputStyle} />
              </label>

              {erro && (
                <div style={{
                  fontSize: 13, color: 'var(--status-risco)', background: 'var(--status-risco-bg)',
                  borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                }}>{erro}</div>
              )}

              <button type="submit" disabled={salvando} style={{
                marginTop: 4, width: '100%', padding: '12px 20px', fontSize: 14, fontFamily: 'var(--font-body)',
                fontWeight: 600, color: '#fff', background: 'var(--ws-vinho-a)', border: 'none',
                borderRadius: 'var(--radius-pill)', cursor: salvando ? 'default' : 'pointer', opacity: salvando ? 0.7 : 1,
              }}>
                {salvando ? 'Salvando…' : 'Salvar senha e entrar'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
