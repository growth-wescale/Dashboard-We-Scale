import { useState } from 'react'
import { ArrowRight, ChevronRight, Plus } from 'lucide-react'
import { BRAND_ACCENT, marcaLabel } from '@/constants/brands'
import { calcularFunil, marcasDisponiveis, pendenciasMarca, resumoRascunho, statusMarca, type RascunhoConfig } from '@/lib/configMetas'
import {
  STATUS_MARCA_UI, bannerStyle, cardStyle, fmtBRL, fmtInt, infoBoxStyle, inputStyle,
  nomeMesMinusculo, pillStyle, primaryButtonStyle, smallButtonStyle,
} from './metasUi'
import './metas.css'

export function PainelMarcas({ rascunho, onAbrirMarca, onAdicionarMarcas, onAvancar }: {
  rascunho: RascunhoConfig
  onAbrirMarca: (marca: string) => void
  onAdicionarMarcas: (marcas: string[]) => void
  onAvancar: () => void
}) {
  const itens = rascunho.marcas.map(m => {
    const funil = calcularFunil(m)
    const pendencias = pendenciasMarca(m, funil)
    return { m, funil, pendencias, status: statusMarca(m, pendencias) }
  })
  const resumo = resumoRascunho(rascunho)
  const disponiveis = marcasDisponiveis(rascunho)
  const proxima = itens.find(i => i.status !== 'configurada')
  const mes = nomeMesMinusculo(rascunho.mesReferencia)

  if (itens.length === 0) {
    return <EscolherMarcas mes={mes} disponiveis={disponiveis} onAdicionar={onAdicionarMarcas} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="rs-grid rs-cols-3" style={{ gap: 12 }}>
        <Numero rotulo="Vendas previstas" valor={fmtInt(resumo.vendas)} />
        <Numero rotulo="Faturamento previsto" valor={fmtBRL(resumo.faturamento)} />
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Marcas prontas</div>
          <div style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 8px' }}>{resumo.prontas} de {resumo.total}</div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--ws-bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(resumo.prontas / resumo.total) * 100}%`, background: 'var(--status-positivo)', transition: 'width .3s' }} />
          </div>
        </div>
      </div>

      {proxima ? (
        <div style={{ ...infoBoxStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            Entre em cada marca e informe as vendas de {mes} — o resto já vem calculado. Marca pronta fica verde.
          </span>
          <button type="button" onClick={() => onAbrirMarca(proxima.m.marca)} style={{ ...smallButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Configurar {marcaLabel(proxima.m.marca)} <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div style={bannerStyle('sucesso')}>Todas as marcas estão configuradas. Siga para Semanas ou direto para Revisar e publicar.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
        {itens.map(({ m, funil, pendencias, status }) => {
          const sql = funil.etapas['Reunião Agendada SQL'].meta
          return (
            <button
              key={m.marca}
              type="button"
              className="cm-card-marca"
              onClick={() => onAbrirMarca(m.marca)}
              style={{ ...cardStyle, padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-body)', color: 'var(--ws-text-primary)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: BRAND_ACCENT[m.marca] ?? 'var(--ws-border-strong)' }} aria-hidden />
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>{marcaLabel(m.marca)}</span>
                <span style={pillStyle(STATUS_MARCA_UI[status].kind)}>{STATUS_MARCA_UI[status].rotulo}</span>
              </div>
              {m.vendas == null ? (
                <div style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>
                  Vendas de {mes} ainda não informadas{m.referencia?.vendas != null ? ` · ${m.referencia.rotulo}: ${fmtInt(m.referencia.vendas)}` : ''}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
                  <span><b style={{ fontSize: 16, color: 'var(--ws-text-primary)' }}>{fmtInt(m.vendas)}</b> vendas</span>
                  <span><b style={{ fontSize: 16, color: 'var(--ws-text-primary)' }}>{funil.faturamento != null ? fmtBRL(funil.faturamento) : '—'}</b></span>
                  {sql != null && <span><b style={{ fontSize: 16, color: 'var(--ws-text-primary)' }}>{fmtInt(sql)}</b> SQL</span>}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: 12 }}>
                <span style={{ color: status === 'em_configuracao' ? 'var(--status-atencao)' : 'var(--ws-text-secondary)' }}>
                  {status === 'configurada' ? 'Tudo certo' : status === 'em_configuracao' ? `${pendencias.length} ${pendencias.length === 1 ? 'pendência' : 'pendências'}` : 'Comece pelas vendas'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--brand-accent)', fontWeight: 600 }}>
                  {status === 'nao_configurada' ? 'Configurar' : 'Editar'} <ChevronRight size={14} />
                </span>
              </div>
            </button>
          )
        })}
        {disponiveis.length > 0 && <AdicionarMarca disponiveis={disponiveis} onAdicionar={nome => onAdicionarMarcas([nome])} />}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAvancar} style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Continuar para Semanas <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{rotulo}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{valor}</div>
    </div>
  )
}

function AdicionarMarca({ disponiveis, onAdicionar }: { disponiveis: string[]; onAdicionar: (marca: string) => void }) {
  return (
    <div style={{
      border: '1.5px dashed var(--ws-border-strong)', borderRadius: 'var(--radius-md)', padding: 16,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, minHeight: 120,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Plus size={14} /> Adicionar marca
      </span>
      <select value="" onChange={e => { if (e.target.value) onAdicionar(e.target.value) }} style={{ ...inputStyle, cursor: 'pointer' }} aria-label="Adicionar marca">
        <option value="">Escolha a marca…</option>
        {disponiveis.map(m => <option key={m} value={m}>{marcaLabel(m)}</option>)}
      </select>
    </div>
  )
}

function EscolherMarcas({ mes, disponiveis, onAdicionar }: { mes: string; disponiveis: string[]; onAdicionar: (marcas: string[]) => void }) {
  const [marcadas, setMarcadas] = useState<string[]>([])
  const alternar = (m: string) => setMarcadas(atual => (atual.includes(m) ? atual.filter(x => x !== m) : [...atual, m]))
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Quais marcas terão meta em {mes}?</h3>
      <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--ws-text-secondary)' }}>
        Marque as marcas e depois configure cada uma. Dá pra adicionar ou tirar marcas a qualquer momento.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 8, marginBottom: 16 }}>
        {disponiveis.map(m => (
          <label key={m} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', fontSize: 13,
            border: '1px solid ' + (marcadas.includes(m) ? 'var(--brand-accent)' : 'var(--ws-border)'), borderRadius: 'var(--radius-sm)',
          }}>
            <input type="checkbox" checked={marcadas.includes(m)} onChange={() => alternar(m)} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND_ACCENT[m] ?? 'var(--ws-border-strong)' }} aria-hidden />
            {marcaLabel(m)}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onAdicionar(marcadas)}
        disabled={marcadas.length === 0}
        style={{ ...primaryButtonStyle, opacity: marcadas.length === 0 ? 0.5 : 1, cursor: marcadas.length === 0 ? 'not-allowed' : 'pointer' }}
      >
        {marcadas.length === 0 ? 'Marque pelo menos uma marca' : `Adicionar ${marcadas.length} ${marcadas.length === 1 ? 'marca' : 'marcas'}`}
      </button>
    </div>
  )
}
