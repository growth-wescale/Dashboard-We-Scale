import { useMemo, useState } from 'react'
import {
  ArrowRightLeft, Ban, CalendarCheck, ChevronDown, CircleX, Flag, ListChecks, MessageCircle,
  RotateCcw, Search, Tag, Trophy, UserRound, Video, Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMediaQuery, MQ_CELULAR } from '@/hooks/useMediaQuery'
import { horaBR, fmtDias, rotuloDia, rotuloDiaSemana } from '@/lib/timeline/layout'
import {
  CATEGORIAS, categoriaDe, montarHistorico, nomeCurto,
  type CategoriaHistorico, type CicloHistorico, type ItemHistorico, type ItemTarefas,
} from '@/lib/timeline/historico'
import type { Momento, Timeline } from '@/lib/timeline/tipos'
import { DetalheMomento, DetalheTarefas } from './DetalheMomento'

/**
 * Histórico do negócio em lista: um bloco por ciclo (o 2º em diante é resgate),
 * dentro dele um dia por linha, na ordem em que aconteceu. Cada linha abre o
 * detalhe no lugar. Os filtros só escondem tipos de item, nunca reordenam.
 */

type Tom = 'mql' | 'sdr' | 'closer' | 'perda' | 'ganho' | 'resgate' | 'atencao' | 'neutro' | 'cadencia' | 'reuniao'

const COR_TOM: Record<Tom, string> = {
  mql: 'var(--ws-text-primary)', sdr: 'var(--ws-vinho-b)', closer: 'var(--ws-verde)', perda: 'var(--status-risco)',
  ganho: '#B7791F', resgate: 'var(--status-atencao)', atencao: 'var(--status-atencao)', neutro: 'var(--ws-text-secondary)',
  cadencia: '#6D5A96', reuniao: 'var(--ws-verde)',
}

interface Linha { icone: LucideIcon; tom: Tom; titulo: string; sub: string | null }

const de = (m: Momento) => (m.meta?.kind === 'campo' ? m.meta.de : null)
const para = (m: Momento) => (m.meta?.kind === 'campo' ? m.meta.para : null)
const nome = (s: string | null) => (s ? nomeCurto(s) : '—')
const juntar = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join(' · ') || null

