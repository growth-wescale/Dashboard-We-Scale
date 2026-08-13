import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Activity, Trophy, ListChecks, PresentationIcon, Bell, LogOut, PanelLeftClose, PanelLeftOpen, RefreshCw, TrendingUp, Search } from 'lucide-react'
import { Sidebar } from '@/components/ui/Sidebar'
import { AiChat } from '@/components/AiChat'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ui/v2/ThemeToggle'

// ── Context ────────────────────────────────────────────────────────────────
interface MarcaContextType {
  activeBrand: string
  setActiveBrand: (b: string) => void
}

export const MarcaContext = createContext<MarcaContextType>({
  activeBrand: 'oral-unic',
  setActiveBrand: () => {},
})

export function useMarcaSelecionada() {
  return useContext(MarcaContext)
}

// ── Nav items ──────────────────────────────────────────────────────────────
const BRANDS_SUB = [
  { key: 'oral-unic',  label: 'Oral Unic',  dot: '#7F0C72' },
  { key: 'inpot',      label: 'Inpot',      dot: '#C6D32D' },
  { key: 'eletrovias', label: 'Eletrovias', dot: '#ED6D3A' },
  { key: 'liso-laser', label: 'Lisô Laser', dot: '#FF6643' },
  { key: 'b2case',     label: 'B2Case',     dot: '#0169F2' },
  { key: 'viva',       label: 'Viva',       dot: '#FF0069' },
]

const VENDAS_SUB = [
  { key: 'funil-vendas',        label: 'Funil de Vendas' },
  { key: 'performance-vendas',  label: 'Performance Detalhada' },
  { key: 'analise-perda',       label: 'Análise de Perda' },
  { key: 'analise-objecoes',    label: 'Análise de Objeções' },
]

const NAV_ITEMS = [
  {
    key: 'geral',
    label: 'Visão Geral',
    icon: <LayoutDashboard size={16} />,
  },
  {
    key: 'saude',
    label: 'Saúde da Marca',
    icon: <Activity size={16} />,
    subItems: BRANDS_SUB,
  },
  {
    key: 'copa',
    label: 'Acompanhamento Meta',
    icon: <Trophy size={16} />,
  },
  {
    key: 'cadencias',
    label: 'Cadências',
    icon: <ListChecks size={16} />,
  },
  {
    key: 'sop',
    label: 'S&OP Marketing',
    icon: <PresentationIcon size={16} />,
  },
  {
    key: 'vendas',
    label: 'Vendas',
    icon: <TrendingUp size={16} />,
    subItems: VENDAS_SUB,
  },
  {
    key: 'analise-termos',
    label: 'Análise de Termos',
    icon: <Search size={16} />,
  },
]

function getActiveKey(pathname: string): string {
  if (pathname.startsWith('/marca')) return 'saude'
  if (pathname.startsWith('/copa-b2b')) return 'copa'
  if (pathname.startsWith('/cadencias')) return 'cadencias'
  if (pathname.startsWith('/sop-marketing')) return 'sop'
  if (pathname.startsWith('/funil-vendas') || pathname.startsWith('/performance-vendas') || pathname.startsWith('/analise-perda') || pathname.startsWith('/analise-objecoes')) return 'vendas'
  if (pathname.startsWith('/analise-termos')) return 'analise-termos'
  return 'geral'
}

function getVendasActiveSub(pathname: string): string {
  if (pathname.startsWith('/analise-objecoes'))   return 'analise-objecoes'
  if (pathname.startsWith('/analise-perda'))      return 'analise-perda'
  if (pathname.startsWith('/performance-vendas')) return 'performance-vendas'
  return 'funil-vendas'
}

// ── Layout ─────────────────────────────────────────────────────────────────
interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeBrand, setActiveBrand] = useState<string>('oral-unic')
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebarOpen') !== 'false' } catch { return true }
  })
  const [syncing, setSyncing] = useState(false)

  const handleSync = useCallback(() => {
    if (syncing) return
    setSyncing(true)
    window.dispatchEvent(new Event('dashboard:refresh'))
    setTimeout(() => setSyncing(false), 2000)
  }, [syncing])

  function toggleSidebar() {
    setSidebarOpen(v => {
      const next = !v
      try { localStorage.setItem('sidebarOpen', String(next)) } catch {}
      return next
    })
  }

  const activeKey = getActiveKey(location.pathname)
  const isSaude = activeKey === 'saude'
  const isVendas = activeKey === 'vendas'

  function handleNav(key: string) {
    if (key === 'geral') navigate('/')
    else if (key === 'saude') navigate('/marca')
    else if (key === 'copa') navigate('/copa-b2b')
    else if (key === 'cadencias') navigate('/cadencias')
    else if (key === 'sop') navigate('/sop-marketing')
    else if (key === 'vendas') navigate('/funil-vendas')
    else if (key === 'analise-termos') navigate('/analise-termos')
  }

  function handleSubNav(key: string) {
    if (key === 'funil-vendas') navigate('/funil-vendas')
    else if (key === 'performance-vendas') navigate('/performance-vendas')
    else if (key === 'analise-perda') navigate('/analise-perda')
    else if (key === 'analise-objecoes') navigate('/analise-objecoes')
    else {
      setActiveBrand(key)
      navigate('/marca')
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const footer = (
    <button
      onClick={handleSignOut}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 12px',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: 'transparent',
        color: 'var(--ws-text-on-dark-muted)',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        textAlign: 'left',
        transition: 'all .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <LogOut size={16} />
      Sair
    </button>
  )

  return (
    <MarcaContext.Provider value={{ activeBrand, setActiveBrand }}>
      <div
        style={{ minHeight: '100vh', background: 'var(--ws-bg)', display: 'flex' }}
        {...(isSaude ? { 'data-brand': activeBrand } : {})}
      >
        <Sidebar
          variant="glass"
          items={NAV_ITEMS}
          active={activeKey}
          onSelect={handleNav}
          activeSub={isSaude ? activeBrand : isVendas ? getVendasActiveSub(location.pathname) : null}
          onSelectSub={handleSubNav}
          footer={footer}
          open={sidebarOpen}
        />

        {/* Content wrapper — 12px extra pra folga da sidebar flutuante glass */}
        <div style={{
          marginLeft: sidebarOpen ? 'calc(var(--sidebar-w) + 12px)' : 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          minWidth: 0,
          transition: 'margin-left 0.2s ease',
          overflow: 'hidden',
        }}>
          {/* Topbar */}
          <header style={{
            height: 56,
            background: 'var(--ws-surface)',
            borderBottom: '1px solid var(--ws-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}>
            <button
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Ocultar menu' : 'Mostrar menu'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8, flexShrink: 0 }}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleSync}
              title="Sincronizar dados"
              style={{
                background: 'none', border: 'none', cursor: syncing ? 'default' : 'pointer',
                color: syncing ? 'var(--brand-accent)' : 'var(--ws-text-secondary)',
                display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8,
                opacity: syncing ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <RefreshCw
                size={18}
                style={{
                  animation: syncing ? 'spin 0.8s linear infinite' : 'none',
                }}
              />
            </button>
            <ThemeToggle />
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}>
              <Bell size={18} />
            </button>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--ws-vinho-b)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.04em',
            }}>
              RM
            </div>
          </header>

          <main style={{ flex: 1, minWidth: 0 }}>
            {children}
          </main>
        </div>

        <AiChat />
      </div>
    </MarcaContext.Provider>
  )
}
