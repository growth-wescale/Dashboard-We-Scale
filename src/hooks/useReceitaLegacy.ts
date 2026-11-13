import { useCallback } from 'react'
import { useConsultaFiltrada } from './useConsultaFiltrada'
import { supabase } from '@/lib/supabase'
import { mapFonte } from '@/lib/vendasUtils'

interface Venda { id: string; dia: string; marca: string; fonte: string | null; valor: number; produtos: Array<{ nome: string; valor: number | null }> }

export function resumirReceitaLegacy(rows: Venda[], inicio: string, fim: string, fonte: string) {
  const porProduto = new Map<string, number>()
  let centavos = 0
  for (const row of rows) {
    if (row.dia < inicio || row.dia > fim || (fonte !== '__all__' && mapFonte(row.fonte) !== fonte)) continue
    const contrato = Math.round(row.valor * 100)
    centavos += contrato
    // Fechamentos confirmados apenas pelo valor não têm rateio por produto.
    if (row.produtos.length === 0) continue
    let alocado = 0
    for (const item of row.produtos) {
      const valor = row.produtos.length === 1 ? contrato : Math.round((item.valor ?? 0) * 100)
      alocado += valor
      porProduto.set(item.nome, (porProduto.get(item.nome) ?? 0) + valor)
    }
    if (alocado !== contrato) porProduto.set('Diferença do contrato', (porProduto.get('Diferença do contrato') ?? 0) + contrato - alocado)
  }
  return { total: centavos / 100, produtos: [...porProduto].map(([nome, valor]) => ({ nome, valor: valor / 100 })) }
}

export function useReceitaLegacy(enabled: boolean) {
  const ler = useCallback(async (signal: AbortSignal): Promise<Venda[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Entre novamente para consultar a receita de Legacy.')
    const res = await fetch('/api/legacy-ouro/v1/read', { method: 'POST', signal,
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: 'receita', route: '/sop-marketing' }) })
    if (!res.ok) throw new Error('Receita de Legacy indisponível.')
    const reply = await res.json()
    if (reply.mode !== 'ouro' || reply.contract !== 'legacy_marketing_v1' || reply.dataset !== 'receita' || !Array.isArray(reply.rows)) throw new Error('Resposta de receita incompleta.')
    const rows = reply.rows as Venda[]
    if (new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => r.marca !== 'Odonto Scale' || !r.id || !r.dia || r.dia < '2026-01-01' || !Number.isFinite(r.valor) || !Array.isArray(r.produtos) || r.produtos.some(item => !item.nome || (item.valor !== null && !Number.isFinite(item.valor))))) throw new Error('Não foi possível validar a receita de Legacy.')
    return rows
  }, [])
  return useConsultaFiltrada('sop:legacy-receita', ler, enabled)
}
