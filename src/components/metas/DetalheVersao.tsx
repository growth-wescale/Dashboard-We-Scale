import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { marcaLabel } from '@/constants/brands'
import { buscarEstadoVersao, type EstadoMes, type VersaoMeta } from '@/hooks/useMetaMes'
import { ROTULO_ETAPA, type EtapaMetaConfig } from '@/lib/configMetas'
import { detalharVersao, etapaAbaixo, type DetalheEtapa, type DetalhePessoa } from '@/lib/detalheVersaoMeta'
import type { DiaSemana, Semana } from '@/lib/metasEngine'
import { bannerStyle, fmtBRL, fmtDec, fmtInt, fmtPct } from './metasUi'

// Versão publicada não muda (o banco bloqueia UPDATE/DELETE): busca uma vez por sessão.
const cacheEstado = new Map<number, EstadoMes>()

/** Funil de cima pra baixo; a conversão embaixo de cada número aponta pra coluna da direita. */
const FUNIL: EtapaMetaConfig[] = ['MQL', 'Reunião Agendada SQL', 'Reunião Realizada', 'SAL', 'Oportunidade COF']
// Sem MQL: é meta da marca, não do SDR. Versões antigas gravaram `meta_mql` por
// SDR no espelho; a coluna fica escondida também nelas.
const ETAPAS_SDR: EtapaMetaConfig[] = ['Reunião Agendada SQL', 'Reunião Realizada', 'SAL']
const ETAPAS_CLOSER: EtapaMetaConfig[] = ['Oportunidade COF', 'Fechamento']

const DIA_LABEL: Record<DiaSemana, string> = {
  segunda: 'segunda', terca: 'terça', quarta: 'quarta', quinta: 'quinta', sexta: 'sexta', sabado: 'sábado', domingo: 'domingo',
}

const th: CSSProperties = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'bottom' }
const td: CSSProperties = { padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }
const sub: CSSProperties = { fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 1 }

function fmtPeso(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

/** '2026-10-07' → '07/10' (sem passar por Date, pra não cair no dia anterior em Brasília). */
function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function CelulaEtapa({ etapa, d }: { etapa: EtapaMetaConfig; d: DetalheEtapa }) {
  if (d.meta == null) return <td style={{ ...td, color: 'var(--ws-text-secondary)' }}>—</td>
  const destino = etapaAbaixo(etapa)
  // Ligações e MQL ficam fora da sequência das colunas: diz pra onde a conversão aponta.
  const seta = destino && (etapa === 'Ligações' ? ` → ${ROTULO_ETAPA[destino]}` : ' →')
  const partes = [d.fixo && 'fixo', d.taxa != null && `${fmtPct(d.taxa)}${seta}`].filter(Boolean)
  return (
    <td style={td}>
      <div>{fmtInt(d.meta)}</div>
      {partes.length > 0 && <div style={sub}>{partes.join(' · ')}</div>}
    </td>
  )
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section>
      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{titulo}</h4>
      {nota && <p style={{ margin: '2px 0 8px', fontSize: 12, color: 'var(--ws-text-secondary)', lineHeight: 1.5 }}>{nota}</p>}
      {children}
    </section>
  )
}

