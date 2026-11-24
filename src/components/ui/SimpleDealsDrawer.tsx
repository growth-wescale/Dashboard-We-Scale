/**
 * Pop-up leve pros quadrantes de KPI (Receita, Fechamentos, Vendas por Fonte)
 * — a lista de deals que compõem o número, com os gráficos Por Marca e Por
 * Closer no topo (clicáveis), sem a barra de filtros. Os
 * pop-ups do funil (StageDealsDrawer) têm mais contexto porque respondem
 * "quem está nessa etapa"; aqui a pergunta é só "quais deals são esses".
 */

import { ExternalLink, X } from 'lucide-react'
import type { FunnelRow } from '@/lib/funnelTypes'
import { rdDealUrl } from '@/lib/rd'
import { money, nf } from '@/lib/format'
import { marcaLabel } from '@/constants/brands'
import { dividirVenda, pctWeScale, type VersaoRepasse } from '@/lib/repasse'
import { CelulasDatasDeal, COLS_DATAS_DEAL, LinkLinhaDoTempo, cell, fmtData, totaisDeals, LinhaTotal, CelulasLeadtime, COLS_LEADTIME, SeloResgate } from './dealDrawerShared'
import { LinkPontosCorrida } from '@/components/corrida/PontosDoNegocio'
import { useGraficosMarcaPessoa } from './useGraficosMarcaPessoa'
import { GraficosMarcaPessoa } from './GraficosMarcaPessoa'
import { useGravacoesDeal } from '@/hooks/useGravacoesDeal'
import { COL_GRAVACOES } from '@/lib/gravacoesDeal'
import { CelulaGravacoes } from './GravacoesDeal'

interface SimpleDealsDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  deals: FunnelRow[]
  accent: string
  /** Destaca a coluna Fonte (usado pelo pop-up de Vendas por Fonte). */
  destacarFonte?: boolean
  /** Versões do repasse: quando vem, mostra quanto do valor fica com a We Scale e com a marca. */
  repasse?: VersaoRepasse[]
}

const marcaDe = (r: FunnelRow) => r.marca
// Os quadrantes que abrem este pop-up são de venda (Receita, Fechamentos,
// Vendas por fonte): quem fecha é o Closer.
const closerDe = (r: FunnelRow) => r.nome_closer

export function SimpleDealsDrawer({ open, onClose, title, subtitle, deals: todos, accent, destacarFonte, repasse }: SimpleDealsDrawerProps) {
  const g = useGraficosMarcaPessoa(todos, marcaDe, closerDe, accent, open ? `${title}|${subtitle}` : '')
  const { porDeal: gravacoes, pronto: gravacoesProntas } = useGravacoesDeal(open)
  if (!open) return null
  const deals = g.filtrados
  const colsRepasse = repasse ? ['We Scale', 'Marca'] : []
  const direita = ['Valor', 'Unidades', 'Taxa de Franquia', ...COLS_LEADTIME, ...colsRepasse]
  const totais = totaisDeals(deals)
  const repasseTotal = repasse
    ? deals.reduce((acc, r) => { const d = dividirVenda(repasse, r); return { weScale: acc.weScale + d.weScale, marca: acc.marca + d.marca } }, { weScale: 0, marca: 0 })
    : null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
        zIndex: 1000, backdropFilter: 'blur(2px)',
      }} />

      <div className="rs-drawer" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(900px, 96vw)',
        background: 'var(--ws-surface)', borderLeft: '1px solid var(--ws-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)', zIndex: 1001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="rs-drawer-head" style={{
          padding: '20px 24px', borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20 }}>
              {title}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)', marginTop: 3 }}>
              {todos.length} deal{todos.length !== 1 ? 's' : ''} · {subtitle}
            </div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ws-text-secondary)', padding: 6, borderRadius: 6,
            display: 'flex', alignItems: 'center',
          }}>
            <X size={20} />
          </button>
        </div>

        <GraficosMarcaPessoa g={g} tituloPessoa="Por Closer" total={todos.length} />

        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'var(--ws-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Negociação', COL_GRAVACOES, 'Marca', 'Fonte', 'Unidades', 'Taxa de Franquia', 'Valor', ...colsRepasse, ...COLS_DATAS_DEAL, ...COLS_LEADTIME, 'Data'].map((h, i) => (
                  // "Marca" aparece duas vezes com o repasse (marca do negócio e parte da marca).
                  <th key={`${h}-${i}`} style={{
                    padding: '10px 16px', textAlign: direita.includes(h) ? 'right' : 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--ws-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--ws-border)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={12 + colsRepasse.length} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ws-text-secondary)' }}>
                    Nenhum deal no recorte selecionado.
                  </td>
                </tr>
              ) : deals.map((r, i) => (
                <tr key={`${r.id_lead}::${r.ciclo}::${i}`} style={{
                  background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--ws-border) 20%, transparent)',
                  borderBottom: '1px solid var(--ws-border)',
                }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <a href={rdDealUrl(r.id_lead)} target="_blank" rel="noreferrer" style={{
                      color: accent, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      {cell(r.nome_negociacao)}
                      <ExternalLink size={11} />
                    </a>
                    <SeloResgate row={r} />
                    <LinkLinhaDoTempo idDeal={r.id_lead} cor={accent} />
                    <LinkPontosCorrida row={r} cor={accent} />
                  </td>
                  <CelulaGravacoes gravacoes={gravacoes.get(r.id_lead)} pronto={gravacoesProntas} accent={accent} />
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{cell(marcaLabel(r.marca))}</td>
                  <td style={{
                    padding: '10px 16px', whiteSpace: 'nowrap',
                    fontWeight: destacarFonte ? 600 : 400,
                    color: destacarFonte ? accent : 'var(--ws-text-secondary)',
                  }}>{cell(r.fonte_macro)}</td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {nf(r.quantidade_unidades ?? 0)}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.valor_produto != null ? money(r.valor_produto) : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.valor_contrato ? money(r.valor_contrato) : '—'}
                  </td>
                  {repasse && (() => {
                    const d = dividirVenda(repasse, r)
                    const pct = pctWeScale(repasse, r.marca, r.data_venda)
                    return <>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {d.total ? money(d.weScale) : '—'}
                        {d.total > 0 && pct < 100 && <span style={{ color: 'var(--ws-text-secondary)', fontWeight: 400, fontSize: 11, marginLeft: 5 }}>{pct.toLocaleString('pt-BR')}%</span>}
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ws-text-secondary)' }}>
                        {d.marca > 0 ? money(d.marca) : '—'}
                      </td>
                    </>
                  })()}
                  <CelulasDatasDeal row={r} />
                  <CelulasLeadtime row={r} ate={r.data_venda} agora={Date.now()} />
                  <td style={{ padding: '10px 16px', color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtData(r.data_venda)}
                  </td>
                </tr>
              ))}
            </tbody>
            {deals.length > 0 && (
              <LinhaTotal deals={totais.deals} colSpanRotulo={4} celulas={[
                { valor: nf(totais.unidades), direita: true },
                { valor: money(totais.taxa), direita: true },
                { valor: money(totais.contrato), direita: true },
                ...(repasseTotal ? [{ valor: money(repasseTotal.weScale), direita: true }, { valor: money(repasseTotal.marca), direita: true }] : []),
                { valor: null }, { valor: null }, { valor: null }, { valor: null }, { valor: null },
              ]} />
            )}
          </table>
        </div>
      </div>
    </>
  )
}
