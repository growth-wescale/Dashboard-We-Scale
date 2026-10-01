/**
 * Bloco "Reuniões no MeetRox" da aba Performance › Closer: quantas reuniões de
 * cada tipo (R1 → R5) os Closers gravaram no recorte, por Closer ou por marca.
 *
 * Recebe as reuniões JÁ filtradas (`filtrarReunioes`) — aqui só agrega e
 * desenha. Clique em qualquer número abre a lista de reuniões por trás dele,
 * com o link da gravação.
 */

import { useMemo, useState } from 'react'
import { ExternalLink, Info, PlayCircle, X } from 'lucide-react'
import { SCard, SegmentedControl } from '@/components/ui/v2'
import { LinkLinhaDoTempo, cell } from './dealDrawerShared'
import {
  TIPOS_REUNIAO, agruparReunioes, chaveDaReuniao, resumirReunioes,
  type DimensaoReunioes, type LinhaReunioes, type ReuniaoRow, type TipoReuniao,
} from '@/lib/reunioesCloser'
import type { OrigemComercial } from '@/lib/funnelTypes'
import { marcaLabel, BRAND_ACCENT } from '@/constants/brands'
import { rdDealUrl } from '@/lib/rd'
import { nf, pct } from '@/lib/format'

const COR_TIPO = Object.fromEntries(TIPOS_REUNIAO.map(t => [t.tipo, t.cor])) as Record<TipoReuniao, string>
const NOME_TIPO = Object.fromEntries(TIPOS_REUNIAO.map(t => [t.tipo, t.nome])) as Record<TipoReuniao, string>

const SEM_MARCA = 'Sem negócio vinculado'

const fmtMin = (m: number | null) => (m == null ? '—' : `${nf(m)} min`)
const fmtNota = (s: number | null) => (s == null ? '—' : pct(s * 100, 0))

const BRT_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const fmtDataHora = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : BRT_DATA_HORA.format(d).replace(',', '')
}

/** Quadradinho da cor do tipo + rótulo em tinta de texto (a cor nunca sozinha). */
function TipoTag({ tipo, forte }: { tipo: TipoReuniao; forte?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: COR_TIPO[tipo], flexShrink: 0 }} />
      <span style={{ fontWeight: forte ? 700 : 600, color: 'var(--ws-text-primary)' }}>{tipo}</span>
    </span>
  )
}

// ─── Cards por tipo ─────────────────────────────────────────────────────────

function TipoCard({ tipo, quantidade, total, duracaoMedia, notaMedia, closers, onClick }: {
  tipo: TipoReuniao; quantidade: number; total: number
  duracaoMedia: number | null; notaMedia: number | null; closers: number
  onClick: () => void
}) {
  const parte = total > 0 ? (quantidade / total) * 100 : 0
  return (
    <SCard pad={16} onClick={quantidade > 0 ? onClick : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 38 }}>
        <TipoTag tipo={tipo} forte />
        <span style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', lineHeight: 1.3 }}>{NOME_TIPO[tipo]}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 28, color: 'var(--ws-text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {nf(quantidade)}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {total > 0 ? `${pct(parte, 0)} do total` : ''}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--ws-border)', overflow: 'hidden' }}
        title={`${tipo}: ${nf(quantidade)} de ${nf(total)} reuniões tipadas`}>
        <div style={{ width: `${parte}%`, height: '100%', background: COR_TIPO[tipo], borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontVariantNumeric: 'tabular-nums' }}>
        <span title="Duração média da reunião">{fmtMin(duracaoMedia)}</span>
        <span title="Nota média da IA do MeetRox (% dos critérios do scorecard atendidos)">nota {fmtNota(notaMedia)}</span>
        <span>{closers} closer{closers === 1 ? '' : 's'}</span>
      </div>
    </SCard>
  )
}

// ─── Tabela tipo × Closer/Marca ─────────────────────────────────────────────

