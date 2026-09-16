import { useEffect } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { classificarMotivo } from '@/constants/motivosPerda'
import { fmtDuracao } from '@/components/ui/dealDrawerShared'
import { rdDealUrl } from '@/lib/rd'
import type { Momento, Timeline } from '@/lib/timeline/tipos'
import type { MarcadorLayout, NoLayout, ToqueLayout } from '@/lib/timeline/layout'

export type AlvoPopover =
  | { tipo: 'no'; no: NoLayout }
  | { tipo: 'toque'; toque: ToqueLayout }
  | { tipo: 'marcador'; marcador: MarcadorLayout }

interface Props { alvo: AlvoPopover; timeline: Timeline; idDeal: string; onFechar: () => void }

const hora = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const L = ({ k, v }: { k: string; v: React.ReactNode }) => v == null || v === '' ? null : (
  <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--ws-text-secondary)', minWidth: 96 }}>{k}</span><span style={{ color: 'var(--ws-text-primary)' }}>{v}</span></div>
)
const Pill = ({ children, tom }: { children: React.ReactNode; tom: 'atencao' | 'positivo' | 'risco' | 'neutro' }) => {
  const cores = { atencao: ['#FDF1DE', '#B7791F'], positivo: ['#E4F6F5', '#1D8F89'], risco: ['#FBE7EB', '#B4324B'], neutro: ['#F1F5F9', '#475569'] }[tom]
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: cores[0], color: cores[1], borderRadius: 999, padding: '3px 8px' }}>{children}</span>
}
const linkExt = (href: string, texto: string) => (
  <a href={href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)' }}>{texto}<ExternalLink size={11} /></a>
)

function Corpo({ m, timeline }: { m: Momento; timeline: Timeline }) {
  const meta = m.meta
  if (meta?.kind === 'tarefa') {
    return (
      <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {meta.atrasada ? <Pill tom="atencao">{meta.atrasoDias != null ? `${meta.atrasoDias} dia${meta.atrasoDias === 1 ? '' : 's'} atrasada` : 'atrasada'}</Pill> : meta.concluida ? <Pill tom="positivo">no prazo</Pill> : <Pill tom="neutro">em aberto</Pill>}
          <Pill tom="neutro">{meta.tipoTarefa}</Pill>
        </div>
        <L k="Quem" v={m.ator} />
        <L k="Prazo" v={meta.prazo ? hora(new Date(meta.prazo)) : '—'} />
        <L k="Feita em" v={meta.feitaEm ? hora(new Date(meta.feitaEm)) : '—'} />
        {meta.notas && <div style={{ fontSize: 12.5, color: 'var(--ws-text-primary)', whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: 10 }}>{meta.notas}</div>}
      </>
    )
  }
  if (meta?.kind === 'reuniao') {
    const ok = meta.respostas.filter(r => r.resposta === 'yes').length
    return (
      <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {meta.scorecard && <Pill tom="neutro">{meta.scorecard}</Pill>}
          {meta.notaIA != null && <Pill tom={meta.notaIA >= 7 ? 'positivo' : meta.notaIA >= 5 ? 'atencao' : 'risco'}>nota IA {meta.notaIA.toFixed(1).replace('.', ',')}</Pill>}
          {meta.duracaoMin != null && <Pill tom="neutro">{meta.duracaoMin} min</Pill>}
        </div>
        <L k="Tipo" v={meta.tipoReuniao} />
        <L k="Quem" v={m.ator} />
        <L k="Participantes" v={meta.participantes.length ? meta.participantes.join(', ') : null} />
        {meta.respostas.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', margin: '6px 0 4px' }}>Scorecard · {ok}/{meta.respostas.length}</div>
            {meta.respostas.map((r, i) => (
              <div key={i} style={{ fontSize: 12, display: 'flex', gap: 6 }}><span style={{ color: r.resposta === 'yes' ? '#1D8F89' : '#B4324B', fontWeight: 700 }}>{r.resposta === 'yes' ? '✓' : '✗'}</span><span style={{ color: 'var(--ws-text-secondary)' }}>{r.categoria} ·</span><span>{r.pergunta}</span></div>
            ))}
          </div>
        )}
        {meta.resumo.map(s => (
          <div key={s.titulo}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', margin: '6px 0 4px' }}>{s.titulo}</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5 }}>{s.itens.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </div>
        ))}
        {meta.url && linkExt(meta.url, 'Abrir no MeetRox')}
      </>
    )
  }
  if (meta?.kind === 'perda') {
    const cat = classificarMotivo(meta.motivo)
    return (
      <>
        <L k="Motivo" v={meta.motivo ?? '—'} />
        <L k="Categoria" v={cat ?? "—"} />
        {meta.anotacao && <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: 10 }}>{meta.anotacao}</div>}
      </>
    )
  }
  if (meta?.kind === 'campo') return <><L k={meta.campo} v={`${meta.de ?? '—'} → ${meta.para ?? '—'}`} /><L k="Quem" v={m.ator} /></>
  // etapa / no_show / retomada / ganho
  const trecho = timeline.trechos.find(t => t.deId === m.id)
  return (
    <>
      {meta?.kind === 'etapa' && <L k="Veio de" v={meta.etapaAnterior ?? '—'} />}
      {meta?.kind === 'etapa' && <L k="Funil" v={meta.funil} />}
      <L k="Quem" v={m.ator} />
      {trecho && <L k="Parado aqui" v={fmtDuracao(trecho.duracaoDias)} />}
      {trecho && trecho.toques > 0 && <L k="Toques no trecho" v={`${trecho.toques}${trecho.atrasados ? ` (${trecho.atrasados} atrasados)` : ''}`} />}
      {m.desvio && <Pill tom={m.desvio === 'no_show' || m.desvio === 'voltou' ? 'atencao' : m.desvio === 'perdeu' ? 'risco' : 'neutro'}>{{ voltou: 'voltou etapa', pulou: 'pulou etapa', no_show: 'no-show', trocou_funil: 'trocou de funil', perdeu: 'perdido', reciclou: 'reciclado' }[m.desvio]}</Pill>}
    </>
  )
}

