import { afterEach, describe, expect, it, vi } from 'vitest'
import { rascunhoEmBranco } from '@/lib/configMetas'
import { carregarRascunho, descartarRascunho, salvarRascunho } from '@/lib/rascunhoMetas'

class MemoriaStorage {
  private dados = new Map<string, string>()
  getItem(k: string) { return this.dados.get(k) ?? null }
  setItem(k: string, v: string) { this.dados.set(k, v) }
  removeItem(k: string) { this.dados.delete(k) }
}

afterEach(() => vi.unstubAllGlobals())

describe('rascunhoMetas', () => {
  it('salva, carrega e descarta por mês', () => {
    vi.stubGlobal('localStorage', new MemoriaStorage())
    const r = rascunhoEmBranco('2026-10-01', ['Viva'])
    expect(salvarRascunho(r)).toBe(true)
    expect(carregarRascunho('2026-10-01')).toEqual(r)
    expect(carregarRascunho('2026-11-01')).toBeNull()
    descartarRascunho('2026-10-01')
    expect(carregarRascunho('2026-10-01')).toBeNull()
  })

  it('ignora conteúdo quebrado ou de outro formato', () => {
    const s = new MemoriaStorage()
    vi.stubGlobal('localStorage', s)
    s.setItem('ws-config-metas:v1:2026-10-01', '{quebrado')
    expect(carregarRascunho('2026-10-01')).toBeNull()
    s.setItem('ws-config-metas:v1:2026-10-01', JSON.stringify({ mesReferencia: '2026-10-01' }))
    expect(carregarRascunho('2026-10-01')).toBeNull()
  })

  it('sem localStorage não quebra', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(salvarRascunho(rascunhoEmBranco('2026-10-01', []))).toBe(false)
    expect(carregarRascunho('2026-10-01')).toBeNull()
    expect(() => descartarRascunho('2026-10-01')).not.toThrow()
  })
})
