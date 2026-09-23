import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMetasClosers, CLOSERS_ATIVOS, type CloserMeta } from '@/hooks/useMetasClosers'
import { useMetasSDRs, SDRS_ATIVOS } from '@/hooks/useMetasSDRs'
import { useCorridaPerformance } from '@/hooks/useCorridaPerformance'
import type { LinhaTrilha } from '@/lib/corridaPerformance'
import {
  VOLTAS_F1,
  janelasDasVoltas,
  pctDecorridoJanela,
  fatorMetaCloser,
  fatorMetaSdr,
  diaDaCampanha,
  voltaDoDia,
} from '@/constants/metasCampanhaF1'
import { money, pct, nfCeil } from '@/lib/format'

/**
 * Campanha de Metas em modo TV (`/gp-setembro/tv`) — tela do time.
 *
 * Tela única 16:9, sem menu e sem rolagem, só com o essencial da corrida:
 * meta do time no mês, closers e SDRs na volta atual e a pontuação da
 * Corrida de Performance. Tudo em `vh` pra escalar em qualquer TV. Não tem
 * filtro: a tela alterna sozinha a cada 15s entre a VOLTA atual (dados e metas
 * só da volta, que vira sozinha na troca de semana) e o MÊS (tudo acumulado).
 * Os dois recortes ficam carregados ao mesmo tempo, então a troca é instantânea.
 *
 * Os hooks já recarregam os dados a cada 5 min; a página inteira recarrega de
 * hora em hora pra pegar deploy novo sem ninguém mexer na TV.
 */

const MES_ATIVO = '2026-09-01'
const MES_LABEL = 'Setembro 2026'
const DIAS_MES = 30
const RECARREGA_PAGINA_MS = 60 * 60 * 1000
/** Tempo em cada modo (volta ↔ mês). 15s: cada recorte aparece 2x por minuto. */
const TROCA_MODO_MS = 15_000

type Modo = 'volta' | 'mes'

const BG = '#0B0B10'
const PAINEL = 'rgba(255,255,255,0.045)'
const BORDA = 'rgba(255,255,255,0.08)'
const TEXTO_2 = 'rgba(255,255,255,0.62)'
const TEXTO_3 = 'rgba(255,255,255,0.42)'
const VERMELHO = '#E10600'

const vh = (n: number) => `${n}vh`

function moneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M'
  if (abs >= 1_000) return 'R$ ' + Math.round(n / 1_000).toLocaleString('pt-BR') + 'k'
  return money(n)
}

function pontosFmt(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function primeiroNome(nome: string): string {
  return nome.split(' ')[0]
}

/** Hora atual, atualizada a cada 30s (e o dia da campanha junto). */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return agora
}

