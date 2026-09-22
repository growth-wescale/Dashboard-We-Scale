import { useState } from 'react'
import { resolverFunilMarca, gerarLinhasEspelho, type DiaSemana, type Semana } from '@/lib/metasEngine'
import { publicarVersao } from '@/hooks/useSalvarMeta'
import { useAcesso } from '@/contexts/AcessoContext'
import type { EstadoMes, EstadoMesMarca, DistribuicaoSemanalItem, VersaoMeta } from '@/hooks/useMetaMes'
import { cardStyle, bannerStyle, primaryButtonStyle, disabledButtonStyle, inputStyle } from '@/components/metas/metasUi'

function fmtNum(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR')
}

function fmtBRL(n: number): string {
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`
}

function fmtDelta(n: number, fmt: (v: number) => string): string {
  if (Math.abs(n) < 0.05) return 'igual'
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`
}

const labelStyle = { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 12, color: 'var(--ws-text-secondary)' }

export function PassoRevisarPublicar({
  mesReferencia, diaViradaSemana, semanas, marcas, distribuicaoSemanal, estadoMesAnterior,
  proximoNumero, versaoAtiva, baseNumero, onPublicado,
}: {
  mesReferencia: string
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  estadoMesAnterior: EstadoMes | null
  /** Número que a versão vai receber ao publicar (V1, V2…). */
  proximoNumero: number
  versaoAtiva: VersaoMeta | null
  /** Versão publicada da qual este rascunho partiu, se houver. */
  baseNumero: number | null
  onPublicado: (mensagem: string) => void
}) {
  const [publicando, setPublicando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [rotulo, setRotulo] = useState(proximoNumero === 1 ? 'Lançamento' : 'Forecast')
  const [motivo, setMotivo] = useState('')
  const [ativar, setAtivar] = useState(true)
  const { pode } = useAcesso()

  const resolucoes = marcas.map(m => ({ marca: m.marca, resolucao: resolverFunilMarca(m.etapas, m.ticketMedio), pessoas: m.pessoas }))
  const totalVendas = resolucoes.reduce((s, r) => s + (r.resolucao.valores['Fechamento'] ?? 0), 0)
  const totalFaturamento = resolucoes.reduce((s, r) => s + (r.resolucao.faturamento ?? 0), 0)
  const temErro = resolucoes.some(r => r.resolucao.erros.length > 0)

  const totalVendasAnterior = (estadoMesAnterior?.marcas ?? []).reduce((s, m) => {
    const r = resolverFunilMarca(m.etapas, m.ticketMedio)
    return s + (r.valores['Fechamento'] ?? 0)
  }, 0)

  const faltaMotivo = proximoNumero > 1 && motivo.trim() === ''
  const semMarcas = marcas.length === 0
  const semPermissao = !pode('acao.metas-publicar')
  const bloqueado = temErro || faltaMotivo || semMarcas || semPermissao || rotulo.trim() === ''

  async function publicar() {
    setPublicando(true)
    setMsg(null)
    const linhasEspelho = gerarLinhasEspelho(mesReferencia, resolucoes)
    const r = await publicarVersao({
      mesReferencia, diaViradaSemana, semanas, marcas, distribuicaoSemanal, linhasEspelho,
      rotulo: rotulo.trim(), motivo: motivo.trim(), ativar,
    })
    setPublicando(false)
    if (!r.ok) { setMsg(`Erro: ${r.error}`); return }
    const n = r.numero ?? proximoNumero
    onPublicado(ativar
      ? `V${n} publicada e ativada — o dashboard já mede o time por ela.`
      : `V${n} publicada (inativa). Ative quando quiser na lista de versões.`)
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ws-text-primary)' }}>
        Publicar como V{proximoNumero}
        {baseNumero != null && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400, color: 'var(--ws-text-secondary)' }}> · a partir da V{baseNumero}</span>}
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Vendas</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{fmtNum(totalVendas)}</div>
          {totalVendasAnterior > 0 && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>mês anterior: {fmtNum(totalVendasAnterior)}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Faturamento</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{fmtBRL(totalFaturamento)}</div>
        </div>
        {versaoAtiva && (
          <div style={{ paddingLeft: 24, borderLeft: '1px solid var(--ws-border)' }}>
            <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Ativa hoje · V{versaoAtiva.numero} ({versaoAtiva.rotulo})</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{fmtNum(versaoAtiva.totalVendas)} vendas · {fmtBRL(versaoAtiva.totalFaturamento)}</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>
              esta versão: {fmtDelta(totalVendas - versaoAtiva.totalVendas, fmtNum)} vendas · {fmtDelta(totalFaturamento - versaoAtiva.totalFaturamento, fmtBRL)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Nome da versão
          <input value={rotulo} onChange={e => setRotulo(e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
        </label>
        <label style={labelStyle}>
          Motivo {proximoNumero > 1 ? '(obrigatório)' : '(opcional)'}
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            placeholder={proximoNumero > 1 ? 'Ex.: forecast pedido pela diretoria — Inpot de 5 para 4 vendas' : 'Ex.: lançamento do mês conforme planilha Metas 2026'}
            style={{ ...inputStyle, padding: '8px 10px', resize: 'vertical' }} />
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={ativar} onChange={e => setAtivar(e.target.checked)} />
        Ativar esta versão ao publicar (o dashboard passa a usar esses números)
      </label>

      {semPermissao && <div style={{ ...bannerStyle('atencao'), marginBottom: 12 }}>Seu acesso permite montar a meta, mas não publicar. Peça a alguém com a permissão "Publicar e ativar metas".</div>}
      {semMarcas && <div style={{ ...bannerStyle('atencao'), marginBottom: 12 }}>Nenhuma marca configurada ainda — monte o funil no Passo 3.</div>}
      {temErro && <div style={{ ...bannerStyle('erro'), marginBottom: 12 }}>Existem marcas com erro de configuração — corrija no Passo 3 antes de publicar.</div>}
      {msg && <div style={{ ...bannerStyle('erro'), marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button onClick={publicar} disabled={publicando || bloqueado} style={publicando || bloqueado ? disabledButtonStyle : primaryButtonStyle}>
          {publicando ? 'Publicando…' : `Publicar como V${proximoNumero}`}
        </button>
        <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>
          As versões já publicadas continuam guardadas e podem ser reativadas a qualquer momento.
        </span>
      </div>
    </div>
  )
}
