import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, type ComponentType } from 'react'
import { Login } from '@/pages/Login'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AppLayout } from '@/components/AppLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RoleGuard } from '@/components/RoleGuard'
import { SharedFiltersProvider } from '@/contexts/SharedFiltersContext'

/**
 * `React.lazy` que auto-recarrega a página em erro de chunk.
 *
 * Depois de um deploy os chunks lazy têm hashes novos; abas antigas seguem
 * pedindo o hash velho e recebem 404 — a UI mostra "erro de carregamento" ou
 * fica em branco. Aqui tentamos recarregar UMA vez (marcado no sessionStorage
 * pra não entrar em loop se o erro for outro), buscando o `index.html` novo
 * junto com o manifesto de chunks atualizado.
 */
function lazyWithRetry<T extends ComponentType<unknown>>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const KEY = 'ws-chunk-reload'
    try {
      const mod = await loader()
      sessionStorage.removeItem(KEY)
      return mod
    } catch (err) {
      const jaTentou = sessionStorage.getItem(KEY) === '1'
      if (!jaTentou) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
        // Nunca resolve — a página vai recarregar. Devolve um placeholder pro TS.
        return new Promise<{ default: T }>(() => {})
      }
      throw err
    }
  })
}

// Lazy imports: cada rota vira um chunk próprio, reduz bundle inicial ~40%
const VisaoGeral        = lazyWithRetry(() => import('@/pages/VisaoGeral').then(m => ({ default: m.VisaoGeral })))
const SaudeDaMarca      = lazyWithRetry(() => import('@/pages/SaudeDaMarca').then(m => ({ default: m.SaudeDaMarca })))
const Okrs              = lazyWithRetry(() => import('@/pages/Okrs').then(m => ({ default: m.Okrs })))
const SopMarketing      = lazyWithRetry(() => import('@/pages/SopMarketing').then(m => ({ default: m.SopMarketing })))
const FunilVendas       = lazyWithRetry(() => import('@/pages/FunilVendas').then(m => ({ default: m.FunilVendas })))
const PerformanceVendas = lazyWithRetry(() => import('@/pages/PerformanceVendas').then(m => ({ default: m.PerformanceVendas })))
const AnalisePerda      = lazyWithRetry(() => import('@/pages/AnalisePerda').then(m => ({ default: m.AnalisePerda })))
const AnaliseObjecoes   = lazyWithRetry(() => import('@/pages/AnaliseObjecoes').then(m => ({ default: m.AnaliseObjecoes })))
const GpSetembro        = lazyWithRetry(() => import('@/pages/GpSetembro').then(m => ({ default: m.GpSetembro })))
const HubMetas          = lazyWithRetry(() => import('@/pages/HubMetas').then(m => ({ default: m.HubMetas })))

// Fallback discreto durante carga do chunk (~100-300ms)
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 'calc(100vh - 56px)', color: 'var(--ws-text-secondary)', fontSize: 13,
    }}>Carregando…</div>
  )
}

function RoutedContent() {
  // key={pathname} reseta o ErrorBoundary ao trocar de rota — erro numa página não persiste na próxima.
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname} scope={pathname}>
      <Suspense fallback={<PageLoader />}>
       <RoleGuard pathname={pathname}>
        <Routes>
          <Route path="/"              element={<VisaoGeral />} />
          <Route path="/marca"         element={<SaudeDaMarca />} />
          <Route path="/okrs"          element={<Okrs />} />
          <Route path="/copa-b2b"      element={<Navigate to="/okrs" replace />} />
          <Route path="/sop-marketing" element={<SopMarketing />} />
          <Route path="/funil-vendas"       element={<FunilVendas />} />
          <Route path="/performance-vendas" element={<PerformanceVendas />} />
          <Route path="/metas"              element={<HubMetas />} />
          <Route path="/analise-objecoes"   element={<AnaliseObjecoes />} />
          <Route path="/gp-setembro"        element={<GpSetembro />} />
          <Route path="/analise-perda"      element={<AnalisePerda />} />
          <Route path="/esteira-oral-unic" element={<Navigate to="/marca" replace />} />
          <Route path="/cadencias"         element={<Navigate to="/" replace />} />
          <Route path="/analise-termos"    element={<Navigate to="/marca" replace />} />
          <Route path="*"                 element={<Navigate to="/" replace />} />
        </Routes>
       </RoleGuard>
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              {/* Filtros das abas de Vendas vivem acima do router: trocar de aba
                  não pode resetar o recorte que o usuário escolheu. */}
              <SharedFiltersProvider>
                <AppLayout>
                  <RoutedContent />
                </AppLayout>
              </SharedFiltersProvider>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
