import { useEffect, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { bannerStyle } from '@/components/metas/metasUi'
import { RESULTADO_AJUDA, RESULTADO_VISUAL, botaoTexto, pill } from '@/components/distribuicao/ui'
import { useHistoricoLead } from '@/hooks/useHistoricoLead'
import {
  montarLinhaDoTempoLead, resumoLog, rotuloStatusNegocio, textoMarcas,
  type BloqueioRow, type ItemLinhaLead, type NegocioLeadRow, type Rotulo,
} from '@/lib/distribuicao/bloqueio'
import { ACAO_VISUAL, fmtDataHoraAno, linkRd } from './visual'

// Painel lateral com tudo o que aconteceu com um e-mail, numa linha do tempo só: conversões que
// chegaram na distribuição (e o que virou cada uma), negócios no RD CRM e ações de bloqueio.

interface Props {
  email: string
  bloqueio: BloqueioRow | null
  todas: string[]
  rotulo: Rotulo
  podeEditar: boolean
  onEditar: () => void
  onFechar: () => void
}

function DetalheNegocio({ n }: { n: NegocioLeadRow }) {
  const status = rotuloStatusNegocio(n.status, n.deleted_at)
  return (
    <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
      <span>{[n.marca, n.nome_funil && n.nome_etapa ? `${n.nome_funil} › ${n.nome_etapa}` : n.nome_funil ?? n.nome_etapa].filter(Boolean).join(' · ')}</span>
      {' · '}<strong style={{ color: status === 'Perdido' || status === 'Excluído no RD' ? 'var(--status-risco)' : status === 'Ganho' ? 'var(--status-positivo)' : 'var(--ws-text-primary)' }}>{status}</strong>
      {n.motivo_perda && status === 'Perdido' && <> ({n.motivo_perda})</>}
      {n.responsavel && <> · {n.responsavel}</>}
      {' · '}<a href={linkRd(n.id_deal)} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-accent)' }}>RD</a>
      {' · '}<Link to={`/linha-do-tempo/${n.id_deal}`} style={{ color: 'var(--brand-accent)' }}>Linha do Tempo</Link>
    </div>
  )
}

function Item({ item, rotulo }: { item: ItemLinhaLead; rotulo: Rotulo }) {
  let marcador: { label: string; bg: string; fg: string; title?: string }
  let corpo: ReactNode
  if (item.tipo === 'conversao') {
    const c = item.conversao
    const rv = RESULTADO_VISUAL[c.resultado]
    marcador = { ...rv, title: RESULTADO_AJUDA[c.resultado] }
    corpo = (
      <>
        <div style={{ fontSize: 13 }}>Converteu no formulário da <strong>{rotulo(c.marca)}</strong>{c.nome_sdr ? <> · foi para {c.nome_sdr}</> : null}</div>
        {c.motivo && c.resultado !== 'atribuido' && <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{c.motivo}</div>}
        {item.negocio ? <DetalheNegocio n={item.negocio} /> : c.id_deal ? (
          <div style={{ fontSize: 12, marginTop: 2 }}>
            <a href={linkRd(c.id_deal)} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-accent)' }}>Negócio no RD</a>
          </div>
        ) : null}
      </>
    )
  } else if (item.tipo === 'negocio') {
    marcador = { label: 'Negócio no RD', bg: 'var(--ws-bg)', fg: 'var(--ws-text-secondary)', title: 'Negócio com este e-mail no RD CRM (de antes da distribuição ou criado por fora dela)' }
    corpo = (
      <>
        <div style={{ fontSize: 13 }}>Negócio criado{item.negocio.criado_em ? '' : ' (sem data no espelho)'}</div>
        <DetalheNegocio n={item.negocio} />
      </>
    )
  } else {
    const l = item.log
    marcador = ACAO_VISUAL[l.acao]
    corpo = (
      <>
        <div style={{ fontSize: 13 }}>{resumoLog(l, rotulo)}</div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>por {l.autor} · “{l.motivo}”</div>
      </>
    )
  }
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '128px 1fr', gap: 12, padding: '10px 0', borderTop: '1px solid var(--ws-border)' }}>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        {item.quando ? fmtDataHoraAno(item.quando) : 'sem data'}
        <div style={{ marginTop: 4 }}><span style={pill(marcador.bg, marcador.fg)} title={marcador.title}>{marcador.label}</span></div>
      </div>
      <div style={{ minWidth: 0 }}>{corpo}</div>
    </li>
  )
}

export function HistoricoLead({ email, bloqueio, todas, rotulo, podeEditar, onEditar, onFechar }: Props) {
  const h = useHistoricoLead(email)
  const itens = useMemo(() => montarLinhaDoTempoLead(h.conversoes, h.negocios, h.log), [h.conversoes, h.negocios, h.log])
  const nome = bloqueio?.nome ?? h.conversoes.find(c => c.lead_nome)?.lead_nome ?? h.negocios.find(n => n.nome_contato)?.nome_contato ?? null
  const bloqueadas = h.conversoes.filter(c => c.resultado === 'bloqueado').length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFechar])

  return (
    <div role="dialog" aria-modal="true" aria-label={`Histórico de ${email}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }} onClick={onFechar}>
      <aside onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 100vw)', height: '100%', background: 'var(--ws-surface)', boxShadow: 'var(--shadow-md, -10px 0 30px rgba(0,0,0,.15))', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Histórico do lead</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 600 }}>{nome ?? email}</h2>
            {nome && <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)', overflowWrap: 'anywhere' }}>{email}</div>}
          </div>
          <button type="button" aria-label="Fechar" onClick={onFechar} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary)' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          {bloqueio?.bloqueado
            ? <span style={pill('var(--status-risco-bg)', 'var(--status-risco)')}>Bloqueado: {textoMarcas(bloqueio.marcas, todas, rotulo)}</span>
            : <span style={pill('var(--ws-bg)', 'var(--ws-text-secondary)')}>{bloqueio ? 'Desbloqueado' : 'Fora da lista de bloqueio'}</span>}
          <span style={{ color: 'var(--ws-text-secondary)' }}>
            {h.conversoes.length} {h.conversoes.length === 1 ? 'conversão' : 'conversões'} desde 16/10 · {bloqueadas} {bloqueadas === 1 ? 'bloqueada' : 'bloqueadas'} · {h.negocios.length} {h.negocios.length === 1 ? 'negócio' : 'negócios'} no RD
          </span>
          {podeEditar && <button type="button" style={botaoTexto()} onClick={onEditar}>{bloqueio?.bloqueado ? 'Editar marcas' : 'Bloquear'}</button>}
        </div>

        {h.error && <div style={bannerStyle('erro')}>Erro ao carregar: {h.error}</div>}
        {h.loading && itens.length === 0 && <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>Carregando…</div>}
        {!h.loading && itens.length === 0 && !h.error && <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nada registrado para este e-mail.</div>}

        {itens.length > 0 && (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {itens.map(i => <Item key={`${i.tipo}-${i.tipo === 'conversao' ? i.conversao.id : i.tipo === 'negocio' ? i.negocio.id_deal : i.log.id}`} item={i} rotulo={rotulo} />)}
          </ol>
        )}
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
          Conversões: as que chegaram na distribuição desde 16/10/2026. Negócios: todos os do RD CRM com este e-mail, de qualquer época.
        </p>
      </aside>
    </div>
  )
}
