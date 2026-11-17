import { ExternalLink } from 'lucide-react'
import { classificarMotivo } from '@/constants/motivosPerda'
import { fmtDuracao } from '@/components/ui/dealDrawerShared'
import type { Momento, Timeline } from '@/lib/timeline/tipos'
import type { ItemTarefas } from '@/lib/timeline/historico'
import { horaBR } from '@/lib/timeline/layout'

/**
 * Detalhe de um item do histórico da Linha do Tempo — abre no lugar, embaixo da
 * linha: notas da tarefa, motivo e anotação da perda, reunião (scorecard,
 * resumo, gravação), quem mudou o quê.
 */

const hora = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const L = ({ k, v }: { k: string; v: React.ReactNode }) => v == null || v === '' ? null : (
  <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ color: 'var(--ws-text-secondary)', minWidth: 96 }}>{k}</span><span style={{ color: 'var(--ws-text-primary)' }}>{v}</span></div>
)
const Pill = ({ children, tom }: { children: React.ReactNode; tom: 'atencao' | 'positivo' | 'risco' | 'neutro' }) => {
  const cores = { atencao: ['var(--status-atencao-bg)', '#B7791F'], positivo: ['#E4F6F5', '#1D8F89'], risco: ['var(--status-risco-bg)', '#B4324B'], neutro: ['#F1F5F9', '#475569'] }[tom]
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: cores[0], color: cores[1], borderRadius: 999, padding: '3px 8px' }}>{children}</span>
}
const linkExt = (href: string, texto: string) => (
  <a href={href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--ws-vinho-b)' }}>{texto}<ExternalLink size={11} /></a>
)

export function DetalheMomento({ m, timeline }: { m: Momento; timeline: Timeline }) {
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
        {meta.respostas.length > 0 ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', margin: '6px 0 4px' }}>Scorecard · {ok}/{meta.respostas.length}</div>
            {porCategoria(meta.respostas).map(([categoria, rs]) => (
              <div key={categoria} style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-secondary)', marginBottom: 2 }}>{categoria}</div>
                {rs.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '14px 1fr', gap: 6 }}>
                    <span style={{ color: r.resposta === 'yes' ? '#1D8F89' : '#B4324B', fontWeight: 700 }} aria-label={r.resposta === 'yes' ? 'sim' : 'não'}>{r.resposta === 'yes' ? '✓' : '✗'}</span>
                    <span>{r.pergunta}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : meta.scorecardDisponivel ? (
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', fontStyle: 'italic' }}>Scorecard disponível no MeetRox.</div>
        ) : null}
        {meta.resumo.length > 0 ? meta.resumo.map(s => (
          <div key={s.titulo}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', margin: '6px 0 4px' }}>{s.titulo}</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5 }}>{s.itens.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </div>
        )) : meta.resumoDisponivel ? (
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', fontStyle: 'italic' }}>Resumo disponível no MeetRox.</div>
        ) : null}
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
  if (meta?.kind === 'cadencia') {
    return (
      <>
        <L k="Cadência" v={meta.cadencia ?? '—'} />
        {meta.evento === 'entrada' && <L k="Como entrou" v={meta.detalhe === 'reconciliacao' ? 'pela conferência diária' : 'ao entrar na etapa'} />}
        {meta.evento === 'saida' && <L k="Motivo" v={meta.detalhe ?? '—'} />}
        {meta.evento === 'disparo' && <L k="Mensagem" v={meta.detalhe ?? '—'} />}
        {meta.evento === 'disparo' && meta.status === 'erro' && <Pill tom="risco">não foi entregue</Pill>}
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

function porCategoria(rs: { categoria: string; pergunta: string; resposta: string }[]): [string, typeof rs][] {
  const m = new Map<string, typeof rs>()
  for (const r of rs) m.set(r.categoria, [...(m.get(r.categoria) ?? []), r])
  return [...m.entries()]
}

const TIPO_TAREFA: Record<string, string> = { call: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', task: 'Tarefa', lunch: 'Almoço', meeting: 'Reunião', outro: 'Tarefa' }

/** Lista das tarefas de um dia, uma por linha, com status e notas. */
export function DetalheTarefas({ item }: { item: ItemTarefas }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {item.tarefas.map(t => {
        const meta = t.meta?.kind === 'tarefa' ? t.meta : null
        return (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 8, fontSize: 12.5 }}>
            <span style={{ color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{horaBR(t.instante)}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: 'var(--ws-text-primary)' }}>{t.titulo}</span>
                {meta && <span style={{ color: 'var(--ws-text-secondary)' }}>{TIPO_TAREFA[meta.tipoTarefa] ?? 'Tarefa'}</span>}
                {meta?.atrasada ? <Pill tom="atencao">{meta.atrasoDias != null ? `${meta.atrasoDias} dia${meta.atrasoDias === 1 ? '' : 's'} atrasada` : 'atrasada'}</Pill>
                  : meta && !meta.concluida ? <Pill tom="neutro">em aberto</Pill> : null}
                {t.ator && <span style={{ color: 'var(--ws-text-secondary)' }}>{t.ator}</span>}
              </div>
              {meta?.notas && <div style={{ whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: 8 }}>{meta.notas}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}


