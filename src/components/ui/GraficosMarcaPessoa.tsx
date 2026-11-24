import { nf } from '@/lib/format'
import { BarList } from './dealDrawerShared'
import type { GraficosMarcaPessoa as Graficos } from './useGraficosMarcaPessoa'

/** Faixa com "Por Marca" + "Por <pessoa>" (e um gráfico extra opcional, ex.
 *  "Por Etapa") no topo dos pop-ups de deals. */
export function GraficosMarcaPessoa<T>({ g, tituloPessoa, total, extra }: {
  g: Graficos<T>
  tituloPessoa: string
  /** Tamanho da lista inteira, pra dizer "X de Y" quando há filtro. */
  total: number
  extra?: React.ReactNode
}) {
  const temFiltro = g.filtro.marca.length > 0 || g.filtro.pessoa.length > 0
  return (
    <div className="rs-drawer-sec" style={{
      padding: '18px 24px', borderBottom: '1px solid var(--ws-border)',
      display: 'flex', gap: 32, flexShrink: 0, flexWrap: 'wrap',
    }}>
      <BarList title="Por Marca" rows={g.porMarca} total={g.totalMarca}
        selecionados={g.filtro.marca} onSelect={v => g.alternar('marca', v)} />
      <BarList title={tituloPessoa} rows={g.porPessoa} total={g.totalPessoa}
        selecionados={g.filtro.pessoa} onSelect={v => g.alternar('pessoa', v)} />
      {extra}
      <div style={{ flexBasis: '100%', fontSize: 11.5, color: 'var(--ws-text-secondary)', marginTop: -16 }}>
        {temFiltro ? (
          <>
            Mostrando {nf(g.filtrados.length)} de {nf(total)} deals.{' '}
            <button onClick={g.limpar} style={{
              border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
              color: 'var(--ws-text-primary)', textDecoration: 'underline', font: 'inherit',
            }}>Limpar filtro</button>
          </>
        ) : 'Clique numa barra pra filtrar a lista; clique de novo pra tirar.'}
      </div>
    </div>
  )
}