export function CampanhaMetasTv() {
  const agora = useAgora()
  const dia = diaDaCampanha(agora)
  const volta = voltaDoDia(dia)
  const voltaDef = VOLTAS_F1[volta - 1]
  const voltasSel = useMemo(() => [volta], [volta])
  const janelas = useMemo(() => janelasDasVoltas(voltasSel), [voltasSel])

  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), RECARREGA_PAGINA_MS)
    return () => clearTimeout(t)
  }, [])

  // Alterna volta ↔ mês. `rodada` reinicia o cronômetro quando alguém clica num botão.
  const [modo, setModo] = useState<Modo>('volta')
  const [rodada, setRodada] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setModo(m => (m === 'volta' ? 'mes' : 'volta')), TROCA_MODO_MS)
    return () => clearTimeout(t)
  }, [modo, rodada])
  const escolherModo = (m: Modo) => { setModo(m); setRodada(r => r + 1) }
  const ehMes = modo === 'mes'

  // Os dois recortes carregados juntos: a troca não espera consulta.
  const { closers: closersMes, loading: loadingMes } = useMetasClosers(MES_ATIVO)
  const { closers: closersVoltaRaw, loading: loadingVolta } = useMetasClosers(MES_ATIVO, janelas)
  const { sdrs, loading: loadingSdrs } = useMetasSDRs(MES_ATIVO)
  const corridaVolta = useCorridaPerformance(MES_ATIVO, janelas)
  const corridaMes = useCorridaPerformance(MES_ATIVO)

  // Na volta, a meta mensal é escalada pra volta (mesma regra da página da campanha).
  const closersVolta = useMemo(() =>
    closersVoltaRaw.map(c => {
      const f = fatorMetaCloser(c.nome, voltasSel)
      const metaFinanceira = c.metaFinanceira * f
      return {
        ...c,
        metaFinanceira,
        metaQtdVendas: c.metaQtdVendas * f,
        pctAtingimento: metaFinanceira > 0 ? (c.realizado / metaFinanceira) * 100 : 0,
      }
    }),
  [closersVoltaRaw, voltasSel])

  const closers = ehMes ? closersMes : closersVolta
  const loadingClosers = ehMes ? loadingMes : loadingVolta
  const corrida = ehMes ? corridaMes : corridaVolta

  const ranking = useMemo(
    () => [...closers].sort((a, b) => b.pctAtingimento - a.pctAtingimento || b.realizado - a.realizado),
    [closers],
  )

  const time = useMemo(() => closers.reduce(
    (acc, c) => ({
      metaFin: acc.metaFin + c.metaFinanceira,
      metaQtd: acc.metaQtd + c.metaQtdVendas,
      realFin: acc.realFin + c.realizado,
      realQtd: acc.realQtd + c.realizadoQtd,
    }),
    { metaFin: 0, metaQtd: 0, realFin: 0, realQtd: 0 },
  ), [closers])

  const fatorSdr = ehMes ? 1 : fatorMetaSdr(voltasSel)
  const rotuloPeriodo = ehMes ? 'Mês de Setembro' : (voltaDef?.label ?? '')
  const deQue = ehMes ? 'do mês' : 'da volta'

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'hidden', background: BG, color: '#fff',
      backgroundImage: 'radial-gradient(ellipse at 15% 0%, rgba(225,6,0,0.16), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(0,210,190,0.08), transparent 50%)',
      fontFamily: 'var(--font-body)',
      display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: vh(2),
      padding: `${vh(2.6)} ${vh(3.6)}`,
    }}>
      <style>{`
        @keyframes tvEntra { from { opacity: 0; transform: translateY(0.8vh) } to { opacity: 1; transform: none } }
        @keyframes tvProgresso { from { width: 0 } to { width: 100% } }
      `}</style>

      <Cabecalho
        volta={volta}
        voltaLabel={voltaDef?.label ?? ''}
        dia={dia}
        agora={agora}
        modo={modo}
        rodada={rodada}
        onModo={escolherModo}
      />

      <div key={modo} style={{
        display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: vh(2), minHeight: 0,
        animation: 'tvEntra 500ms ease-out',
      }}>
        <MetaTime
          loading={loadingClosers}
          {...time}
          titulo={rotuloPeriodo}
          fimLabel={ehMes ? 'bandeirada · 30 set' : `fim da volta · ${voltaDef?.diaFim ?? ''} set`}
          pctEsperado={ehMes ? pctDecorridoJanela('mensal', [], dia) : pctDecorridoJanela('semanal', voltasSel, dia)}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: vh(2), minHeight: 0 }}>
          <Painel titulo="Closers" sub={`${rotuloPeriodo} · % da meta ${deQue}`}>
            <ClosersPodio ranking={ranking} loading={loadingClosers} />
          </Painel>
          <Painel titulo="SDRs" sub={`${rotuloPeriodo} · realizado / meta ${deQue}`}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', gap: vh(1) }}>
              {SDRS_ATIVOS.map(s => {
                const meta = sdrs.find(m => m.nome === s.nome)
                const real = corrida.sdrRealizado.get(s.nome)
                return (
                  <SdrLinha
                    key={s.nome}
                    nome={s.nome}
                    foto={s.foto}
                    iniciais={s.iniciais}
                    cor={s.cor}
                    sql={real?.sql ?? 0}
                    metaSql={(meta?.metaSql ?? 0) * fatorSdr}
                    rr={real?.rr ?? 0}
                    metaRr={(meta?.metaReuniao ?? 0) * fatorSdr}
                    loading={loadingSdrs || corrida.loading}
                  />
                )
              })}
            </div>
          </Painel>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: vh(2) }}>
          <Placar titulo="Corrida de Performance · Trilha SDR" periodo={deQue} unidade="RR" linhas={corrida.sdrTrilha} visual={SDRS_ATIVOS} loading={corrida.loading} />
          <Placar titulo="Corrida de Performance · Trilha Closer" periodo={deQue} unidade="vendas" linhas={corrida.closerTrilha} visual={CLOSERS_ATIVOS} loading={corrida.loading} />
        </div>
      </div>
    </div>
  )
}

/* ── Cabeçalho ──────────────────────────────────────────────────────────── */