/** Mix R1→R5 da linha numa barra empilhada fina, com respiro de 2px entre fatias. */
function MixBar({ linha }: { linha: LinhaReunioes }) {
  if (linha.total === 0) {
    return <div style={{ height: 8, borderRadius: 4, background: 'var(--ws-border)', opacity: .6 }} title="Sem reunião tipada" />
  }
  const fatias = TIPOS_REUNIAO.filter(t => linha.porTipo[t.tipo] > 0)
  return (
    <div style={{ display: 'flex', gap: 2, height: 8 }}>
      {fatias.map((t, i) => {
        const n = linha.porTipo[t.tipo]
        const primeira = i === 0
        const ultima = i === fatias.length - 1
        return (
          <div key={t.tipo}
            title={`${t.tipo} · ${t.nome}: ${nf(n)} (${pct((n / linha.total) * 100, 0)})`}
            style={{
              flex: `${n} 0 0`, minWidth: 4, background: t.cor,
              borderRadius: `${primeira ? 4 : 0}px ${ultima ? 4 : 0}px ${ultima ? 4 : 0}px ${primeira ? 4 : 0}px`,
            }} />
        )
      })}
    </div>
  )
}

/** Número da célula com fundo na cor do tipo, mais forte quanto maior na coluna. */
function CelulaTipo({ n, max, cor, titulo, onClick }: { n: number; max: number; cor: string; titulo: string; onClick: () => void }) {
  if (n === 0) {
    return <span style={{ textAlign: 'center', color: 'var(--ws-text-secondary)', opacity: .45 }}>–</span>
  }
  const forca = max > 0 ? n / max : 0
  return (
    <button onClick={onClick} title={titulo} style={{
      justifySelf: 'center', minWidth: 42, padding: '4px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: `color-mix(in srgb, ${cor} ${Math.round(14 + forca * 30)}%, transparent)`,
      color: 'var(--ws-text-primary)', fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {nf(n)}
    </button>
  )
}

function BotaoNumero({ n, titulo, onClick, forte, apagado }: { n: number; titulo: string; onClick: () => void; forte?: boolean; apagado?: boolean }) {
  if (n === 0) return <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)', opacity: .45 }}>–</span>
  return (
    <button onClick={onClick} title={titulo} style={{
      justifySelf: 'end', border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px',
      fontFamily: 'inherit', fontSize: 14, fontVariantNumeric: 'tabular-nums',
      fontWeight: forte ? 700 : 500,
      color: apagado ? 'var(--ws-text-secondary)' : 'var(--ws-text-primary)',
      textDecoration: 'underline', textDecorationColor: 'var(--ws-border)', textUnderlineOffset: 3,
    }}>
      {nf(n)}
    </button>
  )
}

const COLS = '36px minmax(150px, 1.3fr) repeat(5, 60px) 62px minmax(130px, 1fr) 80px 70px 76px'

interface Selecao { titulo: string; reunioes: ReuniaoRow[] }

function TabelaReunioes({ linhas, dim, accent, reunioes, onAbrir, resumoGeral }: {
  linhas: LinhaReunioes[]
  dim: DimensaoReunioes
  accent: string
  reunioes: ReuniaoRow[]
  onAbrir: (s: Selecao) => void
  resumoGeral: ReturnType<typeof resumirReunioes>
}) {
  const maxPorTipo = useMemo(() => Object.fromEntries(
    TIPOS_REUNIAO.map(t => [t.tipo, Math.max(0, ...linhas.map(l => l.porTipo[t.tipo]))]),
  ) as Record<TipoReuniao, number>, [linhas])

  const nomeDaLinha = (chave: string | null) => (dim === 'marca' ? (chave ? marcaLabel(chave) : SEM_MARCA) : (chave ?? '—'))
  const daLinha = (chave: string | null) => reunioes.filter(r => chaveDaReuniao(r, dim) === chave)

  const th = (txt: React.ReactNode, align: 'left' | 'right' | 'center' = 'right', title?: string) => (
    <span title={title} style={{ textAlign: align, cursor: title ? 'help' : undefined }}>{txt}</span>
  )

  return (
    <SCard pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ background: accent, color: '#fff', textAlign: 'center', padding: '10px 16px', letterSpacing: '.06em', fontSize: 12, fontWeight: 600 }}>
        REUNIÕES POR TIPO · {dim === 'closer' ? 'CLOSERS' : 'MARCAS'}
      </div>
      <div className="rs-scroll-x">
        <div style={{ padding: '6px 8px', minWidth: 1000 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 8, padding: '10px 12px', fontSize: 11, letterSpacing: '.06em', color: 'var(--ws-text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', alignItems: 'center' }}>
            {th('#', 'left')}
            {th(dim === 'closer' ? 'CLOSER' : 'MARCA', 'left')}
            {TIPOS_REUNIAO.map(t => (
              <span key={t.tipo} title={t.nome} style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 5, cursor: 'help' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: t.cor }} />{t.tipo}
              </span>
            ))}
            {th('TOTAL')}
            {th('MIX R1 → R5', 'left')}
            {th('DURAÇÃO', 'right', 'Duração média das reuniões tipadas')}
            {th('NOTA IA', 'right', 'Nota média da IA do MeetRox: % dos critérios do scorecard atendidos')}
            {th('SEM TIPO', 'right', 'Reuniões gravadas sem tipo de call no MeetRox (alinhamentos internos e reuniões de venda não classificadas). Não entram no total.')}
          </div>

          {linhas.length === 0 && (
            <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhuma reunião gravada no recorte.</div>
          )}

          {linhas.map((l, i) => {
            const nome = nomeDaLinha(l.chave)
            const doTipo = (tipo: TipoReuniao | null) => daLinha(l.chave).filter(r => r.tipo === tipo)
            const corMarca = dim === 'marca' && l.chave ? (BRAND_ACCENT[l.chave] ?? null) : null
            return (
              <div key={l.chave ?? '∅'} style={{
                display: 'grid', gridTemplateColumns: COLS, columnGap: 8, padding: '11px 12px', alignItems: 'center',
                fontSize: 14, borderTop: i === 0 ? 'none' : '1px solid var(--ws-border)', fontVariantNumeric: 'tabular-nums',
              }}>
                <span style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 600, fontSize: 15, color: accent }}>{l.chave === null ? '' : `${i + 1}º`}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: l.chave ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)', minWidth: 0 }}>
                  {corMarca && <span style={{ width: 8, height: 8, borderRadius: '50%', background: corMarca, flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: l.chave ? undefined : 'italic' }}>{nome}</span>
                </span>
                {TIPOS_REUNIAO.map(t => (
                  <CelulaTipo key={t.tipo} n={l.porTipo[t.tipo]} max={maxPorTipo[t.tipo]} cor={t.cor}
                    titulo={`Ver as reuniões ${t.tipo} · ${nome}`}
                    onClick={() => onAbrir({ titulo: `${t.tipo} · ${t.nome} — ${nome}`, reunioes: doTipo(t.tipo) })} />
                ))}
                <BotaoNumero n={l.total} forte titulo={`Ver as reuniões tipadas · ${nome}`}
                  onClick={() => onAbrir({ titulo: `Reuniões R1–R5 — ${nome}`, reunioes: daLinha(l.chave).filter(r => r.tipo) })} />
                <MixBar linha={l} />
                <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{fmtMin(l.duracaoMedia)}</span>
                <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)' }}>{fmtNota(l.notaMedia)}</span>
                <BotaoNumero n={l.semTipo} apagado titulo={`Ver as reuniões sem tipo · ${nome}`}
                  onClick={() => onAbrir({ titulo: `Reuniões sem tipo — ${nome}`, reunioes: doTipo(null) })} />
              </div>
            )
          })}

          {linhas.length > 1 && (
            <div style={{
              display: 'grid', gridTemplateColumns: COLS, columnGap: 8, padding: '12px 12px', alignItems: 'center',
              fontSize: 14, borderTop: '2px solid var(--ws-border)', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
            }}>
              <span />
              <span style={{ color: 'var(--ws-text-primary)' }}>Total</span>
              {resumoGeral.porTipo.map(t => (
                <span key={t.tipo} style={{ textAlign: 'center' }}>{t.quantidade > 0 ? nf(t.quantidade) : '–'}</span>
              ))}
              <span style={{ textAlign: 'right' }}>{nf(resumoGeral.total)}</span>
              <MixBar linha={{
                chave: null, total: resumoGeral.total, semTipo: resumoGeral.semTipo,
                porTipo: Object.fromEntries(resumoGeral.porTipo.map(t => [t.tipo, t.quantidade])) as Record<TipoReuniao, number>,
                duracaoMedia: null, notaMedia: null,
              }} />
              <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)', fontWeight: 600 }}>{fmtMin(resumoGeral.duracaoMedia)}</span>
              <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)', fontWeight: 600 }}>{fmtNota(resumoGeral.notaMedia)}</span>
              <span style={{ textAlign: 'right', color: 'var(--ws-text-secondary)', fontWeight: 600 }}>{resumoGeral.semTipo > 0 ? nf(resumoGeral.semTipo) : '–'}</span>
            </div>
          )}
        </div>
      </div>
    </SCard>
  )
}

