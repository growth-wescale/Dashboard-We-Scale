// supabase/functions/corrigir-duplicados/index.ts
// Uso único (28/10/2026): corrige o que a distribuição de leads deixou de 19/10 a 28/10, antes da
// regra de reconversão (docs/sql/2026-10-28-distribuicao-reconversao.sql).
//
//   ?etapa=contatos  e-mails de _retro_contatos_20261028 com mais de um contato no RD: os deals de
//                    todos vão para o contato que fica (o ligado ao RD Marketing, senão o mais
//                    antigo) e os outros contatos ficam sem deal. Nenhum contato é apagado: os vazios
//                    ficam pra quem quiser apagar na tela do RD (contatos_esvaziados).
//   ?etapa=notas     deals de _retro_notas_20261028 (abertos, de lead com outro deal aberto) ganham a
//                    anotação "este MQL já tem deal aberto". O responsável não muda.
//   &simular=1       só calcula e grava o plano em `detalhe`, sem escrever no RD.
//   &lote=N          quantos itens por chamada (padrão 15; o gateway corta a chamada em 150 s).
// Autenticação: ?chave= igual ao segredo distribuicao_webhook_chave.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buscarContatosPorEmail, definirDealsDoContato, escolherContato, montarNotaReconversao, type DealAberto } from './contato.ts'
import { criarNotaNoRd } from './rd.ts'

// deno-lint-ignore no-explicit-any
type Sb = any

const RODAPE = 'Anotação feita depois (28/10): este deal foi criado antes da regra que manda o lead com deal aberto para o mesmo SDR. O responsável não foi trocado.'

async function segredo(sb: Sb, nome: string): Promise<string> {
  const { data, error } = await sb.rpc('get_secret', { secret_name: nome })
  if (error || !data) throw new Error(`get_secret ${nome}: ${error?.message || 'vazio'}`)
  return data as string
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

async function contatos(sb: Sb, token: string, lote: number, simular: boolean) {
  const { data: itens } = await sb.from('_retro_contatos_20261028').select('email').eq('status', 'pendente').order('email').limit(lote)
  const feitos: unknown[] = []
  for (const { email } of (itens ?? []) as Array<{ email: string }>) {
    let status = 'feito'
    let detalhe = ''
    let mantido: string | null = null
    const esvaziados: string[] = []
    try {
      const lista = await buscarContatosPorEmail(token, email)
      if (lista.length <= 1) {
        status = 'sem_duplicado'
        detalhe = `${lista.length} contato no RD`
      } else {
        const fica = escolherContato(lista)!
        mantido = fica.id
        const todos = Array.from(new Set(lista.flatMap(c => c.deals)))
        const outros = lista.filter(c => c.id !== fica.id)
        detalhe = `fica ${fica.id} com ${todos.length} deals; esvazia ${outros.map(o => `${o.id}(${o.deals.length})`).join(', ')}`
        if (simular) status = 'simulado'
        else {
          const e1 = await definirDealsDoContato(token, fica.id, todos)
          if (e1) { status = 'erro'; detalhe += ` | ${e1}` }
          else {
            for (const o of outros) {
              const e2 = await definirDealsDoContato(token, o.id, [])
              if (e2) { status = 'erro'; detalhe += ` | ${o.id}: ${e2}` } else esvaziados.push(o.id)
            }
          }
        }
      }
    } catch (e) {
      status = 'erro'
      detalhe = (e as Error)?.message ?? String(e)
    }
    await sb.from('_retro_contatos_20261028').update({
      status, detalhe: detalhe.slice(0, 1000), contato_mantido: mantido, contatos_esvaziados: esvaziados.length ? esvaziados : null,
      feito_em: simular ? null : new Date().toISOString(),
    }).eq('email', email)
    feitos.push({ email, status })
  }
  return feitos
}

async function notas(sb: Sb, token: string, lote: number, simular: boolean) {
  const { data: itens } = await sb.from('_retro_notas_20261028').select('id_deal, outros, user_id').eq('status', 'pendente').order('id_deal').limit(lote)
  const feitos: unknown[] = []
  for (const it of (itens ?? []) as Array<{ id_deal: string; outros: DealAberto[]; user_id: string }>) {
    const texto = montarNotaReconversao({ deals: it.outros, sdr: null, deal_do_sdr: null, sdr_inelegiveis: [] }, null, RODAPE)
    let status = simular ? 'simulado' : 'feito'
    let detalhe = texto ?? ''
    if (!simular && texto) {
      const e = await criarNotaNoRd(token, it.id_deal, it.user_id, texto)
      if (e) { status = 'erro'; detalhe = e }
    }
    await sb.from('_retro_notas_20261028').update({ status, detalhe: detalhe.slice(0, 2000), feito_em: simular ? null : new Date().toISOString() }).eq('id_deal', it.id_deal)
    feitos.push({ id_deal: it.id_deal, status })
  }
  return feitos
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)
  let ok = false
  try { ok = (url.searchParams.get('chave') ?? '') === await segredo(sb, 'distribuicao_webhook_chave') } catch { ok = false }
  if (!ok) return json({ error: 'não autorizado' }, 401)
  const etapa = url.searchParams.get('etapa')
  const simular = url.searchParams.get('simular') === '1'
  const lote = Math.min(40, Math.max(1, Number(url.searchParams.get('lote')) || 15))
  const token = await segredo(sb, 'rd_token')
  if (etapa === 'contatos') return json({ etapa, simular, feitos: await contatos(sb, token, lote, simular) })
  if (etapa === 'notas') return json({ etapa, simular, feitos: await notas(sb, token, lote, simular) })
  return json({ error: 'etapa deve ser contatos ou notas' }, 400)
})