function Cabecalho({ volta, voltaLabel, dia, agora, modo, rodada, onModo }: {
  volta: number; voltaLabel: string; dia: number; agora: Date
  modo: Modo; rodada: number; onModo: (m: Modo) => void
}) {
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const restantes = Math.max(0, DIAS_MES - dia)
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: vh(3) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: vh(1.8) }}>
        <div style={{ width: vh(0.7), height: vh(6.5), background: VERMELHO, borderRadius: 2 }} />
        <div>
          <Link to="/gp-setembro" style={{ textDecoration: 'none', color: VERMELHO, fontSize: vh(1.5), fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase' }}>
            Fórmula 1 · {MES_LABEL}
          </Link>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: vh(4.6), fontWeight: 500, lineHeight: 1 }}>
            GP We Scale
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: vh(1.2) }}>
        <ModoBotao ativo={modo === 'volta'} rodada={rodada} onClick={() => onModo('volta')}>
          Volta {volta} de 4 · {voltaLabel.split('·')[1]?.trim()}
        </ModoBotao>
        <ModoBotao ativo={modo === 'mes'} rodada={rodada} onClick={() => onModo('mes')}>
          Mês de Setembro
        </ModoBotao>
        <Chip>{restantes === 0 ? 'Bandeirada!' : `${restantes} ${restantes === 1 ? 'dia' : 'dias'} para a bandeirada`}</Chip>
        <div style={{ marginLeft: vh(1.5), textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: vh(4), fontWeight: 500, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{hora}</div>
          <div style={{ fontSize: vh(1.3), color: TEXTO_3, marginTop: vh(0.4) }}>atualiza a cada 5 min</div>
        </div>
      </div>
    </header>
  )
}

/** Botão de modo: o ativo fica vermelho, com uma barrinha que enche até a próxima troca. */
function ModoBotao({ ativo, rodada, onClick, children }: {
  ativo: boolean; rodada: number; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      position: 'relative', overflow: 'hidden', cursor: 'pointer', whiteSpace: 'nowrap',
      padding: `${vh(1)} ${vh(2)}`, borderRadius: 999, fontSize: vh(1.9), fontWeight: 500,
      fontFamily: 'inherit', color: ativo ? '#fff' : TEXTO_2,
      background: ativo ? VERMELHO : 'rgba(255,255,255,0.07)',
      border: `1px solid ${ativo ? VERMELHO : BORDA}`,
      transition: 'background 300ms ease, color 300ms ease',
    }}>
      {children}
      {ativo && (
        <span key={rodada + String(ativo)} style={{
          position: 'absolute', left: 0, bottom: 0, height: vh(0.45),
          background: 'rgba(255,255,255,0.75)',
          animation: `tvProgresso ${TROCA_MODO_MS}ms linear forwards`,
        }} />
      )}
    </button>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: vh(1), whiteSpace: 'nowrap',
      padding: `${vh(1)} ${vh(2)}`, borderRadius: 999, fontSize: vh(1.9), fontWeight: 500,
      background: 'rgba(255,255,255,0.07)',
      border: `1px solid ${BORDA}`,
    }}>
      {children}
    </span>
  )
}

/* ── Meta do time (volta ou mês) ─────────────────────────────────────────────────── */

function MetaTime({ loading, realFin, metaFin, realQtd, metaQtd, pctEsperado, titulo, fimLabel }: {
  loading: boolean; realFin: number; metaFin: number; realQtd: number; metaQtd: number; pctEsperado: number
  titulo: string; fimLabel: string
}) {
  const pctReal = metaFin > 0 ? (realFin / metaFin) * 100 : 0
  const status = pctReal < pctEsperado - 5 ? 'abaixo' : pctReal > pctEsperado + 5 ? 'acima' : 'no'
  const cor = { abaixo: '#F87171', no: '#60A5FA', acima: '#4ADE80' }[status]
  const rotulo = { abaixo: 'abaixo do ritmo', no: 'no ritmo', acima: 'acima do ritmo' }[status]
  return (
    <section style={{
      background: PAINEL, border: `1px solid ${BORDA}`, borderRadius: vh(1.6),
      padding: `${vh(1.8)} ${vh(2.6)}`,
      display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: vh(3.5),
    }}>
      <div>
        <Rotulo>Meta do time · {titulo}</Rotulo>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: vh(1.4), marginTop: vh(0.6) }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: vh(5.4), fontWeight: 500, lineHeight: 1, color: VERMELHO }}>
            {loading ? '—' : money(realFin)}
          </span>
          <span style={{ fontSize: vh(2.1), color: TEXTO_2, whiteSpace: 'nowrap' }}>
            de {moneyCompact(metaFin)} · {realQtd}/{nfCeil(metaQtd)} un
          </span>
        </div>
      </div>

      <div>
        <div style={{ position: 'relative', height: vh(2.2), background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
          <div style={{
            width: `${Math.min(100, pctReal)}%`, height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, #7a0300, ${VERMELHO})`, transition: 'width 600ms ease',
          }} />
          <div title="ritmo esperado" style={{
            position: 'absolute', top: `-${vh(0.8)}`, bottom: `-${vh(0.8)}`, left: `${Math.min(100, pctEsperado)}%`,
            width: 3, background: '#fff', borderRadius: 2,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: vh(1), fontSize: vh(1.5), color: TEXTO_3 }}>
          <span>ritmo esperado hoje · {pct(pctEsperado, 0)}</span>
          <span>{fimLabel}</span>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: vh(5.4), fontWeight: 500, lineHeight: 1 }}>
          {loading ? '—' : pct(pctReal, 0)}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: vh(0.7), marginTop: vh(0.7), fontSize: vh(1.6), color: cor, fontWeight: 600 }}>
          <span style={{ width: vh(0.9), height: vh(0.9), borderRadius: 999, background: cor }} />
          {rotulo}
        </div>
      </div>
    </section>
  )
}

