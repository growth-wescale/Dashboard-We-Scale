import { describe, it, expect } from 'vitest'
import { buscarTodasPaginas, type BuscarPagina } from '@/lib/paginacao'

/** Fonte falsa: `total` linhas numeradas, fatiadas por range como o PostgREST. */
function fonteFalsa(total: number, opts: { erroNaPagina?: number } = {}) {
  const chamadas: { de: number; ate: number; contar: boolean }[] = []
  let emVoo = 0
  let picoEmVoo = 0
  const buscar: BuscarPagina<number> = async (de, ate, contar) => {
    chamadas.push({ de, ate, contar })
    emVoo++
    picoEmVoo = Math.max(picoEmVoo, emVoo)
    // Páginas mais altas respondem ANTES das mais baixas: a ordem final
    // tem que continuar sendo a da paginação, não a de chegada.
    await new Promise(r => setTimeout(r, Math.max(0, 20 - de / 10)))
    emVoo--
    if (opts.erroNaPagina !== undefined && de === opts.erroNaPagina * 10) {
      return { rows: [], error: 'falhou' }
    }
    const rows: number[] = []
    for (let i = de; i <= ate && i < total; i++) rows.push(i)
    return { rows, error: null, total: contar ? total : null }
  }
  return { buscar, chamadas, pico: () => picoEmVoo }
}

const seq = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('buscarTodasPaginas', () => {
  it('uma página só quando cabe tudo nela', async () => {
    const f = fonteFalsa(7)
    const r = await buscarTodasPaginas(f.buscar, { tamanhoPagina: 10, concorrencia: 4 })
    expect(r).toEqual({ rows: seq(7), error: null })
    expect(f.chamadas).toHaveLength(1)
    expect(f.chamadas[0].contar).toBe(true)
  })

  it('traz todas as linhas, na ordem da paginação, sem duplicar', async () => {
    const f = fonteFalsa(57)
    const r = await buscarTodasPaginas(f.buscar, { tamanhoPagina: 10, concorrencia: 4 })
    expect(r.error).toBeNull()
    expect(r.rows).toEqual(seq(57))
  })

  it('usa a contagem da 1ª página: não pede página vazia a mais', async () => {
    const f = fonteFalsa(57)
    await buscarTodasPaginas(f.buscar, { tamanhoPagina: 10, concorrencia: 4 })
    expect(f.chamadas.map(c => c.de).sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40, 50])
    // Só a primeira pede contagem (é ela que custa uma execução extra no banco).
    expect(f.chamadas.filter(c => c.contar)).toHaveLength(1)
  })

  it('respeita o limite de concorrência', async () => {
    const f = fonteFalsa(95)
    await buscarTodasPaginas(f.buscar, { tamanhoPagina: 10, concorrencia: 3 })
    expect(f.pico()).toBeLessThanOrEqual(3)
  })

  it('total múltiplo exato do tamanho da página', async () => {
    const f = fonteFalsa(30)
    const r = await buscarTodasPaginas(f.buscar, { tamanhoPagina: 10, concorrencia: 4 })
    expect(r.rows).toEqual(seq(30))
  })

  it('sem contagem (servidor não devolveu) cai em lotes até achar página curta', async () => {
    const f = fonteFalsa(57)
    const semTotal: BuscarPagina<number> = async (de, ate, contar) => ({ ...(await f.buscar(de, ate, contar)), total: null })
    const r = await buscarTodasPaginas(semTotal, { tamanhoPagina: 10, concorrencia: 4 })
    expect(r).toEqual({ rows: seq(57), error: null })
  })

  it('base cresceu entre a contagem e as páginas: continua buscando', async () => {
    let total = 25
    const buscar: BuscarPagina<number> = async (de, ate, contar) => {
      const t = total
      if (contar) total = 35 // chegaram 10 linhas depois da contagem
      const rows: number[] = []
      for (let i = de; i <= ate && i < (contar ? t : total); i++) rows.push(i)
      return { rows, error: null, total: contar ? t : null }
    }
    const r = await buscarTodasPaginas(buscar, { tamanhoPagina: 10, concorrencia: 4 })
    expect(r.rows).toEqual(seq(35))
  })

  it('erro em qualquer página devolve o erro e nenhuma linha', async () => {
    const f = fonteFalsa(57, { erroNaPagina: 3 })
    const r = await buscarTodasPaginas(f.buscar, { tamanhoPagina: 10, concorrencia: 4 })
    expect(r).toEqual({ rows: [], error: 'falhou' })
  })

  it('erro na primeira página', async () => {
    const f = fonteFalsa(57, { erroNaPagina: 0 })
    const r = await buscarTodasPaginas(f.buscar, { tamanhoPagina: 10, concorrencia: 4 })
    expect(r).toEqual({ rows: [], error: 'falhou' })
    expect(f.chamadas).toHaveLength(1)
  })
})