export function MomentoPopover({ alvo, timeline, idDeal, onFechar }: Props) {
  // Esc fecha — popover não-modal, sem foco automático nem trap de foco (não é diálogo bloqueante).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onFechar])

  const m: Momento | null = alvo.tipo === 'no' ? alvo.no.momento : alvo.tipo === 'toque' ? alvo.toque.momento : alvo.marcador.momento
  const titulo = alvo.tipo === 'no' ? alvo.no.titulo : m?.titulo ?? ''
  const subtitulo = m ? hora(m.instante) : alvo.tipo === 'no' ? alvo.no.detalhe : ''
  const cluster = alvo.tipo === 'toque' && alvo.toque.cluster.length > 1 ? alvo.toque.cluster : null
  return (
    <div role="dialog" aria-label={titulo} style={{ position: 'absolute', right: 16, top: 16, width: 'min(380px, calc(100% - 32px))', maxHeight: 'calc(100% - 32px)', overflowY: 'auto', background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 14, boxShadow: '0 12px 32px rgba(51,3,45,.16)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ws-text-primary)' }}>{titulo}</div><div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>{subtitulo}</div></div>
        <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ws-text-secondary)' }}><X size={16} /></button>
      </div>
      {cluster ? cluster.map(c => (
        <div key={c.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.titulo} <span style={{ fontWeight: 400, color: 'var(--ws-text-secondary)' }}>· {hora(c.instante)}</span></div>
          <Corpo m={c} timeline={timeline} />
        </div>
      )) : m ? <Corpo m={m} timeline={timeline} /> : alvo.tipo === 'no' && alvo.no.fase ? (
        <>
          <L k="Duração" v={fmtDuracao(alvo.no.fase.duracaoDias)} />
          <L k="Etapas" v={alvo.no.fase.etapas} /><L k="Toques" v={alvo.no.fase.toques} /><L k="Atrasados" v={alvo.no.fase.atrasados} /><L k="No-shows" v={alvo.no.fase.noShows} /><L k="Reuniões" v={alvo.no.fase.reunioes} />
        </>
      ) : null}
      <div style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 8 }}>{linkExt(rdDealUrl(idDeal), 'Abrir no RD')}</div>
    </div>
  )
}