/* ── Painéis ────────────────────────────────────────────────────────────── */

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: vh(1.45), fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: TEXTO_2 }}>
      {children}
    </div>
  )
}

function Painel({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: PAINEL, border: `1px solid ${BORDA}`, borderRadius: vh(1.6),
      padding: `${vh(1.8)} ${vh(2.4)}`, display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: vh(2), marginBottom: vh(1.4) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: vh(1) }}>
          <div style={{ width: vh(1), height: vh(1), background: VERMELHO }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: vh(2.8), fontWeight: 500 }}>{titulo}</span>
        </div>
        <span style={{ fontSize: vh(1.5), color: TEXTO_3 }}>{sub}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </section>
  )
}

function Avatar({ foto, iniciais, cor, tamanho }: { foto?: string; iniciais: string; cor: string; tamanho: number }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <div style={{
      width: vh(tamanho), height: vh(tamanho), borderRadius: 999, flexShrink: 0, overflow: 'hidden',
      border: `${vh(0.35)} solid ${cor}`, background: '#1c1c24',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: vh(tamanho * 0.3), fontWeight: 600, color: cor,
    }}>
      {foto && !falhou
        ? <img src={foto} alt="" onError={() => setFalhou(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }} />
        : iniciais}
    </div>
  )
}

/* ── Closers: pódio com barra realizado × meta da volta ─────────────────── */