// ─── Popup com a lista de reuniões ──────────────────────────────────────────

function ReunioesDrawer({ selecao, subtitulo, accent, onClose }: {
  selecao: Selecao; subtitulo: string; accent: string; onClose: () => void
}) {
  const ordenadas = useMemo(
    () => [...selecao.reunioes].sort((a, b) => b.call_timestamp.localeCompare(a.call_timestamp)),
    [selecao.reunioes],
  )
  const cols = ['Data', 'Tipo', 'Closer', 'Negociação', 'Marca', 'Duração', 'Nota IA', 'Gravação']
  const direita = new Set(['Duração', 'Nota IA'])
  const td: React.CSSProperties = { padding: '10px 16px', whiteSpace: 'nowrap', verticalAlign: 'top' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div className="rs-drawer" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(1100px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="rs-drawer-head" style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>{selecao.titulo}</h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {ordenadas.length} reuni{ordenadas.length === 1 ? 'ão' : 'ões'} · {subtitulo}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ws-text-secondary)', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                {cols.map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: direita.has(h) ? 'right' : 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.length === 0 ? (
                <tr><td colSpan={cols.length} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>Nenhuma reunião.</td></tr>
              ) : ordenadas.map((r, i) => {
                const nomeNegocio = r.negociacao ?? r.titulo
                return (
                  <tr key={r.call_id} style={{
                    background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--ws-border) 20%, transparent)',
                    borderBottom: '1px solid var(--ws-border)',
                  }}>
                    <td style={{ ...td, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtDataHora(r.call_timestamp)}</td>
                    <td style={td}>{r.tipo ? <TipoTag tipo={r.tipo} /> : <span style={{ color: 'var(--ws-text-secondary)' }}>Sem tipo</span>}</td>
                    <td style={td}>{r.closer}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 260 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                        {r.id_deal ? (
                          <a href={rdDealUrl(r.id_deal)} target="_blank" rel="noreferrer" style={{
                            color: accent, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500,
                          }}>
                            {cell(nomeNegocio)}
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ color: 'var(--ws-text-secondary)', fontStyle: 'italic' }}>
                            {nomeNegocio ? cell(nomeNegocio) : 'Sem negócio vinculado'}
                          </span>
                        )}
                        {r.id_deal && r.deal_no_funil && <LinkLinhaDoTempo idDeal={r.id_deal} cor={accent} />}
                      </div>
                      {r.titulo && r.titulo !== nomeNegocio && (
                        <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: 2 }}>{r.titulo}</div>
                      )}
                    </td>
                    <td style={td}>{r.marca ? marcaLabel(r.marca) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMin(r.duracao_min)}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNota(r.ai_score)}</td>
                    <td style={td}>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" style={{ color: accent, display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, textDecoration: 'none' }}>
                          <PlayCircle size={14} /> Abrir
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── Seção ──────────────────────────────────────────────────────────────────