function linhaDoMomento(m: Momento, ciclo: CicloHistorico): Linha {
  switch (m.tipo) {
    case 'etapa': {
      const funil = m.meta?.kind === 'etapa' ? m.meta.funil : null
      const handoff = m.detalhe?.startsWith('passou') ? m.detalhe : null
      const desvio = m.desvio === 'voltou' ? 'voltou etapa' : m.desvio === 'pulou' ? 'pulou etapa' : null
      const tom: Tom = m.camada === 'Closer' ? 'closer' : m.camada === 'MQL' ? 'mql' : 'sdr'
      return { icone: m.camada === 'MQL' ? Search : CalendarCheck, tom, titulo: m.etapa ? `Entrou em ${m.titulo}` : `Entrou em ${m.titulo} (etapa fora do catálogo)`, sub: juntar(funil && `funil ${funil}`, handoff, desvio) }
    }
    case 'no_show': return { icone: Ban, tom: 'atencao', titulo: 'No-show', sub: null }
    case 'perda': return { icone: CircleX, tom: 'perda', titulo: 'Perdido', sub: m.meta?.kind === 'perda' ? m.meta.motivo : null }
    case 'ganho': return { icone: Trophy, tom: 'ganho', titulo: 'Venda fechada', sub: null }
    case 'retomada': return {
      icone: RotateCcw, tom: 'resgate', titulo: 'Reaberto (resgate)',
      sub: juntar(ciclo.diasParado != null && `depois de ${fmtDias(ciclo.diasParado)} perdido`, m.detalhe && `voltou em ${m.detalhe}`),
    }
    case 'troca_responsavel': return { icone: UserRound, tom: 'neutro', titulo: `Responsável: ${nome(de(m))} → ${nome(para(m))}`, sub: null }
    case 'mudanca_funil': return { icone: ArrowRightLeft, tom: 'neutro', titulo: `Funil: ${de(m) ?? '—'} → ${para(m) ?? '—'}`, sub: null }
    case 'mudanca_campo': {
      const campo = m.meta?.kind === 'campo' ? m.meta.campo : 'Campo'
      return { icone: Tag, tom: 'neutro', titulo: `${campo}: ${de(m) ?? '—'} → ${para(m) ?? '—'}`, sub: null }
    }
    case 'cadencia': return { icone: Workflow, tom: 'cadencia', titulo: m.titulo, sub: m.detalhe ?? null }
    case 'disparo': return { icone: MessageCircle, tom: m.meta?.kind === 'cadencia' && m.meta.status === 'erro' ? 'perda' : 'cadencia', titulo: m.titulo, sub: m.detalhe ?? null }
    case 'reuniao': {
      const r = m.meta?.kind === 'reuniao' ? m.meta : null
      return { icone: Video, tom: 'reuniao', titulo: `Reunião: ${m.titulo}`, sub: juntar(r?.tipoReuniao, m.ator && nomeCurto(m.ator), r?.duracaoMin != null && `${r.duracaoMin} min`, r?.notaIA != null && `nota ${r.notaIA.toFixed(1).replace('.', ',')}`) }
    }
    default: return { icone: ListChecks, tom: 'neutro', titulo: m.titulo, sub: m.detalhe ?? null }
  }
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

function linhaDasTarefas(i: ItemTarefas): Linha {
  const tipos = juntar(
    i.ligacoes > 0 && plural(i.ligacoes, 'ligação', 'ligações'),
    i.whatsapps > 0 && plural(i.whatsapps, 'WhatsApp', 'WhatsApp'),
    i.outras > 0 && plural(i.outras, 'outra', 'outras'),
  )
  return { icone: ListChecks, tom: 'cadencia', titulo: plural(i.tarefas.length, 'tarefa', 'tarefas'), sub: juntar(tipos, i.pessoas.map(nomeCurto).join(', ')) }
}

function Selo({ children, tom }: { children: React.ReactNode; tom: 'atencao' | 'risco' | 'positivo' | 'neutro' }) {
  const [bg, fg] = { atencao: ['var(--status-atencao-bg)', '#B7791F'], risco: ['var(--status-risco-bg)', 'var(--status-risco)'], positivo: ['var(--status-positivo-bg)', 'var(--status-positivo)'], neutro: ['var(--ws-bg)', 'var(--ws-text-secondary)'] }[tom]
  return <span style={{ fontSize: 11.5, fontWeight: 600, background: bg, color: fg, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>
}

function ItemLinha({ item, ciclo, aberto, onAlternar, timeline, celular }: {
  item: ItemHistorico; ciclo: CicloHistorico; aberto: boolean; onAlternar: () => void; timeline: Timeline; celular: boolean
}) {
  const linha = item.tipo === 'tarefas' ? linhaDasTarefas(item) : linhaDoMomento(item.momento, ciclo)
  const cor = COR_TOM[linha.tom]
  const Icone = linha.icone
  const forte = item.tipo === 'momento' && (item.momento.tipo === 'perda' || item.momento.tipo === 'retomada' || item.momento.tipo === 'ganho')
  const selos = item.tipo === 'tarefas' && (item.atrasadas > 0 || item.abertas > 0) ? (
    <>
      {item.atrasadas > 0 && <Selo tom="atencao">{plural(item.atrasadas, 'atrasada', 'atrasadas')}</Selo>}
      {item.abertas > 0 && <Selo tom="neutro">{plural(item.abertas, 'em aberto', 'em aberto')}</Selo>}
    </>
  ) : null
  return (
    <li style={{ position: 'relative', listStyle: 'none' }}>
      <button type="button" onClick={onAlternar} aria-expanded={aberto} className="hist-linha" style={{
        display: 'grid', gridTemplateColumns: '44px 28px 1fr auto', alignItems: 'start', gap: 10, width: '100%',
        padding: '7px 8px', border: 'none', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
        background: forte ? `color-mix(in srgb, ${cor} 7%, transparent)` : 'transparent',
      }}>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums', paddingTop: 5 }}>{horaBR(item.instante)}</span>
        <span style={{ width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--ws-surface)', border: `1.5px solid ${cor}`, position: 'relative', zIndex: 1 }}>
          <Icone size={14} color={cor} strokeWidth={2.2} />
        </span>
        <span style={{ minWidth: 0, paddingTop: 3 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: forte ? 650 : 500, color: forte ? cor : 'var(--ws-text-primary)' }}>{linha.titulo}</span>
          {linha.sub && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ws-text-secondary)', marginTop: 1 }}>{linha.sub}</span>}
          {celular && selos && <span style={{ display: 'flex', gap: 6, marginTop: 4 }}>{selos}</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4 }}>
          {!celular && selos}
          <ChevronDown size={15} color="var(--ws-text-secondary)" style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
        </span>
      </button>
      {aberto && (
        <div style={{ margin: celular ? '2px 0 10px' : '2px 8px 10px 92px', padding: 12, border: '1px solid var(--ws-border)', borderRadius: 10, background: 'var(--ws-surface)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.tipo === 'tarefas' ? <DetalheTarefas item={item} /> : <DetalheMomento m={item.momento} timeline={timeline} />}
        </div>
      )}
    </li>
  )
}

function CabecalhoCiclo({ c, total }: { c: CicloHistorico; total: number }) {
  const duracao = fmtDias(Math.max(0, (c.fim.getTime() - c.inicio.getTime()) / 86_400_000))
  const desfecho = c.desfecho === 'perdido' ? `perdido em ${rotuloDia(c.fim)}${c.motivoPerda ? `: ${c.motivoPerda}` : ''}`
    : c.desfecho === 'ganho' ? `venda em ${rotuloDia(c.fim)}`
    : c.desfecho === 'em_andamento' ? `em andamento há ${duracao}` : null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '4px 0 10px', borderBottom: '1px solid var(--ws-border)', marginBottom: 6 }}>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17, color: 'var(--ws-text-primary)' }}>
        {total > 1 ? `Ciclo ${c.ciclo}` : 'Do MQL até hoje'}
      </h3>
      {c.resgate && <Selo tom="atencao">Resgate</Selo>}
      <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>
        {[
          c.resgate ? `reaberto em ${rotuloDia(c.inicio)}${c.diasParado != null ? `, depois de ${fmtDias(c.diasParado)} perdido` : ''}` : `começou em ${rotuloDia(c.inicio)}`,
          c.desfecho === 'em_andamento' ? null : duracao,
          desfecho,
        ].filter(Boolean).join(' · ')}
      </span>
    </div>
  )
}