function ClosersPodio({ ranking, loading }: { ranking: CloserMeta[]; loading: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, ranking.length)}, 1fr)`, gap: vh(2), height: '100%' }}>
      {ranking.map((c, i) => {
        const temMeta = c.metaFinanceira > 0
        const altura = temMeta ? Math.min(100, c.pctAtingimento) : 0
        const lider = i === 0 && c.realizado > 0
        return (
          <div key={c.nome} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 0 }}>
            <div style={{ height: vh(2.6), fontSize: vh(2.2), lineHeight: 1 }}>{lider ? '👑' : ''}</div>
            <div style={{ position: 'relative' }}>
              <Avatar foto={c.foto} iniciais={c.iniciais} cor={c.cor} tamanho={10} />
              <span style={{
                position: 'absolute', bottom: `-${vh(0.6)}`, left: '50%', transform: 'translateX(-50%)',
                background: lider ? VERMELHO : '#26262f', border: `1px solid ${BORDA}`,
                padding: `${vh(0.2)} ${vh(1)}`, borderRadius: 999, fontSize: vh(1.4), fontWeight: 700,
              }}>P{i + 1}</span>
            </div>
            <div style={{ marginTop: vh(1.3), fontSize: vh(2), fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
              {primeiroNome(c.nome)}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: vh(4.6), fontWeight: 500, lineHeight: 1.05, color: c.cor }}>
              {loading ? '—' : temMeta ? pct(c.pctAtingimento, 0) : '—'}
            </div>
            <div style={{ fontSize: vh(1.6), color: TEXTO_2, textAlign: 'center', whiteSpace: 'nowrap' }}>
              {moneyCompact(c.realizado)} · {c.realizadoQtd} {c.realizadoQtd === 1 ? 'venda' : 'vendas'}
            </div>

            <div style={{
              flex: 1, minHeight: vh(4), width: '62%', marginTop: vh(1.2),
              border: `2px solid rgba(255,255,255,0.18)`, borderRadius: vh(0.8),
              display: 'flex', alignItems: 'flex-end', overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                width: '100%', height: `${altura}%`, transition: 'height 600ms ease',
                background: `linear-gradient(180deg, ${c.cor}, ${c.cor}55)`,
              }} />
            </div>
            <div style={{ marginTop: vh(0.6), fontSize: vh(1.4), color: TEXTO_3, whiteSpace: 'nowrap' }}>
              meta {temMeta ? moneyCompact(c.metaFinanceira) : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── SDRs: SQL e RR da volta ────────────────────────────────────────────── */

function SdrLinha({ nome, foto, iniciais, cor, sql, metaSql, rr, metaRr, loading }: {
  nome: string; foto?: string; iniciais: string; cor: string
  sql: number; metaSql: number; rr: number; metaRr: number; loading: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `auto ${vh(13)} 1fr 1fr`, alignItems: 'center', gap: vh(1.8) }}>
      <Avatar foto={foto} iniciais={iniciais} cor={cor} tamanho={6.4} />
      <div style={{ fontSize: vh(2.1), fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {primeiroNome(nome)}
      </div>
      <MiniBarra rotulo="SQL" valor={sql} meta={metaSql} cor={cor} loading={loading} />
      <MiniBarra rotulo="Diagnóstico" valor={rr} meta={metaRr} cor={cor} loading={loading} />
    </div>
  )
}

function MiniBarra({ rotulo, valor, meta, cor, loading }: { rotulo: string; valor: number; meta: number; cor: string; loading: boolean }) {
  const p = meta > 0 ? (valor / meta) * 100 : 0
  const metaInt = Math.ceil(meta)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: vh(1) }}>
        <span style={{ fontSize: vh(1.4), color: TEXTO_3, textTransform: 'uppercase', letterSpacing: '.1em' }}>{rotulo}</span>
        <span style={{ fontSize: vh(2.3), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {loading ? '—' : valor}
          <span style={{ fontSize: vh(1.6), color: TEXTO_3, fontWeight: 400 }}> / {metaInt > 0 ? metaInt : '—'}</span>
        </span>
      </div>
      <div style={{ marginTop: vh(0.6), height: vh(1), background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, p)}%`, height: '100%', background: p >= 100 ? '#4ADE80' : cor, borderRadius: 999, transition: 'width 600ms ease' }} />
      </div>
    </div>
  )
}

/* ── Placar da Corrida de Performance ───────────────────────────────────── */

function Placar({ titulo, periodo, unidade, linhas, visual, loading }: {
  titulo: string
  periodo: string
  unidade: 'RR' | 'vendas'
  linhas: LinhaTrilha[]
  visual: ReadonlyArray<{ nome: string; iniciais: string; cor: string; foto?: string }>
  loading: boolean
}) {
  const porNome = new Map(linhas.map(l => [l.nome, l]))
  const ordenado = [...visual].sort((a, b) =>
    (porNome.get(b.nome)?.pontos ?? 0) - (porNome.get(a.nome)?.pontos ?? 0))
  const max = Math.max(1, ...linhas.map(l => l.pontos))
  return (
    <section style={{ background: PAINEL, border: `1px solid ${BORDA}`, borderRadius: vh(1.6), padding: `${vh(1.5)} ${vh(2.4)}` }}>
      <Rotulo>{titulo} · pontos {periodo}</Rotulo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: vh(1.6), marginTop: vh(1.2) }}>
        {ordenado.map((p, i) => {
          const l = porNome.get(p.nome)
          const pontos = l?.pontos ?? 0
          const vol = l?.volume ?? 0
          return (
            <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: vh(1.1), minWidth: 0 }}>
              <div style={{ width: vh(0.5), alignSelf: 'stretch', background: p.cor, borderRadius: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: vh(1.8), fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ fontSize: vh(1.4), fontWeight: 700, color: i === 0 && pontos > 0 ? VERMELHO : TEXTO_3, marginRight: vh(0.7) }}>P{i + 1}</span>
                  {primeiroNome(p.nome)}
                </div>
                <div style={{ marginTop: vh(0.5), height: vh(0.6), background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${(pontos / max) * 100}%`, height: '100%', background: p.cor, transition: 'width 600ms ease' }} />
                </div>
                <div style={{ marginTop: vh(0.4), fontSize: vh(1.3), color: TEXTO_3 }}>
                  {vol} {unidade === 'RR' ? 'RR' : vol === 1 ? 'venda' : 'vendas'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: vh(2.7), fontWeight: 500, lineHeight: 1 }}>{loading ? '—' : pontosFmt(pontos)}</div>
                <div style={{ fontSize: vh(1.2), color: TEXTO_3, marginTop: vh(0.3) }}>pts</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
