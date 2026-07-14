import { createContext, useContext, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Activity, Trophy, Bell, LogOut } from 'lucide-react'
import { Sidebar } from '@/components/ui/Sidebar'
import { AiChat } from '@/components/AiChat'
import { supabase } from '@/lib/supabase'

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
    label: 'Meta Copa B2B',
    icon: <Trophy size={16} />,
  },
]

function getActiveKey(pathname: string): string {
  if (pathname.startsWith('/marca')) return 'saude'
  if (pathname.startsWith('/copa-b2b')) return 'copa'
  return 'geral'
}

// ── Layout ─────────────────────────────────────────────────────────────────
interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeBrand, setActiveBrand] = useState<string>('oral-unic')

  const activeKey = getActiveKey(location.pathname)
  const isSaude = activeKey === 'saude'

  function handleNav(key: string) {
    if (key === 'geral') navigate('/')
    else if (key === 'saude') navigate('/marca')
    else if (key === 'copa') navigate('/copa-b2b')
  }

  function handleSubNav(key: string) {
    setActiveBrand(key)
    navigate('/marca')
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
          items={NAV_ITEMS}
          active={activeKey}
          onSelect={handleNav}
          activeSub={isSaude ? activeBrand : null}
          onSelectSub={handleSubNav}
          footer={footer}
        />

        {/* Content wrapper */}
        <div style={{ marginLeft: 'var(--sidebar-w)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {/* Topbar */}
          <header style={{
            height: 56,
            background: 'var(--ws-surface)',
            borderBottom: '1px solid var(--ws-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}>
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

          <main style={{ flex: 1 }}>
            {children}
          </main>
        </div>

        <AiChat />
      </div>
    </MarcaContext.Provider>
  )
}