export function DetalheVersao({ mes, versao }: { mes: string; versao: VersaoMeta }) {
  const [estado, setEstado] = useState<EstadoMes | null>(() => cacheEstado.get(versao.id) ?? null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (cacheEstado.has(versao.id)) return
    let ativo = true
    buscarEstadoVersao(versao.id)
      .then(r => {
        if (!ativo) return
        if (r.error) { setErro(r.error); return }
        cacheEstado.set(versao.id, r.estado)
        setEstado(r.estado)
      })
      .catch(e => { if (ativo) setErro(e instanceof Error ? e.message : String(e)) })
    return () => { ativo = false }
  }, [versao.id])

  if (erro) return <div style={bannerStyle('erro')}>Não deu pra carregar a configuração da V{versao.numero}: {erro}</div>
  if (!estado) return <div style={{ padding: 16, fontSize: 13, color: 'var(--ws-text-secondary)' }}>Carregando a configuração…</div>

  const d = detalharVersao(mes, versao, estado)
  const linhas = [...d.marcas, d.total]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Secao
        titulo="Funil por marca"
        nota="Embaixo de cada meta, a conversão dela para a etapa da direita (Oportunidade → Vendas, por exemplo). “Fixo” é número digitado à mão, em vez de calculado pela conversão."
      >
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Marca</th>
                {FUNIL.map(e => <th key={e} style={th}>{ROTULO_ETAPA[e]}</th>)}
                <th style={th}>Vendas</th>
                <th style={th}>Taxa de franquia</th>
                <th style={th}>Faturamento</th>
                <th style={th}>Ligações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(m => {
                const total = m === d.total
                return (
                  <tr key={m.marca} style={{ borderTop: total ? '2px solid var(--ws-border-strong)' : '1px solid var(--ws-border)', fontWeight: total ? 600 : 400 }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{total ? 'Total' : marcaLabel(m.marca)}</td>
                    {FUNIL.map(e => <CelulaEtapa key={e} etapa={e} d={m.etapas[e]} />)}
                    <td style={td}>{m.vendas != null ? fmtInt(m.vendas) : '—'}</td>
                    <td style={td}>
                      {m.ticketMedio != null ? fmtBRL(m.ticketMedio) : '—'}
                      {total && m.ticketMedio != null && <div style={{ ...sub, fontWeight: 400 }}>média</div>}
                    </td>
                    <td style={td}>{m.faturamento != null ? fmtBRL(m.faturamento) : '—'}</td>
                    <CelulaEtapa etapa="Ligações" d={m.etapas['Ligações']} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao
        titulo="Metas por pessoa"
        nota={versao.origem === 'importado'
          ? 'O que a versão grava pro dashboard medir cada pessoa: uma linha por marca e, quando ela atua em mais de uma, o total. Versão importada da planilha: a divisão entre as pessoas veio pronta, sem peso, e as metas quebradas só arredondam pra cima no total, como a Performance mostra.'
          : 'O que a versão grava pro dashboard medir cada pessoa: uma linha por marca, com o peso dela no time da marca, e o total quando ela atua em mais de uma.'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TabelaPessoas titulo="SDR" pessoas={d.sdrs} etapas={ETAPAS_SDR} />
          <TabelaPessoas titulo="Closer" pessoas={d.closers} etapas={ETAPAS_CLOSER} faturamento />
        </div>
      </Secao>

      <Secao
        titulo="Semanas"
        nota={`A semana vira na ${DIA_LABEL[d.diaViradaSemana]}.${d.vendasPorSemana.length > 0 ? ' Só as vendas são distribuídas à mão; as outras metas da semana seguem a mesma proporção.' : ''}`}
      >
        {d.vendasPorSemana.length > 0
          ? <TabelaSemanas semanas={d.semanas} linhas={d.vendasPorSemana} semDistribuicao={d.marcas.filter(m => (m.vendas ?? 0) > 0 && !d.vendasPorSemana.some(v => v.marca === m.marca)).map(m => marcaLabel(m.marca))} />
          : (
            <div style={{ fontSize: 13 }}>
              {d.semanas.map(s => `S${s.numero} ${ddmm(s.inicio)}–${ddmm(s.fim)}`).join(' · ')}
              <div style={{ ...sub, fontSize: 12, marginTop: 4 }}>Vendas não distribuídas por semana nesta versão.</div>
            </div>
          )}
      </Secao>
    </div>
  )
}

function TabelaPessoas({ titulo, pessoas, etapas, faturamento }: {
  titulo: string
  pessoas: DetalhePessoa[]
  etapas: EtapaMetaConfig[]
  faturamento?: boolean
}) {
  // Total da pessoa vem arredondado pra cima; a linha da marca mostra como foi gravada (meta quebrada só na planilha importada).
  const celulas = (valores: DetalhePessoa['valores'], fat: number | null, fmt: (n: number) => string) => (
    <>
      {etapas.map(e => <td key={e} style={td}>{valores[e] != null ? fmt(valores[e]!) : '—'}</td>)}
      {faturamento && <td style={td}>{fat != null ? fmtBRL(fat) : '—'}</td>}
    </>
  )
  return (
    <div className="rs-scroll-x">
      <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 330 + etapas.length * 80 + (faturamento ? 110 : 0) }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>{titulo}</th>
            <th style={{ ...th, textAlign: 'left' }}>Marca</th>
            <th style={th}>Peso</th>
            {etapas.map(e => <th key={e} style={th}>{ROTULO_ETAPA[e]}</th>)}
            {faturamento && <th style={th}>Faturamento</th>}
          </tr>
        </thead>
        <tbody>
          {pessoas.length === 0 && (
            <tr style={{ borderTop: '1px solid var(--ws-border)' }}>
              <td colSpan={etapas.length + (faturamento ? 4 : 3)} style={{ ...td, textAlign: 'left', color: 'var(--ws-text-secondary)' }}>Ninguém nesta função.</td>
            </tr>
          )}
          {pessoas.flatMap(p => {
            // Com uma marca só, a linha da marca já é o total da pessoa.
            const comTotal = p.marcas.length > 1
            const linhas = p.marcas.map((m, i) => (
              <tr key={`${p.nome}|${m.marca}`} style={{ borderTop: `1px solid var(${i === 0 ? '--ws-border-strong' : '--ws-border'})` }}>
                {i === 0 && (
                  <td rowSpan={p.marcas.length + (comTotal ? 1 : 0)} style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{p.nome}</td>
                )}
                <td style={{ ...td, textAlign: 'left' }}>{marcaLabel(m.marca)}</td>
                <td style={{ ...td, color: 'var(--ws-text-secondary)' }}>{m.peso != null ? fmtPeso(m.peso) : '—'}</td>
                {comTotal ? celulas(m.valores, m.faturamento, fmtDec) : celulas(p.valores, p.faturamento, fmtInt)}
              </tr>
            ))
            if (comTotal) {
              linhas.push(
                <tr key={`${p.nome}|total`} style={{ borderTop: '1px solid var(--ws-border)', background: 'var(--ws-bg)', fontWeight: 600 }}>
                  <td style={{ ...td, textAlign: 'left' }}>Total</td>
                  <td style={td} />
                  {celulas(p.valores, p.faturamento, fmtInt)}
                </tr>,
              )
            }
            return linhas
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaSemanas({ semanas, linhas, semDistribuicao }: {
  semanas: Semana[]
  linhas: { marca: string; porSemana: number[]; total: number }[]
  semDistribuicao: string[]
}) {
  return (
    <>
      <div className="rs-scroll-x">
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 120 + semanas.length * 90 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Vendas por semana</th>
              {semanas.map(s => (
                <th key={s.numero} style={th}>
                  S{s.numero}
                  <div style={{ fontWeight: 400 }}>{ddmm(s.inicio)}–{ddmm(s.fim)}</div>
                </th>
              ))}
              <th style={th}>Mês</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.marca} style={{ borderTop: '1px solid var(--ws-border)' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{marcaLabel(l.marca)}</td>
                {l.porSemana.map((v, i) => (
                  <td key={semanas[i].numero} style={{ ...td, color: v > 0 ? 'var(--ws-text-primary)' : 'var(--ws-text-secondary)' }}>{v > 0 ? fmtInt(v) : '—'}</td>
                ))}
                <td style={{ ...td, fontWeight: 600 }}>{fmtInt(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {semDistribuicao.length > 0 && (
        <div style={{ ...sub, fontSize: 12, marginTop: 6 }}>
          Sem vendas distribuídas por semana: {semDistribuicao.join(', ')} (a Campanha de Metas rateia pelos dias).
        </div>
      )}
    </>
  )
}
