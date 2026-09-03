import { useState } from 'react'
import { Target, TrendingUp, Award, Users, Zap, Mail, TrendingDown, BarChart3, Trophy, Flag } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { useOkrs, updateOkrValor, USE_MOCK, type Okr } from '@/hooks/useOkrs'
import { useVendasSemestre, type VendaMarca } from '@/hooks/useVendasSemestre'
import { money, pct } from '@/lib/format'
import { MetaCopaB2B } from '@/pages/MetaCopaB2B'

type TabKey = 'copa' | 'vendas' | 'okrs'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'copa',   label: 'Acompanhamento Meta', icon: Trophy },
  { key: 'vendas', label: 'Meta de vendas',       icon: BarChart3 },
  { key: 'okrs',   label: 'OKRs',                 icon: Flag },
]

const RESPONSAVEIS_B2B = ['Godoy', 'Marina', 'Gabriel', 'Lara', 'Victor', 'Nadine', 'Vanessa']

function formatValor(v: number, unidade: Okr['unidade']): string {
  if (unidade === 'pct')   return pct(v, 1)
  if (unidade === 'moeda') return money(v)
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function calcAtingimento(okr: Okr): number {
  // Para 'aumentar': % = (atual / meta) * 100
  // Para 'reduzir':  % = ((partida - atual) / (partida - meta)) * 100
  //   onde 'partida' = valor inicial (valor_atual quando criado, no mock = 123.89 pra CP-MQL)
  // Simplificação: em ambos, tratar como % de progresso rumo à meta
  if (okr.direcao === 'aumentar') {
    return okr.valorMeta > 0 ? (okr.valorAtual / okr.valorMeta) * 100 : 0
  } else {
    // reduzir: quanto mais baixo, melhor. Se atingir a meta = 100%. Se estiver no ponto de partida = 0%
    // Aqui não temos "ponto de partida" armazenado — usa o próprio valorAtual como referência
    // se atual <= meta, atingiu 100%. Se muito acima, mostra progressos parciais
    if (okr.valorAtual <= okr.valorMeta) return 100
    // Fórmula: quanto mais próximo da meta, maior. Vamos usar (meta / atual) * 100
    return (okr.valorMeta / okr.valorAtual) * 100
  }
}

export function Okrs() {
  const { okrs, loading, reload } = useOkrs()
  const [editando, setEditando] = useState<Okr | null>(null)
  const [tab, setTab] = useState<TabKey>('copa')

  // Aba Acompanhamento Meta = página Copa completa (traz seu próprio PageTop)
  if (tab === 'copa') {
    return (
      <div>
        <TabsBar current={tab} onChange={setTab} />
        <MetaCopaB2B />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageTop
        title="Meta & OKRs"
        subtitle="Objetivos e resultados-chave do time · H2 2026"
        titleAside={
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              background: 'var(--ws-vinho-b)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            H2 2026
          </span>
        }
      />

      <TabsBar current={tab} onChange={setTab} inline />

      {USE_MOCK && tab === 'okrs' && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: 16,
            borderRadius: 8,
            background: '#FEF3C7',
            border: '1px solid #F59E0B',
            color: '#92400E',
            fontSize: 13,
          }}
        >
          ⚠️ <b>Modo mock:</b> tabela <code>okrs_h2</code> ainda não existe no Supabase de Marketing.
          Valores editados aqui não persistem até Gabriel rodar o SQL de criação.
        </div>
      )}

      {tab === 'vendas' && <VendasSemestreBloco />}

      {tab === 'okrs' && (
        <>
          <BonusExplainer />
          <OkrsUnificados okrs={okrs} loading={loading} onEditar={setEditando} />
        </>
      )}

      {editando && (
        <OkrEditorModal
          okr={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); reload() }}
        />
      )}
    </div>
  )
}

/* ── Barra de tabs ──────────────────────────────────────────────────────── */