export function HistoricoDeal({ timeline }: { timeline: Timeline }) {
  const celular = useMediaQuery(MQ_CELULAR)
  const [filtros, setFiltros] = useState<Set<CategoriaHistorico>>(() => new Set(CATEGORIAS.map(c => c.chave)))
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const ciclos = useMemo(() => montarHistorico(timeline, filtros), [timeline, filtros])
  const contagem = useMemo(() => {
    const out: Record<CategoriaHistorico, number> = { etapas: 0, pessoas: 0, cadencia: 0, reunioes: 0 }
    for (const m of timeline.momentos) out[categoriaDe(m)] += 1
    return out
  }, [timeline])
  const todosIds = useMemo(() => ciclos.flatMap(c => c.dias.flatMap(d => d.itens.map(i => i.id))), [ciclos])
  const tudoAberto = todosIds.length > 0 && todosIds.every(id => abertos.has(id))

  const alternarFiltro = (k: CategoriaHistorico) => setFiltros(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const alternar = (id: string) => setAbertos(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {CATEGORIAS.map(c => {
          const ativo = filtros.has(c.chave)
          return (
            <button key={c.chave} type="button" aria-pressed={ativo} onClick={() => alternarFiltro(c.chave)} style={{
              fontSize: 12.5, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${ativo ? 'var(--ws-text-primary)' : 'var(--ws-border)'}`,
              background: ativo ? 'var(--ws-text-primary)' : 'var(--ws-surface)', color: ativo ? 'var(--ws-surface)' : 'var(--ws-text-secondary)',
            }}>
              {c.rotulo} <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{contagem[c.chave]}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => setAbertos(tudoAberto ? new Set() : new Set(todosIds))} style={{
          marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, border: 'none', background: 'transparent', color: 'var(--ws-vinho-b)', cursor: 'pointer', padding: '5px 4px',
        }}>
          {tudoAberto ? 'Fechar todos os detalhes' : 'Abrir todos os detalhes'}
        </button>
      </div>

      {ciclos.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhum registro deste negócio ainda.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {ciclos.map(c => (
          <section key={c.ciclo} aria-label={`Ciclo ${c.ciclo}`}>
            <CabecalhoCiclo c={c} total={ciclos.length} />
            {c.dias.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ws-text-secondary)', padding: '6px 0' }}>Nada deste tipo neste ciclo.</div>
            ) : c.dias.map(d => (
              <div key={d.dia} style={{ display: 'grid', gridTemplateColumns: celular ? '1fr' : '96px 1fr', gap: celular ? 2 : 12, padding: '4px 0' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ws-text-primary)', paddingTop: 11 }}>{rotuloDiaSemana(d.dia)}</div>
                <ol className="hist-dia" style={{ margin: 0, padding: 0, position: 'relative' }}>
                  {d.itens.map(i => (
                    <ItemLinha key={i.id} item={i} ciclo={c} aberto={abertos.has(i.id)} onAlternar={() => alternar(i.id)} timeline={timeline} celular={celular} />
                  ))}
                </ol>
              </div>
            ))}
            {c.desfecho === 'em_andamento' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ws-text-secondary)', padding: celular ? '8px 8px 0' : '8px 0 0 158px' }}>
                <Flag size={14} /> hoje, {rotuloDia(timeline.fim)}: segue em andamento
              </div>
            )}
          </section>
        ))}
      </div>
      <style>{`
        .hist-dia::before { content: ''; position: absolute; left: 75px; top: 14px; bottom: 14px; width: 1.5px; background: var(--ws-border); }
        .hist-linha:hover { background: color-mix(in srgb, var(--ws-border) 35%, transparent) !important; }
        .hist-linha:focus-visible { outline: 2px solid var(--ws-vinho-b); outline-offset: 1px; }
      `}</style>
    </div>
  )
}
