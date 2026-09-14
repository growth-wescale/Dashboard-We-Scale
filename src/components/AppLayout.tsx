import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Activity, Trophy, PresentationIcon, Bell, LogOut, PanelLeftClose, PanelLeftOpen, RefreshCw, TrendingUp, Flag, Play, Menu, Users } from 'lucide-react'
import { Sidebar, type SidebarItem } from '@/components/ui/Sidebar'
import { AiChat } from '@/components/AiChat'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ui/v2/ThemeToggle'
import { useGpMode } from '@/hooks/useGpMode'
import { useAcesso } from '@/contexts/AcessoContext'
import { PERM_GERENCIAR_USUARIOS, ROTA_ACESSOS, permissaoDaRota } from '@/lib/permissoes'
import { GpIntro } from '@/components/gp/GpIntro'
import { GpStrip } from '@/components/gp/GpStrip'
import { SennaCard } from '@/components/gp/SennaCard'
import { useMediaQuery, MQ_COMPACTO } from '@/hooks/useMediaQuery'

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
  { key: 'we-scale',   label: 'We Scale',   dot: '#7E0E70' },
  { key: 'fred',       label: 'Frederico',  dot: '#2A6E3F' },
  { key: 'leo',        label: 'Leonardo',   dot: '#3B5998' },
]

