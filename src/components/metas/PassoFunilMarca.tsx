import { ETAPAS_META_ORDEM, resolverFunilMarca, detectarGaps, type ConfigEtapa, type EtapaMeta, type ModoEtapa } from '@/lib/metasEngine'
import type { EstadoMesMarca } from '@/hooks/useMetaMes'
import { cardStyle, sectionTitleStyle, inputStyle, bannerStyle } from '@/components/metas/metasUi'

export function PassoFunilMarca({
  marcas, onMudarEtapa, onMudarTicket,
}: {
  marcas: EstadoMesMarca[]
  onMudarEtapa: (marca: string, etapa: EtapaMeta, config: Partial<ConfigEtapa>) => void
  onMudarTicket: (marca: string, ticket: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => <CartaoMarca key={m.marca} marca={m} onMudarEtapa={onMudarEtapa} onMudarTicket={onMudarTicket} />)}
      {marcas.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
          Nenhuma marca neste rascunho ainda.
        </div>
      )}
    </div>
  )
}

function CartaoMarca({
  marca, onMudarEtapa, onMudarTicket,
}: {
  marca: EstadoMesMarca
  onMudarEtapa: (marca: string, etapa: EtapaMeta, config: Partial<ConfigEtapa>) => void
  onMudarTicket: (marca: string, ticket: number) => void
}) {
  const resolucao = resolverFunilMarca(marca.etapas, marca.ticketMedio)
  const gaps = detectarGaps(marca.etapas, resolucao)
  const porEtapa = new Map(marca.etapas.map(e => [e.etapa, e]))

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <h3 style={{ ...sectionTitleStyle, margin: 0 }}>{marca.marca}</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
          Ticket médio
          <input type="number" value={marca.ticketMedio} onChange={e => onMudarTicket(marca.marca, Number(e.target.value))}
            style={{ ...inputStyle, width: 100 }} />
        </label>
      </div>

      {/* 4 colunas fixas (~420px): no celular rola na horizontal em vez de sobrepor */}
      <div className="rs-scroll-x">
      <div style={{ minWidth: 460 }}>
      {ETAPAS_META_ORDEM.map(etapa => {
        const cfg = porEtapa.get(etapa) ?? { etapa, modo: 'desligado' as ModoEtapa }
        const valor = resolucao.valores[etapa]
        return (
          <div key={etapa} style={{ display: 'grid', gridTemplateColumns: '160px 140px 1fr 100px', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--ws-border)' }}>
            <span style={{ fontSize: 13 }}>{etapa}</span>
            <select value={cfg.modo} onChange={e => onMudarEtapa(marca.marca, etapa, { modo: e.target.value as ModoEtapa })}
              style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}>
              <option value="fixo">Fixo</option>
              <option value="derivado">Derivado</option>
              <option value="desligado">Desligado</option>
            </select>
            {cfg.modo === 'fixo' && (
              <input type="number" value={cfg.valorFixo ?? ''} onChange={e => onMudarEtapa(marca.marca, etapa, { valorFixo: Number(e.target.value) })}
                style={{ ...inputStyle, width: 100, padding: '4px 8px' }} />
            )}
            {cfg.modo === 'derivado' && (
              <select value={cfg.etapaOrigem ?? ''} onChange={e => onMudarEtapa(marca.marca, etapa, { etapaOrigem: e.target.value as EtapaMeta })}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}>
                <option value="">origem…</option>
                {ETAPAS_META_ORDEM.filter(e => e !== etapa).map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
            {cfg.modo === 'desligado' && <span />}
            <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
              {valor != null ? Math.round(valor * 10) / 10 : '—'}
            </span>
          </div>
        )
      })}
      </div>
      </div>

      <div style={{ marginTop: 10, padding: '8px 0', borderTop: '2px solid var(--brand-accent)', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
        <span>Faturamento</span>
        <span>{resolucao.faturamento != null ? `R$ ${resolucao.faturamento.toLocaleString('pt-BR')}` : '—'}</span>
      </div>

      {resolucao.erros.length > 0 && (
        <div style={{ marginTop: 10, ...bannerStyle('erro') }}>
          {resolucao.erros.map((e, i) => <div key={i}>{e.mensagem}</div>)}
        </div>
      )}

      {gaps.filter(g => g.diverge).length > 0 && (
        <div style={{ marginTop: 10, ...bannerStyle('atencao') }}>
          {gaps.filter(g => g.diverge).map((g, i) => (
            <div key={i}>
              {g.etapaTopo} → {g.etapaFundo}: taxa configurada {((g.taxaConfigurada ?? 0) * 100).toFixed(1)}%,
              mas o resultado implica {(g.taxaImplicita * 100).toFixed(1)}%.
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
