import { useRosterVendas } from '@/hooks/useRosterVendas'
import type { PessoaComFuncao } from '@/lib/metasEngine'
import type { EstadoMesMarca } from '@/hooks/useMetaMes'

export function PassoPessoas({
  marcas, onMudarPessoas,
}: {
  marcas: EstadoMesMarca[]
  onMudarPessoas: (marca: string, pessoas: PessoaComFuncao[]) => void
}) {
  const { data: roster } = useRosterVendas()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {marcas.map(m => (
        <div key={m.marca} style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>{m.marca}</h3>

          {(['SDR', 'Closer'] as const).map(funcao => {
            const dessaFuncao = m.pessoas.filter(p => p.funcao === funcao)
            const somaPeso = dessaFuncao.reduce((s, p) => s + p.peso, 0)
            return (
              <div key={funcao} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ws-text-secondary)', marginBottom: 6 }}>
                  {funcao}{somaPeso !== 100 && dessaFuncao.length > 0 && ` — pesos somam ${somaPeso}%, não 100%`}
                </div>

                {dessaFuncao.map(p => (
                  <div key={p.nome + '_' + p.funcao} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, minWidth: 140 }}>{p.nome}</span>
                    <input type="number" value={p.peso} min={0} max={100}
                      onChange={e => onMudarPessoas(m.marca, m.pessoas.map(x => x.nome === p.nome && x.funcao === funcao ? { ...x, peso: Number(e.target.value) } : x))}
                      style={{ width: 70, padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6 }} />
                    <span style={{ fontSize: 12 }}>%</span>
                    <button onClick={() => onMudarPessoas(m.marca, m.pessoas.filter(x => !(x.nome === p.nome && x.funcao === funcao)))}
                      style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}>remover</button>
                  </div>
                ))}

                <select value="" onChange={e => {
                  if (!e.target.value) return
                  onMudarPessoas(m.marca, [...m.pessoas, { nome: e.target.value, funcao, peso: dessaFuncao.length === 0 ? 100 : Math.round(100 / (dessaFuncao.length + 1)) }])
                }} style={{ padding: '4px 8px', border: '1px solid var(--ws-border)', borderRadius: 6, fontSize: 12, marginTop: 4 }}>
                  <option value="">+ adicionar {funcao}…</option>
                  {(roster ?? [])
                    .filter(pessoa => pessoa.cargo === funcao || pessoa.cargo === 'SDR/Closer')
                    .filter(pessoa => !dessaFuncao.some(d => d.nome === pessoa.nome))
                    .map(pessoa => <option key={pessoa.nome} value={pessoa.nome}>{pessoa.nome}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
