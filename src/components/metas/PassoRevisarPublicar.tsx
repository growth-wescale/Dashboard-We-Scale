import { useState } from 'react'
import { resolverFunilMarca, gerarLinhasEspelho } from '@/lib/metasEngine'
import { salvarMeta } from '@/hooks/useSalvarMeta'
import type { EstadoMes, EstadoMesMarca, DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import type { DiaSemana, Semana } from '@/lib/metasEngine'
import { cardStyle, bannerStyle, primaryButtonStyle, disabledButtonStyle } from '@/components/metas/metasUi'

export function PassoRevisarPublicar({
  mesReferencia, diaViradaSemana, semanas, marcas, distribuicaoSemanal, estadoMesAnterior, onPublicado,
}: {
  mesReferencia: string
  diaViradaSemana: DiaSemana
  semanas: Semana[]
  marcas: EstadoMesMarca[]
  distribuicaoSemanal: DistribuicaoSemanalItem[]
  estadoMesAnterior: EstadoMes | null
  onPublicado: () => void
}) {
  const [publicando, setPublicando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const resolucoes = marcas.map(m => ({ marca: m.marca, resolucao: resolverFunilMarca(m.etapas, m.ticketMedio), pessoas: m.pessoas }))
  const totalVendas = resolucoes.reduce((s, r) => s + (r.resolucao.valores['Fechamento'] ?? 0), 0)
  const totalFaturamento = resolucoes.reduce((s, r) => s + (r.resolucao.faturamento ?? 0), 0)
  const temErro = resolucoes.some(r => r.resolucao.erros.length > 0)

  const totalVendasAnterior = (estadoMesAnterior?.marcas ?? []).reduce((s, m) => {
    const r = resolverFunilMarca(m.etapas, m.ticketMedio)
    return s + (r.valores['Fechamento'] ?? 0)
  }, 0)

  async function publicar() {
    setPublicando(true); setMsg(null)
    const linhasEspelho = gerarLinhasEspelho(mesReferencia, resolucoes)
    const resultado = await salvarMeta({
      acao: 'publicar', mesReferencia, diaViradaSemana, semanas, marcas, distribuicaoSemanal, linhasEspelho,
    })
    setPublicando(false)
    if (!resultado.ok) { setMsg(`Erro: ${resultado.error}`); return }
    setMsg('Publicado com sucesso.')
    onPublicado()
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ws-text-primary)' }}>Consolidado — {mesReferencia}</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Vendas</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{totalVendas}</div>
          {totalVendasAnterior > 0 && <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)' }}>mês anterior: {totalVendasAnterior}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-secondary)' }}>Faturamento</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>R$ {totalFaturamento.toLocaleString('pt-BR')}</div>
        </div>
      </div>

      {temErro && (
        <div style={{ ...bannerStyle('erro'), marginBottom: 16 }}>
          Existem marcas com erro de configuração — corrija no Passo 3 antes de publicar.
        </div>
      )}

      {msg && (
        <div style={{ ...bannerStyle(msg.startsWith('Erro') ? 'erro' : 'sucesso'), marginBottom: 16 }}>
          {msg}
        </div>
      )}

      <button onClick={publicar} disabled={publicando || temErro} style={temErro ? disabledButtonStyle : primaryButtonStyle}>
        {publicando ? 'Publicando…' : 'Publicar mês'}
      </button>
    </div>
  )
}
