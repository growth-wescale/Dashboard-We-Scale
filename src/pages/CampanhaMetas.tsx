import { useMemo, useState } from 'react'
import { PageTop } from '@/components/ui/PageTop'
import { useMetasMarca, upsertMetaMarca, MARCAS_FRANQUIA, USE_MOCK, type MetaMarca } from '@/hooks/useMetasMarca'
import { useRealizadoPorMarca } from '@/hooks/useRealizadoPorMarca'
import { money, pct } from '@/lib/format'

const MESES_DISPONIVEIS = [
  { key: '2026-09-01', label: 'Setembro 2026', short: 'Set' },
  { key: '2026-10-01', label: 'Outubro 2026',  short: 'Out' },
  { key: '2026-11-01', label: 'Novembro 2026', short: 'Nov' },
  { key: '2026-12-01', label: 'Dezembro 2026', short: 'Dez' },
] as const

// Cores da marca (herança da paleta do dashboard) + F1 red no header
const MARCA_COR: Record<string, string> = {
  'Oral Unic':  '#7F0C72',
  'Inpot':      '#C6D32D',
  'Eletrovias': '#ED6D3A',
  'Lisô Laser': '#FF6643',
  'B2Case':     '#0169F2',
  'Viva':       '#FF0069',
}

const POOL_PREMIOS = 12000

function moneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1_000)     return 'R$ ' + Math.round(n / 1_000).toLocaleString('pt-BR') + 'k'
  return money(n)
}

function ultimoDia(mesReferencia: string): Date {
  const d = new Date(mesReferencia + 'T00:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function diaDoMes(mesReferencia: string): { atual: number; total: number } {
  const inicio = new Date(mesReferencia + 'T00:00:00')
  const fim = ultimoDia(mesReferencia)
  const hoje = new Date()
  const total = fim.getDate()
  if (hoje < inicio) return { atual: 0, total }
  if (hoje > fim) return { atual: total, total }
  return { atual: hoje.getDate(), total }
}

export function CampanhaMetas() {
  const [mesRef, setMesRef] = useState<string>('2026-09-01')
  const [editando, setEditando] = useState<MetaMarca | null>(null)

  const { metas, loading: loadingMetas, reload } = useMetasMarca(mesRef)
  const { porMarca: realizadoMap, loading: loadingReal } = useRealizadoPorMarca(mesRef)
  const loading = loadingMetas || loadingReal

  const linhas = useMemo(() => {
    // Garante 1 linha por marca canônica, mesmo que não tenha meta cadastrada
    return MARCAS_FRANQUIA.map(marca => {
      const meta = metas.find(m => m.marca === marca)
      const real = realizadoMap.get(marca)
      const metaQtd = meta?.metaQtd ?? 0
      const metaFat = meta?.metaFaturamento ?? 0
      const realQtd = real?.qtd ?? 0
      const realFat = real?.faturamento ?? 0
      return {
        marca,
        cor: MARCA_COR[marca] ?? '#888',
        metaQtd,
        metaFat,
        realQtd,
        realFat,
        pctQtd: metaQtd > 0 ? (realQtd / metaQtd) * 100 : 0,
        pctFat: metaFat > 0 ? (realFat / metaFat) * 100 : 0,
        meta,  // referência original pra edição
      }
    })
  }, [metas, realizadoMap])

  const total = useMemo(() => {
    return linhas.reduce(
      (acc, l) => ({
        metaQtd: acc.metaQtd + l.metaQtd,
        metaFat: acc.metaFat + l.metaFat,
        realQtd: acc.realQtd + l.realQtd,
        realFat: acc.realFat + l.realFat,
      }),
      { metaQtd: 0, metaFat: 0, realQtd: 0, realFat: 0 },
    )
  }, [linhas])

  const pctTotal = total.metaFat > 0 ? (total.realFat / total.metaFat) * 100 : 0
  const dia = diaDoMes(mesRef)
  const pctEsperado = dia.total > 0 ? (dia.atual / dia.total) * 100 : 0

  return (
    <div style={{ padding: '24px 32px' }}>
      <PageTop
        title="Campanha de Metas"
        subtitle={`Metas mensais por marca de franquia · dia ${dia.atual}/${dia.total}`}
        titleAside={
          <span style={{ padding: '4px 12px', borderRadius: 999, background: '#E10600', color: '#fff', fontSize: 13, fontWeight: 500 }}>
            {MESES_DISPONIVEIS.find(m => m.key === mesRef)?.short} 2026
          </span>
        }
      />

      {USE_MOCK && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', fontSize: 13,
        }}>
          ⚠️ <b>Modo mock:</b> tabela <code>DB_Metas_Marca</code> ainda não existe no Supabase Expansão.
          Metas vêm de fallback local (planilha). Edições não persistem até o time criar a tabela.
        </div>
      )}

      <HeroBanner mesRef={mesRef} dia={dia} />

      <MesSelector mesRef={mesRef} setMesRef={setMesRef} />

      <MetaTimeCard
        loading={loading}
        realFat={total.realFat}
        metaFat={total.metaFat}
        realQtd={total.realQtd}
        metaQtd={total.metaQtd}
        pctAtingido={pctTotal}
        pctEsperado={pctEsperado}
      />

      <MetasTable
        linhas={linhas}
        onEdit={setEditando}
        total={total}
      />

      {editando && (
        <MetaEditorModal
          meta={editando}
          mesRef={mesRef}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); reload() }}
        />
      )}
    </div>
  )
}