const VENDAS_SUB = [
  { key: 'funil-vendas',        label: 'Visão Macro' },
  { key: 'performance-vendas',  label: 'Performance' },
  { key: 'analise-perda',       label: 'Análise de Perda' },
  { key: 'analise-objecoes',    label: 'Análise de Objeções' },
  { key: 'gp-setembro',         label: 'Campanha de Metas' },
  { key: 'metas',               label: 'Metas' },
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
    key: 'okrs',
    label: 'Meta & OKRs',
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

// Rota de cada item do menu — a permissão exigida sai de permissaoDaRota() (lib/permissoes).
const ROTA_MENU: Record<string, string> = { geral: '/', saude: '/marca', okrs: '/okrs', sop: '/sop-marketing' }

function podeRota(pode: (chave: string) => boolean, rota: string | undefined): boolean {
  const permissao = rota ? permissaoDaRota(rota) : null
  return permissao !== null && pode(permissao)
}

function getActiveKey(pathname: string): string {
  if (pathname.startsWith(ROTA_ACESSOS)) return 'acessos'
  if (pathname.startsWith('/marca')) return 'saude'
  if (pathname.startsWith('/okrs') || pathname.startsWith('/copa-b2b')) return 'okrs'
  if (pathname.startsWith('/sop-marketing')) return 'sop'
  if (pathname.startsWith('/funil-vendas') || pathname.startsWith('/performance-vendas') || pathname.startsWith('/analise-perda') || pathname.startsWith('/analise-objecoes') || pathname.startsWith('/gp-setembro') || pathname.startsWith('/metas')) return 'vendas'
  return 'geral'
}

function getVendasActiveSub(pathname: string): string {
  if (pathname.startsWith('/gp-setembro'))        return 'gp-setembro'
  if (pathname.startsWith('/analise-objecoes'))   return 'analise-objecoes'
  if (pathname.startsWith('/analise-perda'))      return 'analise-perda'
  if (pathname.startsWith('/performance-vendas')) return 'performance-vendas'
  if (pathname.startsWith('/metas'))              return 'metas'
  return 'funil-vendas'
}

// ── Layout ─────────────────────────────────────────────────────────────────
interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { marca: marcaPermitida, pode } = useAcesso()
  const isMarcaRole = !!marcaPermitida
  const [activeBrand, setActiveBrandState] = useState<string>(marcaPermitida ?? 'oral-unic')

  // Trava a marca ativa quando o usuário é do papel `marca` — não deixa nem
  // um bug de código local levar pro sub de outra marca.
  const setActiveBrand = useCallback((b: string) => {
    if (isMarcaRole && marcaPermitida) {
      setActiveBrandState(marcaPermitida)
      return
    }
    setActiveBrandState(b)
  }, [isMarcaRole, marcaPermitida])

  // Se o role muda (login/logout), garante que activeBrand fica correto.
  useEffect(() => {
    if (isMarcaRole && marcaPermitida && activeBrand !== marcaPermitida) {
      setActiveBrandState(marcaPermitida)
    }
  }, [isMarcaRole, marcaPermitida, activeBrand])

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebarOpen') !== 'false' } catch { return true }
  })
  // Celular/tablet: o menu vira gaveta por cima do conteúdo — começa fechada,
  // fecha ao navegar e não mexe na preferência de menu aberto/fechado do desktop.
  const compacto = useMediaQuery(MQ_COMPACTO)
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const menuAberto = compacto ? gavetaAberta : sidebarOpen
  useEffect(() => {
    if (!compacto || !gavetaAberta) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setGavetaAberta(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compacto, gavetaAberta])
  const [syncing, setSyncing] = useState(false)
  const { gpAtivo, toggleGp, replayIntro } = useGpMode()

  // Menu segue o controle de acessos: some o que o papel não libera. Usuário
  // travado numa marca vê só o sub-item dela em Saúde da Marca.
  const navItems = useMemo<SidebarItem[]>(() => {
    const itens: SidebarItem[] = []
    for (const item of NAV_ITEMS) {
      if (item.key === 'vendas') {
        const subs = VENDAS_SUB.filter(s => podeRota(pode, `/${s.key}`))
        if (subs.length > 0) itens.push({ ...item, subItems: subs })
        continue
      }
      if (!podeRota(pode, ROTA_MENU[item.key])) continue
      if (item.key === 'saude' && isMarcaRole) {
        itens.push({ ...item, subItems: BRANDS_SUB.filter(b => b.key === marcaPermitida) })
        continue
      }
      itens.push(item)
    }
    if (pode(PERM_GERENCIAR_USUARIOS)) {
      itens.push({ key: 'acessos', label: 'Usuários & Acessos', icon: <Users size={16} /> })
    }
    return itens
  }, [pode, isMarcaRole, marcaPermitida])

  const handleSync = useCallback(() => {
    if (syncing) return
    setSyncing(true)
    window.dispatchEvent(new Event('dashboard:refresh'))
    setTimeout(() => setSyncing(false), 2000)
  }, [syncing])

  function toggleSidebar() {
    if (compacto) { setGavetaAberta(v => !v); return }
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
    setGavetaAberta(false)
    if (key === 'geral') navigate('/')
    else if (key === 'saude') navigate('/marca')
    else if (key === 'okrs') navigate('/okrs')
    else if (key === 'sop') navigate('/sop-marketing')
    else if (key === 'vendas') {
      const primeira = VENDAS_SUB.find(s => podeRota(pode, `/${s.key}`))
      if (primeira) handleSubNav(primeira.key)
    }
    else if (key === 'acessos') navigate(ROTA_ACESSOS)
  }

  function handleSubNav(key: string) {
    setGavetaAberta(false)
    if (key === 'funil-vendas') navigate('/funil-vendas')
    else if (key === 'performance-vendas') navigate('/performance-vendas')
    else if (key === 'analise-perda') navigate('/analise-perda')
    else if (key === 'analise-objecoes') navigate('/analise-objecoes')
    else if (key === 'gp-setembro') navigate('/gp-setembro')
    else if (key === 'metas') navigate('/metas')
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {gpAtivo && <SennaCard />}
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
    </div>
  )

  return (
    <MarcaContext.Provider value={{ activeBrand, setActiveBrand }}>
      <div
        style={{ minHeight: '100vh', background: 'var(--ws-bg)', display: 'flex' }}
        {...(isSaude ? { 'data-brand': activeBrand } : {})}
      >
        <Sidebar
          variant="glass"
          items={navItems}
          active={activeKey}
          onSelect={handleNav}
          activeSub={isSaude ? activeBrand : isVendas ? getVendasActiveSub(location.pathname) : null}
          onSelectSub={handleSubNav}
          footer={footer}
          open={menuAberto}
          style={compacto ? { zIndex: 950, height: 'calc(100dvh - 24px)' } : undefined}
        />

        {compacto && gavetaAberta && (
          <div onClick={() => setGavetaAberta(false)} aria-hidden="true" style={{
            position: 'fixed', inset: 0, zIndex: 940, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)',
          }} />
        )}

        {/* Content wrapper — 12px extra pra folga da sidebar flutuante glass */}
        <div style={{
          marginLeft: !compacto && sidebarOpen ? 'calc(var(--sidebar-w) + 12px)' : 0,
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
            gap: 'var(--topbar-gap)',
            padding: '0 var(--topbar-pad-x)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}>
            <button
              onClick={toggleSidebar}
              title={menuAberto ? 'Ocultar menu' : 'Mostrar menu'}
              aria-expanded={menuAberto}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', padding: compacto ? 6 : 4, borderRadius: 8, flexShrink: 0 }}
            >
              {compacto ? <Menu size={20} /> : sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
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
            <button className="rs-hide-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}>
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

        {/* Assistente flutuante só nas abas de Marketing — fora das abas de Vendas (Junior) */}
        {!isVendas && pode('acao.assistente-ia') && <AiChat />}
        {gpAtivo && <GpIntro />}
      </div>
    </MarcaContext.Provider>
  )
}
