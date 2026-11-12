import { useCallback } from 'react'
import { useConsultaFiltrada } from '@/hooks/useConsultaFiltrada'
import { supabase } from '@/lib/supabase'
import { fmtBR, toLocalDate } from '@/lib/dateUtils'
import { mapFonte } from '@/lib/vendasUtils'
import { FUNIL_ODONTO_LEGACY_ATUAL } from '@/constants/comunidadeLegacy'

type Grupo = { tipo: 'referencia' | 'aberto' | 'perdido'; etapa: string | null; fonte: string | null; dia: string | null; total: number; carregado_em: string }

export function useFunilLegacy(enabled: boolean) {
  const ler = useCallback(async (signal: AbortSignal): Promise<Grupo[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Entre novamente para consultar o funil de Legacy.')
    const res = await fetch('/api/legacy-ouro/v1/read', { method: 'POST', signal,
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: 'funil', route: '/sop-marketing' }) })
    if (!res.ok) throw new Error('Funil de Legacy indisponível.')
    const reply = await res.json()
    if (reply.mode !== 'ouro' || reply.contract !== 'legacy_marketing_v1' || reply.dataset !== 'funil' ||
      !Array.isArray(reply.rows) || !reply.rows.some((r: Grupo) => r.tipo === 'referencia' && toLocalDate(r.carregado_em))) throw new Error('Leitura do funil incompleta.')
    return reply.rows
  }, [])
  return useConsultaFiltrada('sop:legacy-funil', ler, enabled)
}

export function FunilLegacy({ leitura, inicio, fim, fonte }: { leitura: ReturnType<typeof useFunilLegacy>; inicio: string; fim: string; fonte: string }) {
  const dia = toLocalDate(leitura.data.find(row => row.tipo === 'referencia')?.carregado_em)
  const setembro = fim === '2026-09-30' && fonte === '__all__'
  const aoVivo = dia && dia >= inicio && dia <= fim
  const etapas = new Map<string, number>()
  let perdidos = 0
  for (const row of leitura.data) {
    if (fonte !== '__all__' && mapFonte(row.fonte) !== fonte) continue
    if (row.tipo === 'aberto' && row.etapa) etapas.set(row.etapa, (etapas.get(row.etapa) ?? 0) + row.total)
    if (row.tipo === 'perdido' && row.dia && row.dia >= inicio && row.dia <= fim) perdidos += row.total
  }
  const linhas = setembro ? FUNIL_ODONTO_LEGACY_ATUAL.etapas : [...etapas].map(([label, deals]) => ({ label, deals })).sort((a,b) => b.deals-a.deals || a.label.localeCompare(b.label))
  return <section aria-label="Funil de negociações" style={{ marginTop: 14, fontSize: 11 }}>
    <strong>Funil de negociações</strong>
    {setembro || aoVivo ? <>
      <div>Em andamento em {fmtBR(setembro ? '2026-09-30' : dia!)}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
        {linhas.map(e => <tr key={e.label} style={{ borderTop: '1px solid var(--ws-border)' }}>
          <td style={{ padding: '5px 0' }}>{e.label}</td><td style={{ textAlign: 'right' }}>{e.deals}</td>
        </tr>)}
      </tbody></table>
      <div>{linhas.reduce((n,e) => n+e.deals,0)} em andamento{setembro ? inicio === '2026-09-01' && ' · 286 perdidos no mês' : ` · ${perdidos} perdidos no período`}</div>
    </> : <p>{leitura.loading ? 'Carregando funil…' : leitura.error || 'Sem posição de estoque registrada para este período.'}</p>}
  </section>
}
