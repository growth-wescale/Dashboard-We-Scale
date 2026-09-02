import { useState } from 'react'
import { Target, TrendingUp, Award, Users, Zap, Mail, TrendingDown, BarChart3 } from 'lucide-react'
import { PageTop } from '@/components/ui/PageTop'
import { useOkrs, updateOkrValor, USE_MOCK, type Okr } from '@/hooks/useOkrs'
import { useVendasSemestre, type VendaMarca, type VendaMes } from '@/hooks/useVendasSemestre'
import { money, pct } from '@/lib/format'

const SALARIO_ANALISTA = 5000
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

      {USE_MOCK && (
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

      <BonusExplainer />
      <CleitinhoExample />
      <VendasSemestreBloco />
      <OkrsList okrs={okrs} loading={loading} onEditar={setEditando} />

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

/* ── Bloco 2: Simulado Cleitinho ────────────────────────────────────────── */

function CleitinhoExample() {
  const semestre = SALARIO_ANALISTA / 2   // 1 salário / 2 apurações
  const ano = SALARIO_ANALISTA
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        Simulado
      </div>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
        O exemplo do Cleitinho
      </h2>

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 24, alignItems: 'flex-start' }}>
        {/* Avatar / persona */}
        <div
          style={{
            background: 'color-mix(in srgb, var(--ws-verde) 15%, var(--ws-surface))',
            borderRadius: 20,
            padding: 24,
            textAlign: 'center',
            aspectRatio: '1 / 1.05',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 999,
              background: 'var(--ws-vinho-b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 32,
              fontWeight: 600,
            }}
          >
            C
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--ws-text-primary)' }}>Cleitinho</div>
            <div style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--ws-text-secondary)', textTransform: 'uppercase', marginTop: 4 }}>
              Analista · exemplo
            </div>
          </div>
        </div>

        {/* Detalhes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              background: 'var(--ws-surface)',
              border: '1px solid var(--ws-border)',
              borderRadius: 12,
              padding: '14px 18px',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
              Analista · salário {money(SALARIO_ANALISTA)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 4 }}>
              Teto do bônus: 1 salário por semestre dividido por 2 no ano (duas apurações).
            </div>
          </div>

          <CleitinhoRow pct="50%" label="Empresa bater a meta" />
          <CleitinhoRow pct="30%" label="OKRs do time" />
          <CleitinhoRow pct="20%" label="Avaliação de desempenho" />

          <div
            style={{
              background: 'var(--ws-vinho-a)',
              color: '#fff',
              borderRadius: 12,
              padding: '16px 20px',
              marginTop: 6,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-verde)', letterSpacing: '.06em' }}>Cenário cheio</div>
            <div style={{ marginTop: 4, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>
              {money(semestre)} <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.75 }}>no semestre</span>
              {' · '}
              {money(ano)} <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.75 }}>no ano</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CleitinhoRow({ pct, label }: { pct: string; label: string }) {
  return (
    <div
      style={{
        background: 'var(--ws-surface)',
        border: '1px solid var(--ws-border)',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ws-vinho-b)', minWidth: 60 }}>{pct}</div>
      <div style={{ fontSize: 14, color: 'var(--ws-text-primary)' }}>{label}</div>
    </div>
  )
}

/* ── Bloco 3: Vendas do semestre (H2 2026) ──────────────────────────────── */

function VendasSemestreBloco() {
  const { data, loading, error } = useVendasSemestre()
  const [visao, setVisao] = useState<'receita' | 'qtd'>('receita')

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        Vendas · H2 2026
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
          Vendas do semestre
        </h2>
        <VisaoToggle visao={visao} onChange={setVisao} />
      </div>
      <p style={{ marginTop: 6, marginBottom: 0, fontSize: 13, color: 'var(--ws-text-secondary)' }}>
        Realizado por marca × mês, comparado com a meta cadastrada. Consolidado Inbound + Prospecção Ativa.
      </p>

      {loading ? (
        <div style={{ color: 'var(--ws-text-secondary)', padding: 40, textAlign: 'center' }}>Carregando…</div>
      ) : error ? (
        <div style={{ padding: 20, color: 'var(--status-risco)', fontSize: 13 }}>
          Erro ao carregar vendas: {error}
        </div>
      ) : (
        <VendasTabela data={data} visao={visao} />
      )}
    </section>
  )
}

function VisaoToggle({ visao, onChange }: { visao: 'receita' | 'qtd'; onChange: (v: 'receita' | 'qtd') => void }) {
  const btn = (ativo: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    border: 'none',
    background: ativo ? 'var(--ws-verde)' : 'transparent',
    color: ativo ? '#fff' : 'var(--ws-text-secondary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all .15s',
  })
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 3, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 8 }}>
      <button style={btn(visao === 'receita')} onClick={() => onChange('receita')}>Receita</button>
      <button style={btn(visao === 'qtd')} onClick={() => onChange('qtd')}>Vendas</button>
    </div>
  )
}