function TabsBar({ current, onChange, inline = false }: { current: TabKey; onChange: (t: TabKey) => void; inline?: boolean }) {
  const wrap: React.CSSProperties = inline
    ? { margin: '0 0 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }
    : { padding: '16px 32px 0', maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 8, flexWrap: 'wrap' }

  return (
    <div style={wrap}>
      {TABS.map(({ key, label, icon: Icon }) => {
        const ativo = key === current
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 16px',
              border: ativo ? '1px solid var(--ws-verde)' : '1px solid var(--ws-border)',
              background: ativo ? 'var(--ws-verde)' : 'var(--ws-surface)',
              color: ativo ? '#fff' : 'var(--ws-text-primary)',
              borderRadius: 999, cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
              transition: 'all .15s',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ── OKRs unificados (B2B com dados + B2C placeholder) ──────────────────── */

function OkrsUnificados({
  okrs, loading, onEditar,
}: {
  okrs: Okr[]
  loading: boolean
  onEditar: (o: Okr) => void
}) {
  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          OKRs B2B · H2 2026
        </div>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
          Resultados-chave do time B2B
        </h2>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {loading ? (
            <div style={{ color: 'var(--ws-text-secondary)', padding: 40, textAlign: 'center' }}>Carregando…</div>
          ) : okrs.map((okr, i) => (
            <OkrCard key={okr.id} okr={okr} numero={i + 1} onEditar={onEditar} />
          ))}
        </div>
      </section>

      <section>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          OKRs B2C · em breve
        </div>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
          Resultados-chave do time B2C
        </h2>

        <div
          style={{
            marginTop: 20,
            background: 'var(--ws-surface)',
            border: '1px dashed var(--ws-border)',
            borderRadius: 16,
            padding: 40,
            textAlign: 'center',
            color: 'var(--ws-text-secondary)',
          }}
        >
          <Flag size={32} style={{ opacity: 0.4, marginBottom: 12 }} />
          <div style={{ fontSize: 15, color: 'var(--ws-text-primary)', fontWeight: 500 }}>
            OKRs de B2C serão adicionados aqui em breve.
          </div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Quando o time definir, os KRs entram nesta seção — mesma UI editora dos B2B.
          </div>
        </div>
      </section>
    </>
  )
}

/* ── Bloco 1: Como funciona o bônus (3 cards + destrava) ────────────────── */

function BonusExplainer() {
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        Bônus · H2 2026
      </div>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
        Como funciona o bônus
      </h2>

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <BonusCard
          bg="var(--ws-vinho-a)"
          textColor="#fff"
          icon={<Target size={22} color="var(--ws-vinho-a)" />}
          pct="50%"
          label="Empresa bater a meta"
        />
        <BonusCard
          bg="var(--ws-verde)"
          textColor="#fff"
          icon={<TrendingUp size={22} color="var(--ws-verde)" />}
          pct="30%"
          label="OKRs do time"
        />
        <BonusCard
          bg="#F5EBF0"
          textColor="var(--ws-text-primary)"
          icon={<Award size={22} color="var(--ws-text-primary)" />}
          pct="20%"
          label="Avaliação de desempenho"
        />
      </div>

      <p style={{ marginTop: 20, fontSize: 14, color: 'var(--ws-text-secondary)', lineHeight: 1.55 }}>
        É coletivo e herdado. As OKRs vêm da empresa, a gestão herda 4 delas e o time herda as mesmas quatro.
      </p>

      <div
        style={{
          marginTop: 16,
          background: 'color-mix(in srgb, var(--ws-verde) 8%, var(--ws-surface))',
          border: '1px solid color-mix(in srgb, var(--ws-verde) 30%, transparent)',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: 'var(--ws-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Zap size={20} color="var(--ws-verde)" />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ws-text-primary)', lineHeight: 1.55 }}>
          <b style={{ color: 'var(--ws-verde)' }}>Como destrava.</b>{' '}
          Quando a marca bate a meta gatilho e o time atinge no mínimo 80% da média das KRs. Se a marca não bate, ninguém recebe.
        </div>
      </div>
    </section>
  )
}

function BonusCard({
  bg, textColor, icon, pct, label,
}: {
  bg: string
  textColor: string
  icon: React.ReactNode
  pct: string
  label: string
}) {
  return (
    <div
      style={{
        background: bg,
        borderRadius: 16,
        padding: 20,
        color: textColor,
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 500, lineHeight: 1 }}>{pct}</div>
        <div style={{ fontSize: 14, marginTop: 8, opacity: 0.9 }}>{label}</div>
      </div>
    </div>
  )
}

/* ── Bloco 2: Vendas do semestre (H2 2026) ──────────────────────────────── */

function VendasSemestreBloco() {
  const { data, loading, error } = useVendasSemestre()

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        Vendas · H2 2026
      </div>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
        Vendas do semestre
      </h2>
      <p style={{ marginTop: 6, marginBottom: 0, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
        Vendas × receita por marca × mês. Meta vem da planilha oficial;
        realizado vem do CRM (deals ganhos). Consolidado Inbound + Prospecção Ativa.
      </p>

      {loading ? (
        <div style={{ color: 'var(--ws-text-secondary)', padding: 40, textAlign: 'center' }}>Carregando…</div>
      ) : error ? (
        <div style={{ padding: 20, color: 'var(--status-risco)', fontSize: 13 }}>
          Erro ao carregar vendas: {error}
        </div>
      ) : (
        <VendasTabela data={data} />
      )}
    </section>
  )
}

function VendasTabela({ data }: { data: ReturnType<typeof useVendasSemestre>['data'] }) {
  const meses = data.total.meses
  const cellHeader: React.CSSProperties = {
    padding: '10px 8px', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
    color: 'var(--ws-text-secondary)', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid var(--ws-border)',
  }
  const cellMarca: React.CSSProperties = {
    padding: '12px 12px', fontSize: 13, fontWeight: 500, color: 'var(--ws-text-primary)', textAlign: 'left',
    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ marginTop: 16, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...cellHeader, textAlign: 'left', paddingLeft: 14 }}>Marca</th>
              {meses.map(m => (
                <th key={m.mesKey} style={cellHeader}>{m.label}</th>
              ))}
              <th style={{ ...cellHeader, background: 'color-mix(in srgb, var(--ws-verde) 8%, transparent)' }}>H2 total</th>
            </tr>
          </thead>
          <tbody>
            {data.porMarca.map(marca => (
              <VendaLinha key={marca.marca} linha={marca} cellMarca={cellMarca} destaque={false} />
            ))}
            <VendaLinha linha={data.total} cellMarca={{ ...cellMarca, fontWeight: 600 }} destaque={true} />
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ws-text-secondary)', background: 'var(--ws-bg)', borderTop: '1px solid var(--ws-border)', display: 'flex', gap: 16, alignItems: 'center' }}>
        <BarChart3 size={13} />
        <span>Cada célula mostra <b>Meta</b> (unidades) · <b>R$</b> (receita da meta) · <b>Vendidos</b> · <b>Acum</b> (meta do mês + gap dos meses anteriores). Coluna H2 total: totais do semestre + acumulado até dez.</span>
      </div>
    </div>
  )
}

function VendaLinha({ linha, cellMarca, destaque }: { linha: VendaMarca; cellMarca: React.CSSProperties; destaque: boolean }) {
  const bg = destaque ? 'color-mix(in srgb, var(--ws-verde) 8%, transparent)' : 'transparent'

  // Pré-calcula meta acumulada por índice do mês.
  // Regra (Junior 03/09): meta_acum(M) = meta(M) + max(0, meta_acum_prev - vendas_prev)
  // Ex: Ago meta 5 · vendi 3. Set meta 5 → acum = 5 + (5-3) = 7.
  // O gap dos meses anteriores rola pra frente enquanto for positivo.
  const metasAcum: number[] = []
  linha.meses.forEach((m, i) => {
    if (i === 0) {
      metasAcum[i] = m.metaQtd
    } else {
      const gapAnterior = Math.max(0, metasAcum[i - 1] - linha.meses[i - 1].qtdRealizada)
      metasAcum[i] = m.metaQtd + gapAnterior
    }
  })

  // Total (H2): acumulado até o mês corrente = último mês com meta > 0 antes de dez.
  // Se todos os meses tiveram meta cadastrada, acumulado final = último item de metasAcum.
  const totalMetaAcum = metasAcum[metasAcum.length - 1]

  return (
    <tr style={{ background: bg }}>
      <td style={{ ...cellMarca, paddingLeft: 14 }}>{linha.marca}</td>
      {linha.meses.map((m, i) => (
        <td key={m.mesKey} style={{ padding: '10px 8px', borderBottom: '1px solid var(--ws-border)', textAlign: 'center', verticalAlign: 'top' }}>
          <VendaCelula qtd={m.qtdRealizada} metaQtd={m.metaQtd} metaReceita={m.metaReceita} metaAcum={metasAcum[i]} bold={false} />
        </td>
      ))}
      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--ws-border)', textAlign: 'center', verticalAlign: 'top', background: destaque ? 'transparent' : 'color-mix(in srgb, var(--ws-verde) 6%, transparent)' }}>
        <VendaCelula
          qtd={linha.totalQtd}
          metaQtd={linha.totalMetaQtd}
          metaReceita={linha.totalMetaReceita}
          metaAcum={totalMetaAcum}
          bold={true}
        />
      </td>
    </tr>
  )
}

function VendaCelula({ qtd, metaQtd, metaReceita, metaAcum, bold }: {
  qtd: number
  metaQtd: number
  metaReceita: number
  metaAcum: number
  bold: boolean
}) {
  const weight = bold ? 600 : 500
  const semMeta = metaQtd === 0 && metaReceita === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', fontFamily: 'var(--font-display)' }}>
      {/* 1. Meta do mês (unidades) */}
      <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
        Meta: <span style={{ color: 'var(--ws-text-primary)', fontWeight: weight }}>
          {semMeta ? '—' : `${metaQtd} un`}
        </span>
      </div>
      {/* 2. Meta de receita */}
      <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
        R$: <span style={{ color: 'var(--ws-text-primary)', fontWeight: weight }}>
          {semMeta ? '—' : moneyCompact(metaReceita)}
        </span>
      </div>
      {/* 3. Vendidos (destaque, maior) */}
      <div style={{ fontSize: 14, fontWeight: weight + 100, color: 'var(--ws-verde)' }}>
        {qtd > 0 ? `${qtd} vend` : '— vend'}
      </div>
      {/* 4. Meta acumulada */}
      <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
        Acum: <span style={{ color: 'var(--ws-vinho-b)', fontWeight: weight }}>
          {metaAcum > 0 ? `${metaAcum} un` : '—'}
        </span>
      </div>
    </div>
  )
}

