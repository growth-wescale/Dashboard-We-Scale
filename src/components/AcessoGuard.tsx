import { useEffect, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAcesso } from '@/contexts/AcessoContext'
import { permissaoDaRota, primeiraRotaPermitida } from '@/lib/permissoes'

function Carregando() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  )
}

function TelaAviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: { label: string; onClick: () => void } }) {
  const navigate = useNavigate()
  async function sair() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }
  const botao = {
    padding: '10px 18px', borderRadius: 'var(--radius-pill)', fontSize: 14, fontWeight: 600,
    fontFamily: 'var(--font-body)', cursor: 'pointer',
  } as const
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ws-bg)', padding: 24 }}>
      <div style={{
        width: '100%', maxWidth: 440, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '36px 32px',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ws-text-primary)' }}>{titulo}</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-secondary)', margin: '10px 0 24px' }}>{texto}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {acao && (
            <button onClick={acao.onClick} style={{ ...botao, border: 'none', background: 'var(--ws-vinho-a)', color: '#fff' }}>{acao.label}</button>
          )}
          <button onClick={sair} style={{ ...botao, border: '1px solid var(--ws-border-strong)', background: 'transparent', color: 'var(--ws-text-primary)' }}>Sair</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Portão do app logado. Só deixa entrar quem tem acesso liberado e ativo no
 * controle de acessos. Conta desativada é deslogada na hora; conta sem papel
 * vê a tela "sem acesso". Erro ao consultar = ninguém entra (falha fechada).
 */
export function PortaoDeAcesso({ children }: { children: ReactNode }) {
  const acesso = useAcesso()
  const navigate = useNavigate()
  const desativado = !acesso.carregando && !acesso.erro && acesso.registrado && !acesso.ativo

  useEffect(() => {
    if (!desativado) return
    supabase.auth.signOut().then(() => navigate('/login?motivo=desativado', { replace: true }))
  }, [desativado, navigate])

  if (acesso.carregando || desativado) return <Carregando />
  if (acesso.erro) {
    return (
      <TelaAviso
        titulo="Não deu pra verificar seu acesso"
        texto="Pode ser a conexão. Tente de novo em alguns segundos; se continuar, fale com um administrador do dashboard."
        acao={{ label: 'Tentar de novo', onClick: () => { acesso.recarregar() } }}
      />
    )
  }
  if (primeiraRotaPermitida(acesso) === null) {
    return (
      <TelaAviso
        titulo="Sua conta ainda não tem acesso"
        texto="Você entrou, mas nenhuma tela do dashboard foi liberada pra você. Peça a um administrador do dashboard pra liberar seu acesso."
      />
    )
  }
  return <>{children}</>
}

/** Rota que o papel não libera → primeira tela que a pessoa pode abrir. */
export function GuardaRota({ pathname, children }: { pathname: string; children: ReactNode }) {
  const acesso = useAcesso()
  const permissao = permissaoDaRota(pathname)
  if (permissao && !acesso.pode(permissao)) {
    const destino = primeiraRotaPermitida(acesso)
    if (destino && destino !== pathname) return <Navigate to={destino} replace />
  }
  return <>{children}</>
}
