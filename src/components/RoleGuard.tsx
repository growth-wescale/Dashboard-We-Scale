import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { ReactNode } from 'react'

/**
 * Rotas permitidas por papel.
 *
 * `admin`: tudo (não gera Navigate).
 * `marca`: só Visão Geral (`/`) e Saúde da Marca (`/marca`). Tudo mais
 *   redireciona pra `/marca`. Fica na frente do PrivateRoute — a checagem de
 *   sessão continua acontecendo antes.
 */
const ROTAS_MARCA = new Set(['/', '/marca'])

export function RoleGuard({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { role, loading } = useAuth()
  if (loading) return <>{children}</>  // deixa o PrivateRoute mostrar o spinner
  if (role === 'admin') return <>{children}</>
  // role = 'marca' — só passa se a rota está na allowlist
  if (ROTAS_MARCA.has(pathname)) return <>{children}</>
  return <Navigate to="/marca" replace />
}