function moneyCompact(v: number): string {
  if (v === 0) return '—'
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`
  return money(v)
}

/* ── OkrCard e modal ─────────────────────────────────────────────────────── */

function OkrCard({ okr, numero, onEditar }: { okr: Okr; numero: number; onEditar: (o: Okr) => void }) {
  const isReduzir = okr.direcao === 'reduzir'
  const IconTendencia = isReduzir ? TrendingDown : Mail
  const atingimento = calcAtingimento(okr)

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--ws-vinho-b)', textTransform: 'uppercase', marginBottom: 6 }}>
        Meta {numero} · B2B
      </div>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: 'var(--ws-text-primary)', lineHeight: 1.2 }}>
        {okr.titulo}
      </h3>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: 16, alignItems: 'stretch' }}>
        {/* Card teal — valor da meta */}
        <div
          style={{
            background: 'var(--ws-verde)',
            color: '#fff',
            borderRadius: 16,
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 180,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconTendencia size={22} color="#fff" />
          </div>
          <div>
            {isReduzir ? (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, lineHeight: 1 }}>
                {formatValor(okr.valorAtual, okr.unidade)} <span style={{ fontSize: 20, opacity: 0.8 }}>→</span>{' '}
                {formatValor(okr.valorMeta, okr.unidade)}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 500, lineHeight: 1 }}>
                {formatValor(okr.valorMeta, okr.unidade)}
              </div>
            )}
            <div style={{ fontSize: 13, marginTop: 8, opacity: 0.9 }}>{okr.descricao}</div>
          </div>
        </div>

        {/* Card responsável */}
        <div
          style={{
            background: 'var(--ws-surface)',
            border: '1px solid var(--ws-border)',
            borderRadius: 16,
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minHeight: 180,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'var(--ws-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={18} color="var(--ws-text-primary)" />
            </div>
            <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', fontWeight: 500 }}>
              Responsável
            </div>
          </div>

          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
              Time B2B · todos herdam
            </div>
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ws-text-secondary)', lineHeight: 1.5 }}>
              {RESPONSAVEIS_B2B.join(' · ')}
            </div>
          </div>
        </div>
      </div>

      {/* Progresso + Editar */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
          <span>Progresso atual:</span>
          <strong style={{ color: atingimento >= 100 ? 'var(--status-positivo)' : atingimento >= 50 ? 'var(--status-atencao)' : 'var(--status-risco)' }}>
            {pct(Math.min(999, atingimento), 0)}
          </strong>
          {okr.atualizadoEm && (
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
              · atualizado em {new Date(okr.atualizadoEm).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
        <button
          onClick={() => onEditar(okr)}
          style={{
            padding: '8px 16px',
            border: '1px solid var(--ws-border)',
            background: 'var(--ws-surface)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ws-text-primary)',
          }}
        >
          Atualizar valor
        </button>
      </div>
    </div>
  )
}

/* ── Modal editor ───────────────────────────────────────────────────────── */

function OkrEditorModal({
  okr, onClose, onSaved,
}: {
  okr: Okr
  onClose: () => void
  onSaved: () => void
}) {
  const [valor, setValor] = useState<string>(String(okr.valorAtual))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function salvar() {
    setSaving(true); setMsg(null)
    const result = await updateOkrValor({ id: okr.id, valorAtual: Number(valor) || 0 })
    setSaving(false)
    if (!result.ok) { setMsg(`Erro: ${result.error}`); return }
    if (result.mocked) { setMsg('⚠️ Modo mock — não persistiu (tabela okrs_h2 ainda não existe)'); return }
    onSaved()
  }

  const unidadeLabel = okr.unidade === 'pct' ? '%' : okr.unidade === 'moeda' ? 'R$' : ''

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--ws-surface)', borderRadius: 12, padding: 24,
          width: '90%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>
          Atualizar valor atual
        </h3>
        <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
          {okr.titulo}
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            Valor atual {unidadeLabel && `(${unidadeLabel})`}
          </label>
          <input
            type="number"
            step={okr.unidade === 'pct' ? '0.1' : '0.01'}
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            style={{
              padding: '10px 14px', border: '1px solid var(--ws-border)', borderRadius: 8,
              background: 'var(--ws-bg)', fontSize: 15, fontFamily: 'inherit',
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
            Meta: {formatValor(okr.valorMeta, okr.unidade)} ({okr.direcao === 'reduzir' ? 'reduzir' : 'atingir'})
          </div>
        </div>

        {msg && (
          <div
            style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 6,
              background: msg.startsWith('Erro') ? '#FEE2E2' : '#FEF3C7',
              color: msg.startsWith('Erro') ? '#B91C1C' : '#92400E', fontSize: 12,
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 16px', border: '1px solid var(--ws-border)', background: 'transparent',
              borderRadius: 6, cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            style={{
              padding: '8px 16px', border: 'none', background: 'var(--ws-verde)',
              color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
