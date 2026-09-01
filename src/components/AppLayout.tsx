import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Activity, Trophy, PresentationIcon, Bell, LogOut, PanelLeftClose, PanelLeftOpen, RefreshCw, TrendingUp, Flag, Play } from 'lucide-react'
import { Sidebar } from '@/components/ui/Sidebar'
import { AiChat } from '@/components/AiChat'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ui/v2/ThemeToggle'
import { useGpMode } from '@/hooks/useGpMode'
import { GpIntro } from '@/components/gp/GpIntro'
import { GpStrip } from '@/components/gp/GpStrip'

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
  { key: 'fred',       label: 'Frederico',  dot: '#2A6E3F' },
  { key: 'leo',        label: 'Leonardo',   dot: '#3B5998' },
]

const VENDAS_SUB = [
  { key: 'funil-vendas',        label: 'Visão Macro' },
  { key: 'performance-vendas',  label: 'Performance Detalhada' },
  { key: 'analise-perda',       label: 'Análise de Perda' },
  { key: 'analise-objecoes',    label: 'Análise de Objeções' },
  { key: 'gp-setembro',         label: 'Campanha de Metas' },
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
]

function getActiveKey(pathname: string): string {
  if (pathname.startsWith('/marca')) return 'saude'
  if (pathname.startsWith('/copa-b2b')) return 'copa'
  if (pathname.startsWith('/sop-marketing')) return 'sop'
  if (pathname.startsWith('/funil-vendas') || pathname.startsWith('/performance-vendas') || pathname.startsWith('/analise-perda') || pathname.startsWith('/analise-objecoes') || pathname.startsWith('/gp-setembro')) return 'vendas'
  return 'geral'
}

function getVendasActiveSub(pathname: string): string {
  if (pathname.startsWith('/gp-setembro'))        return 'gp-setembro'
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
  const { gpAtivo, toggleGp, replayIntro } = useGpMode()

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
    else if (key === 'sop') navigate('/sop-marketing')
    else if (key === 'vendas') navigate('/funil-vendas')
  }

  function handleSubNav(key: string) {
    if (key === 'funil-vendas') navigate('/funil-vendas')
    else if (key === 'performance-vendas') navigate('/performance-vendas')
    else if (key === 'analise-perda') navigate('/analise-perda')
    else if (key === 'analise-objecoes') navigate('/analise-objecoes')
    else if (key === 'gp-setembro') navigate('/gp-setembro')
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
          // 'clip' e não 'hidden': hidden faz deste elemento um container de
          // rolagem, e aí qualquer position:sticky dentro dele (a FilterBar das
          // abas de Vendas) gruda neste wrapper em vez da viewport — ou seja,
          // rola para fora da tela junto com a página. 'clip' corta o
          // transbordo horizontal da animação da sidebar sem criar o container.
          overflowX: 'clip',
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
            <button
              onClick={toggleGp}
              className="gp-toggle-btn"
              data-active={gpAtivo}
              title={gpAtivo ? 'Modo GP ativo · clique para desativar' : 'Ativar Modo GP · Fórmula 1'}
              aria-pressed={gpAtivo}
            >
              <Flag size={17} />
            </button>
            {gpAtivo && (
              <button
                onClick={replayIntro}
                title="Rever abertura GP"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}
              >
                <Play size={16} />
              </button>
            )}
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

          {gpAtivo && !location.pathname.startsWith('/gp-setembro') && <GpStrip />}
          <main style={{ flex: 1, minWidth: 0 }}>
            {children}
          </main>
        </div>

        <AiChat />
        {gpAtivo && <GpIntro />}
      </div>
    </MarcaContext.Provider>
  )
}
