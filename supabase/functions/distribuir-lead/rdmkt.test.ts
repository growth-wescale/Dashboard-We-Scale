import { describe, expect, it } from 'vitest'
import { enviarConversaoCof, montarCorpoConversao } from './rdmkt.ts'

const KEY = 'chave-mkt-xyz'
const conv = { identificador: 'cof_teste', email: 'x@t.com', nome: 'Lead X' }

function fetchQue(respostas: Array<() => Response | Error>) {
  const estado = { chamadas: 0, url: '' }
  const f = (async (url: string) => {
    estado.url = url
    const r = respostas[Math.min(estado.chamadas, respostas.length - 1)]
    estado.chamadas++
    const x = r()
    if (x instanceof Error) throw x
    return x
  }) as unknown as typeof fetch
  return { fetch: f, estado }
}

describe('enviarConversaoCof', () => {
  it('monta o corpo de conversão CDP', () => {
    expect(montarCorpoConversao(conv)).toEqual({
      event_type: 'CONVERSION', event_family: 'CDP',
      payload: { conversion_identifier: 'cof_teste', email: 'x@t.com', name: 'Lead X' },
    })
  })

  it('200 → ok, com api_key na query', async () => {
    const f = fetchQue([() => new Response('{"event_uuid":"u"}', { status: 200 })])
    const r = await enviarConversaoCof(KEY, conv, { fetchImpl: f.fetch })
    expect(r).toEqual({ ok: true, tentativas: 1 })
    expect(f.estado.url).toContain('api_key=chave-mkt-xyz')
  })

  it('400 não repete e a chave não aparece no erro', async () => {
    const f = fetchQue([() => new Response(`erro com ${KEY}`, { status: 400 })])
    const r = await enviarConversaoCof(KEY, conv, { fetchImpl: f.fetch })
    expect(r.ok).toBe(false)
    expect(f.estado.chamadas).toBe(1)
    expect(r.erro).not.toContain(KEY)
  })

  it('429 repete e depois dá certo', async () => {
    const f = fetchQue([
      () => new Response('', { status: 429, headers: { 'Retry-After': '0' } }),
      () => new Response('{}', { status: 200 }),
    ])
    const r = await enviarConversaoCof(KEY, conv, { fetchImpl: f.fetch })
    expect(r).toEqual({ ok: true, tentativas: 2 })
  })

  it('timeout não repete', async () => {
    const f = fetchQue([() => Object.assign(new Error('t'), { name: 'TimeoutError' })])
    const r = await enviarConversaoCof(KEY, conv, { fetchImpl: f.fetch, tentativas: 3 })
    expect(r.ok).toBe(false)
    expect(f.estado.chamadas).toBe(1)
  })
})
