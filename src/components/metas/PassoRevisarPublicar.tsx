import { useState } from 'react'
import { resolverFunilMarca, gerarLinhasEspelho } from '@/lib/metasEngine'
import { salvarMeta } from '@/hooks/useSalvarMeta'
import type { EstadoMes, EstadoMesMarca, DistribuicaoSemanalItem } from '@/hooks/useMetaMes'
import type { DiaSemana, Semana } from '@/lib/metasEngine'

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
    <div style={{ background: '#fff', border: '1px solid var(--ws-border)', borderRadius: 12, padding: 24 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Consolidado — {mesReferencia}</h3>

      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
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
        <div style={{ padding: 10, background: '#FEE2E2', borderRadius: 8, fontSize: 12, color: '#B91C1C', marginBottom: 16 }}>
          Existem marcas com erro de configuração — corrija no Passo 3 antes de publicar.
        </div>
      )}

      {msg && (
        <div style={{ padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 16, background: msg.startsWith('Erro') ? '#FEE2E2' : '#DCFCE7', color: msg.startsWith('Erro') ? '#B91C1C' : '#166534' }}>
          {msg}
        </div>
      )}

      <button onClick={publicar} disabled={publicando || temErro}
        style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: temErro ? 'var(--ws-border)' : 'var(--ws-brand)', color: '#fff', cursor: temErro ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 500 }}>
        {publicando ? 'Publicando…' : 'Publicar mês'}
      </button>
    </div>
  )
}