/* ── Hero F1 ────────────────────────────────────────────────────────────── */

const CHECKERED_BG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'>" +
  "<rect width='8' height='8' fill='%23ffffff' fill-opacity='0.05'/>" +
  "<rect x='8' y='8' width='8' height='8' fill='%23ffffff' fill-opacity='0.05'/>" +
  "</svg>\")"

function HeroBanner({ mesRef, dia }: { mesRef: string; dia: { atual: number; total: number } }) {
  const mesInfo = MESES_DISPONIVEIS.find(m => m.key === mesRef)!
  const diasRestantes = Math.max(0, dia.total - dia.atual)
  const semanaAtual = dia.atual <= 7 ? 1 : dia.atual <= 14 ? 2 : dia.atual <= 21 ? 3 : 4

  return (
    <div
      style={{
        position: 'relative',
        background: '#141419',
        borderRadius: 16,
        overflow: 'hidden',
        padding: '28px 32px',
        marginBottom: 20,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: '#E10600' }} />
      <div
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '55%',
          backgroundImage: CHECKERED_BG,
          maskImage: 'linear-gradient(to right, transparent 0%, black 30%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 30%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#E10600', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Fórmula 1 · {mesInfo.label}
        </div>
        <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 500, color: '#fff', lineHeight: 1.05 }}>
          GP We Scale
        </h1>
        <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
          Cada semana é uma volta. Cada venda, uma ultrapassagem.
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <HeroChip dot="#E10600">Volta {semanaAtual} de 4</HeroChip>
          <HeroChip>{diasRestantes} dias para a bandeirada</HeroChip>
          <HeroChip>Pool de prêmios · {moneyCompact(POOL_PREMIOS)}</HeroChip>
        </div>
      </div>
    </div>
  )
}

function HeroChip({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 999,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />}
      {children}
    </span>
  )
}

/* ── Seletor de mês ─────────────────────────────────────────────────────── */