function VendasTabela({ data, visao }: { data: ReturnType<typeof useVendasSemestre>['data']; visao: 'receita' | 'qtd' }) {
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
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
              <VendaLinha key={marca.marca} linha={marca} visao={visao} cellMarca={cellMarca} destaque={false} />
            ))}
            <VendaLinha linha={data.total} visao={visao} cellMarca={{ ...cellMarca, fontWeight: 600 }} destaque={true} />
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ws-text-secondary)', background: 'var(--ws-bg)', borderTop: '1px solid var(--ws-border)', display: 'flex', gap: 16, alignItems: 'center' }}>
        <BarChart3 size={13} />
        <span>Cada célula mostra o realizado · abaixo, a % vs meta cadastrada. Cinza = sem meta. Cores: verde ≥100%, âmbar 50-99%, vermelho &lt;50%.</span>
      </div>
    </div>
  )
}

function VendaLinha({ linha, visao, cellMarca, destaque }: { linha: VendaMarca; visao: 'receita' | 'qtd'; cellMarca: React.CSSProperties; destaque: boolean }) {
  const bg = destaque ? 'color-mix(in srgb, var(--ws-verde) 8%, transparent)' : 'transparent'
  return (
    <tr style={{ background: bg }}>
      <td style={{ ...cellMarca, paddingLeft: 14 }}>{linha.marca}</td>
      {linha.meses.map(m => (
        <td key={m.mesKey} style={{ padding: '10px 8px', borderBottom: '1px solid var(--ws-border)', textAlign: 'center', verticalAlign: 'top' }}>
          <VendaCelula mes={m} visao={visao} />
        </td>
      ))}
      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--ws-border)', textAlign: 'center', verticalAlign: 'top', background: destaque ? 'transparent' : 'color-mix(in srgb, var(--ws-verde) 6%, transparent)' }}>
        <VendaTotal linha={linha} visao={visao} />
      </td>
    </tr>
  )
}

function VendaCelula({ mes, visao }: { mes: VendaMes; visao: 'receita' | 'qtd' }) {
  const realizado = visao === 'receita' ? mes.receitaRealizada : mes.qtdRealizada
  const meta = visao === 'receita' ? mes.metaReceita : mes.metaQtd
  const pctAtingimento = meta > 0 ? (realizado / meta) * 100 : null

  const corPct = pctAtingimento === null ? 'var(--ws-text-secondary)'
    : pctAtingimento >= 100 ? 'var(--status-positivo)'
    : pctAtingimento >= 50 ? 'var(--status-atencao)'
    : 'var(--status-risco)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ws-text-primary)', fontFamily: 'var(--font-display)' }}>
        {visao === 'receita' ? moneyCompact(realizado) : realizado.toLocaleString('pt-BR')}
      </div>
      <div style={{ fontSize: 11, color: corPct, fontWeight: 500 }}>
        {pctAtingimento === null ? 'sem meta' : `${pctAtingimento.toFixed(0)}%`}
      </div>
    </div>
  )
}

function VendaTotal({ linha, visao }: { linha: VendaMarca; visao: 'receita' | 'qtd' }) {
  const realizado = visao === 'receita' ? linha.totalReceita : linha.totalQtd
  const meta = visao === 'receita' ? linha.totalMetaReceita : linha.totalMetaQtd
  const pctAtingimento = meta > 0 ? (realizado / meta) * 100 : null

  const corPct = pctAtingimento === null ? 'var(--ws-text-secondary)'
    : pctAtingimento >= 100 ? 'var(--status-positivo)'
    : pctAtingimento >= 50 ? 'var(--status-atencao)'
    : 'var(--status-risco)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-primary)', fontFamily: 'var(--font-display)' }}>
        {visao === 'receita' ? moneyCompact(realizado) : realizado.toLocaleString('pt-BR')}
      </div>
      <div style={{ fontSize: 11, color: corPct, fontWeight: 600 }}>
        {pctAtingimento === null ? 'sem meta' : `${pctAtingimento.toFixed(0)}%`}
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

/* ── Bloco 4: OKRs (2 metas) ────────────────────────────────────────────── */

function OkrsList({
  okrs, loading, onEditar,
}: {
  okrs: Okr[]
  loading: boolean
  onEditar: (o: Okr) => void
}) {
  return (
    <section>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        OKRs · H2 2026
      </div>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ws-text-primary)' }}>
        Resultados-chave do time
      </h2>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {loading ? (
          <div style={{ color: 'var(--ws-text-secondary)', padding: 40, textAlign: 'center' }}>Carregando…</div>
        ) : okrs.map((okr, i) => (
          <OkrCard key={okr.id} okr={okr} numero={i + 1} onEditar={onEditar} />
        ))}
      </div>
    </section>
  )
}

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
