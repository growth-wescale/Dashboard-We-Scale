import { useTaxaMesAnterior } from '@/hooks/useSalvarMeta'
import type { EtapaMeta } from '@/lib/metasEngine'
import type { EstadoMesMarca } from '@/hooks/useMetaMes'

export function PassoTaxas({
  marcas, mesAnterior, onMudarTaxa,
}: {
  marcas: EstadoMesMarca[]
  mesAnterior: string
  onMudarTaxa: (marca: string, etapa: EtapaMeta, taxa: number, origem: 'mes_anterior' | 'historico_crm' | 'manual') => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => (
        <div key={m.marca} style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{m.marca}</h3>
          {m.etapas.filter(e => e.modo === 'derivado').map(e => (
            <LinhaTaxa key={e.etapa} marca={m.marca} etapa={e.etapa} etapaOrigem={e.etapaOrigem!}
              taxaAtual={e.taxa} mesAnterior={mesAnterior} onMudarTaxa={onMudarTaxa} />
          ))}
          {m.etapas.filter(e => e.modo === 'derivado').length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>Nenhuma etapa derivada configurada ainda — volte ao Passo 3 pra definir o modo de cada etapa primeiro.</p>
          )}
        </div>
      ))}
    </div>
  )
}

function LinhaTaxa({
  marca, etapa, etapaOrigem, taxaAtual, mesAnterior, onMudarTaxa,
}: {
  marca: string
  etapa: EtapaMeta
  etapaOrigem: EtapaMeta
  taxaAtual: number | undefined
  mesAnterior: string
  onMudarTaxa: (marca: string, etapa: EtapaMeta, taxa: number, origem: 'mes_anterior' | 'historico_crm' | 'manual') => void
}) {
  const { taxa: taxaMesAnterior } = useTaxaMesAnterior(mesAnterior, marca, etapa)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--ws-border)' }}>
      <span style={{ fontSize: 13, minWidth: 220 }}>{etapaOrigem} → {etapa}</span>
      <input type="number" step="0.1" min="0" max="100"
        value={taxaAtual != null ? Math.round(taxaAtual * 1000) / 10 : ''}
        onChange={e => onMudarTaxa(marca, etapa, Number(e.target.value) / 100, 'manual')}
        style={{ width: 90, padding: '6px 10px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
      <span style={{ fontSize: 12 }}>%</span>
      {taxaMesAnterior != null && (
        <button onClick={() => onMudarTaxa(marca, etapa, taxaMesAnterior, 'mes_anterior')}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--ws-border)', background: 'var(--ws-bg)', cursor: 'pointer' }}>
          usar mês anterior · {(taxaMesAnterior * 100).toFixed(1)}%
        </button>
      )}
    </div>
  )
}