function MesSelector({ mesRef, setMesRef }: { mesRef: string; setMesRef: (m: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      {MESES_DISPONIVEIS.map(m => {
        const ativo = m.key === mesRef
        return (
          <button
            key={m.key}
            onClick={() => setMesRef(m.key)}
            style={{
              padding: '8px 16px', borderRadius: 999,
              border: '1px solid ' + (ativo ? 'var(--ws-brand)' : 'var(--ws-border)'),
              background: ativo ? 'var(--ws-brand)' : 'var(--ws-surface)',
              color: ativo ? '#fff' : 'var(--ws-text-primary)',
              fontSize: 13, fontWeight: ativo ? 500 : 400, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Card Meta do time ──────────────────────────────────────────────────── */

interface MetaTimeCardProps {
  loading: boolean
  realFat: number
  metaFat: number
  realQtd: number
  metaQtd: number
  pctAtingido: number
  pctEsperado: number
}

function MetaTimeCard({ loading, realFat, metaFat, realQtd, metaQtd, pctAtingido, pctEsperado }: MetaTimeCardProps) {
  const status: 'abaixo' | 'no' | 'acima' =
    pctAtingido < pctEsperado - 5 ? 'abaixo' : pctAtingido > pctEsperado + 5 ? 'acima' : 'no'
  const statusMap = {
    abaixo: { label: 'abaixo do ritmo', bg: '#FEE2E2', fg: '#B91C1C', dot: '#EF4444' },
    no:     { label: 'no ritmo',        bg: '#DBEAFE', fg: '#1E40AF', dot: '#3B82F6' },
    acima:  { label: 'acima do ritmo',  bg: '#DCFCE7', fg: '#166534', dot: '#22C55E' },
  }[status]
  const pctBar = Math.max(0, Math.min(100, pctAtingido))

  return (
    <div style={{
      background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
      borderRadius: 16, padding: 24, marginBottom: 20,
      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
            Meta do time
          </h2>
          <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
            Soma das 6 marcas de franquia
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: statusMap.bg, color: statusMap.fg,
          fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: statusMap.dot }} />
          {statusMap.label}
        </span>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500, color: 'var(--ws-brand)', lineHeight: 1 }}>
          {loading ? '—' : money(realFat)}
        </span>
        <span style={{ fontSize: 15, color: 'var(--ws-text-secondary)' }}>
          de {moneyCompact(metaFat)} · {realQtd}/{metaQtd} un · {pct(pctAtingido, 0)}
        </span>
      </div>

      <div style={{ marginTop: 16, height: 8, background: 'var(--ws-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pctBar}%`, height: '100%', background: 'var(--ws-brand)', transition: 'width 400ms ease' }} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        <span>ritmo esperado · {pct(pctEsperado, 0)} do mês</span>
      </div>
    </div>
  )
}

/* ── Tabela por marca ───────────────────────────────────────────────────── */

interface LinhaMarca {
  marca: string
  cor: string
  metaQtd: number
  metaFat: number
  realQtd: number
  realFat: number
  pctQtd: number
  pctFat: number
  meta: MetaMarca | undefined
}

function MetasTable({
  linhas, onEdit, total,
}: {
  linhas: LinhaMarca[]
  onEdit: (m: MetaMarca) => void
  total: { metaQtd: number; metaFat: number; realQtd: number; realFat: number }
}) {
  return (
    <div style={{
      background: 'var(--ws-surface)', border: '1px solid var(--ws-border)',
      borderRadius: 16, overflow: 'hidden', marginBottom: 20,
    }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--ws-border)' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
          Metas por marca
        </h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--ws-bg)', borderBottom: '1px solid var(--ws-border)' }}>
              <th style={thStyle}>Marca</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Meta un</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Realizado un</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Meta R$</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Realizado R$</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>% atingido</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.marca} style={{ borderBottom: '1px solid var(--ws-border)' }}>
                <td style={{ ...tdStyle, borderLeft: `3px solid ${l.cor}`, paddingLeft: 20, fontWeight: 500 }}>
                  {l.marca}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{l.metaQtd}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{l.realQtd}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{money(l.metaFat)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{money(l.realFat)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <PctPill valor={l.pctFat} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button
                    onClick={() => {
                      const meta: MetaMarca = l.meta ?? {
                        marca: l.marca,
                        mesReferencia: '',  // vai ser sobrescrito no modal via mesRef prop
                        metaQtd: 0,
                        metaFaturamento: 0,
                        taxaPadrao: null,
                      }
                      onEdit(meta)
                    }}
                    style={{
                      padding: '4px 10px', border: '1px solid var(--ws-border)',
                      background: 'var(--ws-surface)', borderRadius: 6, fontSize: 12,
                      cursor: 'pointer', color: 'var(--ws-text-primary)',
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--ws-bg)', borderTop: '2px solid var(--ws-brand)' }}>
              <td style={{ ...tdStyle, fontWeight: 600 }}>WE SCALE (total)</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{total.metaQtd}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{total.realQtd}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{money(total.metaFat)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{money(total.realFat)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                <PctPill valor={total.metaFat > 0 ? (total.realFat / total.metaFat) * 100 : 0} />
              </td>
              <td style={tdStyle}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
  color: 'var(--ws-text-secondary)',
}
const tdStyle: React.CSSProperties = { padding: '12px 16px', color: 'var(--ws-text-primary)' }

function PctPill({ valor }: { valor: number }) {
  const tier = valor >= 100 ? 'ok' : valor >= 50 ? 'mid' : 'low'
  const map = {
    ok:  { bg: '#DCFCE7', fg: '#166534' },
    mid: { bg: '#FEF3C7', fg: '#92400E' },
    low: { bg: '#FEE2E2', fg: '#B91C1C' },
  }[tier]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: map.bg, color: map.fg, fontSize: 12, fontWeight: 500,
      minWidth: 50, textAlign: 'center',
    }}>
      {pct(valor, 0)}
    </span>
  )
}

/* ── Modal editor ───────────────────────────────────────────────────────── */

function MetaEditorModal({
  meta, mesRef, onClose, onSaved,
}: {
  meta: MetaMarca
  mesRef: string
  onClose: () => void
  onSaved: () => void
}) {
  const [qtd, setQtd] = useState<string>(String(meta.metaQtd))
  const [fat, setFat] = useState<string>(String(meta.metaFaturamento))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function salvar() {
    setSaving(true)
    setMsg(null)
    const result = await upsertMetaMarca({
      marca: meta.marca,
      mesReferencia: mesRef,
      metaQtd: Number(qtd) || 0,
      metaFaturamento: Number(fat) || 0,
      taxaPadrao: meta.taxaPadrao,
    })
    setSaving(false)
    if (!result.ok) {
      setMsg(`Erro: ${result.error}`)
      return
    }
    if (result.mocked) {
      setMsg('⚠️ Modo mock — não persistiu no banco (tabela ainda não existe)')
      return
    }
    onSaved()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--ws-surface)', borderRadius: 12, padding: 24,
          width: '90%', maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18 }}>
          Editar meta — {meta.marca}
        </h3>
        <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
          Mês: {MESES_DISPONIVEIS.find(m => m.key === mesRef)?.label}
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Meta de unidades</span>
            <input
              type="number" min="0" step="1" value={qtd}
              onChange={e => setQtd(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Meta de faturamento (R$)</span>
            <input
              type="number" min="0" step="100" value={fat}
              onChange={e => setFat(e.target.value)}
              style={inputStyle}
            />
          </label>
          {meta.taxaPadrao && (
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
              Ticket padrão: {money(meta.taxaPadrao)} · sugestão faturamento: {money(Number(qtd) * meta.taxaPadrao)}
            </div>
          )}
        </div>

        {msg && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 6,
            background: msg.startsWith('Erro') ? '#FEE2E2' : '#FEF3C7',
            color: msg.startsWith('Erro') ? '#B91C1C' : '#92400E',
            fontSize: 12,
          }}>
            {msg}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={salvar} disabled={saving} style={btnPrimary}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--ws-border)', borderRadius: 6,
  background: 'var(--ws-bg)', color: 'var(--ws-text-primary)', fontSize: 14,
  fontFamily: 'inherit',
}
const btnGhost: React.CSSProperties = {
  padding: '8px 16px', border: '1px solid var(--ws-border)', background: 'transparent',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, color: 'var(--ws-text-primary)',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', border: 'none', background: 'var(--ws-brand)',
  color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
}