interface Props {
  /** Reuniões já recortadas pelos filtros da barra e pelo período. */
  reunioes: ReuniaoRow[]
  loading: boolean
  origem: OrigemComercial
  /** "Consolidado · Setembro 2026" — vai no subtítulo do popup. */
  subtitulo: string
  accent: string
}

export function ReunioesMeetroxSection({ reunioes, loading, origem, subtitulo, accent }: Props) {
  const [dim, setDim] = useState<DimensaoReunioes>('closer')
  const [selecao, setSelecao] = useState<Selecao | null>(null)

  const resumo = useMemo(() => resumirReunioes(reunioes), [reunioes])
  const linhas = useMemo(() => agruparReunioes(reunioes, dim), [reunioes, dim])
  const vazio = reunioes.length === 0

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display, var(--font-body))', fontWeight: 500, fontSize: 20, color: 'var(--ws-text-primary)' }}>
            Reuniões no MeetRox
          </div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
            Tipo de call das reuniões gravadas pelos Closers, de R1 a R5 — clique num número pra ver as reuniões e abrir a gravação.
          </div>
        </div>
        <SegmentedControl<DimensaoReunioes>
          options={[{ value: 'closer', label: 'Por Closer' }, { value: 'marca', label: 'Por Marca' }]}
          value={dim} onChange={setDim} />
      </div>

      <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
        {vazio ? (
          <SCard style={{ fontSize: 13, color: 'var(--ws-text-secondary)', textAlign: 'center', padding: '28px 20px' }}>
            {loading
              ? 'Carregando reuniões do MeetRox…'
              : origem === 'Prospecção Ativa'
                ? 'Nenhuma reunião de Closer em Prospecção Ativa — o motor não passa pelo Closer.'
                : 'Nenhuma reunião gravada no MeetRox neste recorte.'}
          </SCard>
        ) : (
          <>
            <div className="rs-grid rs-cols-5" style={{ '--rs-gap': '14px', marginBottom: 14 } as React.CSSProperties}>
              {resumo.porTipo.map(t => (
                <TipoCard key={t.tipo} {...t} total={resumo.total}
                  onClick={() => setSelecao({
                    titulo: `${t.tipo} · ${NOME_TIPO[t.tipo]}`,
                    reunioes: reunioes.filter(r => r.tipo === t.tipo),
                  })} />
              ))}
            </div>

            <TabelaReunioes linhas={linhas} dim={dim} accent={accent} reunioes={reunioes}
              onAbrir={setSelecao} resumoGeral={resumo} />

            {resumo.semTipo > 0 && (
              <button onClick={() => setSelecao({ titulo: 'Reuniões sem tipo', reunioes: reunioes.filter(r => !r.tipo) })}
                style={{
                  marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px dashed var(--ws-border)', background: 'var(--ws-surface)',
                  fontSize: 12, color: 'var(--ws-text-secondary)', lineHeight: 1.45,
                }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: accent }} />
                <span>
                  <strong style={{ color: 'var(--ws-text-primary)' }}>{nf(resumo.semTipo)} reuni{resumo.semTipo === 1 ? 'ão gravada' : 'ões gravadas'} sem tipo de call</strong>{' '}
                  no MeetRox — alinhamentos internos e reuniões de venda que ficaram sem classificação. Não entram no total. <span style={{ color: accent, fontWeight: 600 }}>Ver lista</span>
                </span>
              </button>
            )}
          </>
        )}

        <p style={{ fontSize: 11, color: 'var(--ws-text-secondary)', margin: '10px 0 0', lineHeight: 1.5 }}>
          Fonte: MeetRox, sincronizado a cada 5 min. Conta pela data da reunião, e Closer é quem conduziu a gravação.
          Marca, fonte e SDR vêm do negócio do RD ligado à reunião — reunião sem negócio vinculado só aparece no Consolidado.
          Em “Deals únicos” o mesmo negócio conta uma vez por tipo no mês (some regravação de call que caiu); em “Passagens” toda gravação conta.
          Nota IA = % dos critérios do scorecard atendidos, segundo a IA do MeetRox.
        </p>
      </div>

      {selecao && (
        <ReunioesDrawer selecao={selecao} subtitulo={subtitulo} accent={accent} onClose={() => setSelecao(null)} />
      )}
    </div>
  )
}
