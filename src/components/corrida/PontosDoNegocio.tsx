import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Flag, X } from 'lucide-react'
import { marcaLabel } from '@/constants/brands'
import { useRosterVendas } from '@/hooks/useRosterVendas'
import { usePontosDoNegocio } from '@/hooks/usePontosDoNegocio'
import {
  contaTexto,
  dataCompleta,
  fatorBonus,
  fatorFonte,
  fatorTicket,
  fatorVelocidade,
  mesDaRr,
  mesDaVenda,
  mesTexto,
  pontosTexto,
  situacaoCloser,
  situacaoSdr,
  type NegocioCorrida,
  type SituacaoTrilha,
} from '@/lib/corridaExtrato'

/**
 * "pontos" nos pop-ups de negócio: o caminho contrário do extrato da Campanha
 * de Metas. Mostra quantos pontos o negócio (+ ciclo) deu na Corrida, ao SDR
 * pela reunião realizada e ao Closer pela venda, com o porquê de cada fator —
 * ou o motivo de não ter dado ponto.
 */

type NegocioDoPopup = NegocioCorrida & { nome_negociacao: string | null; marca: string | null }

/** Link ao lado de "linha do tempo" na célula da negociação. */
export function LinkPontosCorrida({ row, cor }: { row: NegocioDoPopup; cor: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        title="Pontos deste negócio na Corrida de Performance"
        onClick={e => { e.stopPropagation(); setAberto(true) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 10, color: cor, padding: 0,
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}
      >
        <Flag size={12} />
        pontos
      </button>
      {aberto && createPortal(<PontosDoNegocioModal row={row} onClose={() => setAberto(false)} />, document.body)}
    </>
  )
}

function PontosDoNegocioModal({ row, onClose }: { row: NegocioDoPopup; onClose: () => void }) {
  const { porMes, loading, error } = usePontosDoNegocio(row)
  const { data: cadastro } = useRosterVendas()
  // Sem o mês carregado, a situação volta 'precisa_mes' e o bloco mostra "Carregando…".
  const sdr = situacaoSdr(row, porMes.get(mesDaRr(row) ?? ''), cadastro)
  const closer = situacaoCloser(row, porMes.get(mesDaVenda(row) ?? ''), cadastro)

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [onClose])

  return (
    <div
      onClick={e => { e.stopPropagation(); onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-label="Pontos do negócio na Corrida"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(600px, 100%)', maxHeight: '88vh', overflow: 'auto', background: 'var(--ws-surface)',
          borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.25)', fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#B91C1C' }}>
              Pontos na Corrida de Performance
            </div>
            <h2 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 19, overflowWrap: 'anywhere' }}>
              {row.nome_negociacao?.trim() || 'Negócio sem nome'}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
              {marcaLabel(row.marca) || 'sem marca'}{row.ciclo > 1 ? ` · ciclo ${row.ciclo} (negócio retomado)` : ''}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{
            border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ws-text-secondary)',
            padding: 6, borderRadius: 6, display: 'flex', flexShrink: 0,
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '6px 20px 18px', display: 'flex', flexDirection: 'column' }}>
          <BlocoTrilha titulo="Trilha SDR · reunião realizada" situacao={sdr} loading={loading} error={error} />
          <BlocoTrilha titulo="Trilha Closer · venda" situacao={closer} loading={loading} error={error} />
          <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: 12, lineHeight: 1.5 }}>
            Só quem tem meta no mês participa. A regra completa e o extrato de todos os pontos estão na{' '}
            <Link to="/gp-setembro" onClick={onClose} style={{ color: '#B91C1C', fontWeight: 600 }}>Campanha de Metas</Link>.
          </div>
        </div>
      </div>
    </div>
  )
}

function BlocoTrilha({ titulo, situacao, loading, error }: {
  titulo: string
  situacao: SituacaoTrilha
  loading: boolean
  error: string | null
}) {
  return (
    <section style={{ paddingTop: 14, marginTop: 8, borderTop: '1px solid var(--ws-border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ws-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        {titulo}
      </div>
      {situacao.tipo === 'precisa_mes' ? (
        <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>
          {error && !loading ? `Não deu para carregar a Corrida de ${mesTexto(situacao.mes)}: ${error}` : 'Carregando…'}
        </div>
      ) : situacao.tipo === 'nao_pontuou' ? (
        <div style={{
          fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: 8,
          background: '#FFFBEB', border: '1px solid #FDE68A', color: '#78350F',
        }}>
          <b>Não deu ponto.</b> {situacao.motivo}
        </div>
      ) : (
        <Pontuou situacao={situacao} />
      )}
    </section>
  )
}

function Pontuou({ situacao }: { situacao: Extract<SituacaoTrilha, { tipo: 'pontuou' }> }) {
  const l = situacao.lancamento
  const fatores = [
    { nome: 'Fonte → peso', f: fatorFonte(l) },
    { nome: 'Bônus do dia', f: fatorBonus(l) },
    { nome: 'Ticket da marca', f: fatorTicket(l) },
    { nome: 'Velocidade', f: fatorVelocidade(l) },
  ]
  const oQue = l.trilha === 'sdr' ? 'Reunião realizada' : 'Venda'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600 }}>{pontosTexto(l.pontos)}</span>
        <span style={{ fontSize: 13 }}>para <b>{l.nome}</b></span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        {oQue} em {dataCompleta(l.data)}{l.trilha === 'closer' && l.unidades > 1 ? ` · ${l.unidades} unidades` : ''} · conta na Corrida de {mesTexto(situacao.mes)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 8 }}>
        {fatores.map(({ nome, f }) => (
          <div key={nome} style={{ border: '1px solid var(--ws-border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ws-text-secondary)' }}>{nome}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: f.valor === 'sem bônus' ? 'var(--ws-text-secondary)' : '#B91C1C', marginTop: 2 }}>{f.valor}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)', lineHeight: 1.35 }}>{f.motivo}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, padding: '8px 10px', borderRadius: 8, background: 'var(--ws-bg)' }}>
        <b>Conta:</b> {contaTexto(l)}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ws-text-secondary)' }}>
        Total de {l.nome} na Corrida de {mesTexto(situacao.mes)} (mês inteiro): <b>{situacao.totalPessoaMes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pts</b>
      </div>
    </div>
  )
}
