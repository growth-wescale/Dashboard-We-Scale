import { useState, type CSSProperties } from 'react'
import { marcaLabel } from '@/constants/brands'
import { useAcesso } from '@/contexts/AcessoContext'
import type { VersaoMeta } from '@/hooks/useMetaMes'
import { publicarVersao } from '@/hooks/useSalvarMeta'
import {
  ETAPAS_FUNIL, ROTULO_ETAPA, arredondarMeta, calcularFunil, metasPorPessoa, montarPublicacao,
  pendenciasMarca, resumoRascunho, statusMarca, type EtapaMetaConfig, type RascunhoConfig,
} from '@/lib/configMetas'
import {
  STATUS_MARCA_UI, bannerStyle, cardStyle, disabledButtonStyle, fmtBRL, fmtInt, inputStyle,
  pillStyle, primaryButtonStyle, smallButtonStyle,
} from './metasUi'

const COLUNAS: EtapaMetaConfig[] = [...[...ETAPAS_FUNIL].reverse().slice(1), 'Ligações']

function delta(n: number, fmt: (v: number) => string): string {
  if (Math.abs(n) < 0.5) return 'igual'
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`
}

const th: CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }

export function PassoRevisarPublicar({ rascunho, proximoNumero, versaoAtiva, totaisMesAnterior, onAbrirMarca, onPublicado }: {
  rascunho: RascunhoConfig
  proximoNumero: number
  versaoAtiva: VersaoMeta | null
  totaisMesAnterior: { rotulo: string; vendas: number; faturamento: number } | null
  onAbrirMarca: (marca: string) => void
  onPublicado: (mensagem: string) => void
}) {
  const { pode } = useAcesso()
  const [rotulo, setRotulo] = useState(proximoNumero === 1 ? 'Lançamento' : 'Forecast')
  const [motivo, setMotivo] = useState('')
  const [ativar, setAtivar] = useState(true)
  const [publicando, setPublicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const itens = rascunho.marcas.map(m => {
    const funil = calcularFunil(m)
    const pendencias = pendenciasMarca(m, funil)
    return { m, funil, pendencias, status: statusMarca(m, pendencias) }
  })
  const resumo = resumoRascunho(rascunho)
  const incompletas = itens.filter(i => i.status !== 'configurada')

  const pessoas = new Map<string, { nome: string; funcao: 'SDR' | 'Closer'; marcas: string[]; valores: Partial<Record<EtapaMetaConfig, number>>; faturamento: number }>()
  for (const { m, funil } of itens) {
    for (const p of metasPorPessoa(m, funil)) {
      const chave = `${p.funcao}|${p.nome}`
      const atual = pessoas.get(chave) ?? { nome: p.nome, funcao: p.funcao, marcas: [], valores: {}, faturamento: 0 }
      atual.marcas.push(marcaLabel(m.marca))
      for (const [e, v] of Object.entries(p.valores) as [EtapaMetaConfig, number][]) atual.valores[e] = (atual.valores[e] ?? 0) + v
      atual.faturamento += p.faturamento ?? 0
      pessoas.set(chave, atual)
    }
  }
  const listaPessoas = [...pessoas.values()].sort((a, b) => a.funcao.localeCompare(b.funcao) || a.nome.localeCompare(b.nome, 'pt-BR'))

  const faltaMotivo = proximoNumero > 1 && motivo.trim() === ''
  const semPermissao = !pode('acao.metas-publicar')
  const bloqueado = incompletas.length > 0 || itens.length === 0 || faltaMotivo || semPermissao || rotulo.trim() === ''

  async function publicar() {
    setPublicando(true)
    setErro(null)
    const pub = montarPublicacao(rascunho)
    const r = await publicarVersao({
      mesReferencia: rascunho.mesReferencia,
      diaViradaSemana: rascunho.diaViradaSemana,
      semanas: rascunho.semanas,
      marcas: pub.marcas,
      distribuicaoSemanal: pub.distribuicaoSemanal,
      linhasEspelho: pub.linhasEspelho,
      rotulo: rotulo.trim(),
      motivo: motivo.trim(),
      ativar,
    })
    setPublicando(false)
    if (!r.ok) { setErro(`Não deu pra publicar: ${r.error}`); return }
    const n = r.numero ?? proximoNumero
    onPublicado(ativar
      ? `V${n} publicada e ativada — o dashboard já mede o time por ela.`
      : `V${n} publicada, sem ativar. Ative quando quiser na lista de versões.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {incompletas.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--status-risco)' }}>
            {incompletas.length === 1 ? 'Falta 1 marca' : `Faltam ${incompletas.length} marcas`} para publicar
          </h3>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            Conclua cada uma — ou tire do mês a marca que não terá meta.
          </p>
          {incompletas.map(({ m, pendencias }) => (
            <div key={m.marca} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid var(--ws-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{marcaLabel(m.marca)}</div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{pendencias.map(p => p.texto).join(' · ')}</div>
              </div>
              <button type="button" onClick={() => onAbrirMarca(m.marca)} style={smallButtonStyle}>Abrir</button>
            </div>
          ))}
        </div>
      )}

      <div className="rs-grid rs-cols-3" style={{ gap: 12 }}>
        <Total rotulo="Vendas" valor={fmtInt(resumo.vendas)}
          comparacoes={[
            totaisMesAnterior && `${totaisMesAnterior.rotulo}: ${fmtInt(totaisMesAnterior.vendas)} (${delta(resumo.vendas - totaisMesAnterior.vendas, fmtInt)})`,
            versaoAtiva && `ativa V${versaoAtiva.numero}: ${fmtInt(versaoAtiva.totalVendas)} (${delta(resumo.vendas - versaoAtiva.totalVendas, fmtInt)})`,
          ]} />
        <Total rotulo="Faturamento" valor={fmtBRL(resumo.faturamento)}
          comparacoes={[
            totaisMesAnterior && `${totaisMesAnterior.rotulo}: ${fmtBRL(totaisMesAnterior.faturamento)}`,
            versaoAtiva && `ativa V${versaoAtiva.numero}: ${fmtBRL(versaoAtiva.totalFaturamento)}`,
          ]} />
        <Total rotulo="Marcas" valor={`${resumo.prontas} de ${resumo.total} prontas`} comparacoes={[]} />
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Metas por marca</h3>
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Marca</th>
                <th style={th}>Vendas</th>
                <th style={th}>Faturamento</th>
                {COLUNAS.map(e => <th key={e} style={th}>{ROTULO_ETAPA[e]}</th>)}
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {itens.map(({ m, funil, status }) => (
                <tr key={m.marca} style={{ borderTop: '1px solid var(--ws-border)' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                    <button type="button" onClick={() => onAbrirMarca(m.marca)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--ws-border-strong)' }}>
                      {marcaLabel(m.marca)}
                    </button>
                  </td>
                  <td style={td}>{m.vendas != null ? fmtInt(m.vendas) : '—'}</td>
                  <td style={td}>{funil.faturamento != null ? fmtBRL(funil.faturamento) : '—'}</td>
                  {COLUNAS.map(e => <td key={e} style={td}>{funil.etapas[e].meta != null ? fmtInt(funil.etapas[e].meta!) : '—'}</td>)}
                  <td style={td}><span style={pillStyle(STATUS_MARCA_UI[status].kind)}>{STATUS_MARCA_UI[status].rotulo}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>O que cada pessoa vai ver no dashboard</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ws-text-secondary)' }}>Somado entre as marcas da pessoa e arredondado pra cima, como a aba Performance mostra.</p>
        <div className="rs-scroll-x">
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Pessoa</th>
                <th style={{ ...th, textAlign: 'left' }}>Marcas</th>
                <th style={th}>SQL</th><th style={th}>Diagnóstico</th><th style={th}>SAL</th>
                <th style={th}>COF</th><th style={th}>Vendas</th><th style={th}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {listaPessoas.map(p => {
                const v = (e: EtapaMetaConfig) => (p.valores[e] != null ? fmtInt(arredondarMeta(p.valores[e]!)) : '—')
                return (
                  <tr key={`${p.funcao}|${p.nome}`} style={{ borderTop: '1px solid var(--ws-border)' }}>
                    <td style={{ ...td, textAlign: 'left' }}><b>{p.nome}</b> <span style={{ color: 'var(--ws-text-secondary)', fontSize: 11 }}>{p.funcao}</span></td>
                    <td style={{ ...td, textAlign: 'left', color: 'var(--ws-text-secondary)', fontSize: 12 }}>{p.marcas.join(', ')}</td>
                    <td style={td}>{v('Reunião Agendada SQL')}</td><td style={td}>{v('Reunião Realizada')}</td><td style={td}>{v('SAL')}</td>
                    <td style={td}>{v('Oportunidade COF')}</td><td style={td}>{v('Fechamento')}</td>
                    <td style={td}>{p.funcao === 'Closer' ? fmtBRL(p.faturamento) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Publicar como V{proximoNumero}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16, marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            Nome da versão
            <input value={rotulo} onChange={e => setRotulo(e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
            Motivo {proximoNumero > 1 ? '(obrigatório numa revisão)' : '(opcional)'}
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              placeholder={proximoNumero > 1 ? 'Forecast pedido pela diretoria — Inpot de 5 para 4 vendas' : 'Lançamento do mês conforme planejamento'}
              style={{ ...inputStyle, padding: '8px 10px', resize: 'vertical' }}
            />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={ativar} onChange={e => setAtivar(e.target.checked)} />
          Ativar ao publicar (o dashboard passa a medir o time por esta versão)
        </label>
        {semPermissao && <div style={{ ...bannerStyle('atencao'), marginBottom: 12 }}>Seu acesso permite montar a meta, mas não publicar. Peça a alguém com a permissão "Publicar e ativar metas".</div>}
        {faltaMotivo && !semPermissao && incompletas.length === 0 && <div style={{ ...bannerStyle('atencao'), marginBottom: 12 }}>Escreva o motivo da revisão pra publicar.</div>}
        {erro && <div style={{ ...bannerStyle('erro'), marginBottom: 12 }}>{erro}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={publicar} disabled={publicando || bloqueado} style={publicando || bloqueado ? disabledButtonStyle : primaryButtonStyle}>
            {publicando ? 'Publicando…' : `Publicar como V${proximoNumero}`}
          </button>
          <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>As versões já publicadas continuam guardadas e podem ser reativadas.</span>
        </div>
      </div>
    </div>
  )
}

function Total({ rotulo, valor, comparacoes }: { rotulo: string; valor: string; comparacoes: (string | null | false)[] }) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>{rotulo}</div>
      <div style={{ fontSize: 24, fontWeight: 600, margin: '4px 0' }}>{valor}</div>
      {comparacoes.filter(Boolean).map(c => <div key={c as string} style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>{c}</div>)}
    </div>
  )
}
