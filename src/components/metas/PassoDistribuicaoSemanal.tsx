import { resolverFunilMarca, type EtapaMeta, type Semana } from '@/lib/metasEngine'
import type { DistribuicaoSemanalItem, EstadoMesMarca } from '@/hooks/useMetaMes'

const ETAPAS_DISTRIBUIVEIS: EtapaMeta[] = ['Ligações', 'Reunião Agendada SQL', 'Oportunidade COF', 'Fechamento']

export function PassoDistribuicaoSemanal({
  marcas, semanas, distribuicaoSemanal, onMudarValor,
}: {
  marcas: EstadoMesMarca[]
  semanas: Semana[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  onMudarValor: (nomePessoa: string, semanaNumero: number, etapa: EtapaMeta, valor: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => {
        const resolucao = resolverFunilMarca(m.etapas, m.ticketMedio)
        return (
          <div key={m.marca} style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{m.marca}</h3>
            {m.pessoas.map(p => (
              <div key={`${p.nome}-${p.funcao}`} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{p.nome} ({p.funcao})</div>
                {ETAPAS_DISTRIBUIVEIS.filter(e => (p.funcao === 'SDR' ? e !== 'Oportunidade COF' && e !== 'Fechamento' : e === 'Oportunidade COF' || e === 'Fechamento')).map(etapa => {
                  const metaPessoa = (resolucao.valores[etapa] ?? 0) * (p.peso / 100)
                  const itens = distribuicaoSemanal.filter(d => d.nomePessoa === p.nome && d.etapa === etapa)
                  const alocado = itens.reduce((s, d) => s + d.valor, 0)
                  return (
                    <div key={etapa} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, minWidth: 160 }}>{etapa}</span>
                      {semanas.map(s => {
                        const valorAtual = itens.find(d => d.semanaNumero === s.numero)?.valor ?? 0
                        return (
                          <input key={s.numero} type="number" value={valorAtual}
                            onChange={e => onMudarValor(p.nome, s.numero, etapa, Number(e.target.value))}
                            title={`S${s.numero}`}
                            style={{ width: 56, padding: '4px 6px', border: '1px solid var(--ws-border)', borderRadius: 6, fontSize: 12 }} />
                        )
                      })}
                      <span style={{ fontSize: 11, color: alocado > metaPessoa + 0.01 ? '#B91C1C' : 'var(--ws-text-secondary)' }}>
                        {Math.round(alocado * 10) / 10} / {Math.round(metaPessoa * 10) / 10}
                        {alocado > metaPessoa + 0.01 ? ' ▸ passou da meta' : alocado < metaPessoa - 0.01 ? ` ▸ faltam ${Math.round((metaPessoa - alocado) * 10) / 10}` : ' ✓'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
