import { describe, expect, it } from 'vitest'
import { filtrarNutricao, periodoNutricaoValido, somaNutricao, type DadosNutricao, type MedicaoNutricao } from './nutricao'
const row = (fluxo: string, dia: string, delivered: number | null): MedicaoNutricao => ({ fluxo, dia, fim: dia, acao: fluxo, email: 'E-mail', collected_at: '', delivered, processed: delivered, unique_opens: 1, unique_clicks: 0, soft_bounces: 0, hard_bounces: 0, dropped: 0, unsubscribed: 0, spam_reports: 0 })
const data: DadosNutricao = { versao: 1, inicio: '2026-11-16', fim: '2026-11-18', dias: ['2026-11-16', '2026-11-17', '2026-11-18'], coletado: '', gerado: '', inventarioEm: '', fluxos: [
  { id: 'a', nome: 'Primeiro', marca: 'Eletrovias', status: 'ATIVO', modelos: [] },
  { id: 'b', nome: 'Segundo', marca: 'Lisô Laser', status: 'ATIVO', modelos: [] },
  { id: 'c', nome: 'Terceiro', marca: 'Oral Unic', status: 'ATIVO', modelos: [] },
], medicoes: [row('a', '2026-11-16', 23), row('a', '2026-11-17', 2), row('b', '2026-11-17', 7)] }
describe('Nutrição', () => {
  it('filtra por período inclusivo, marca e ID de fluxo, sem dupla contagem', () => {
    expect(somaNutricao(filtrarNutricao(data, data.inicio, data.fim).rows, 'delivered')).toBe(32)
    expect(somaNutricao(filtrarNutricao(data, '2026-11-17', data.fim, 'Eletrovias', 'a').rows, 'delivered')).toBe(2)
    expect(filtrarNutricao(data, data.inicio, data.fim, 'Lisô Laser', 'a').rows).toEqual([])
  })
  it('preserva zero observado e diferencia ausência e campos nulos', () => {
    expect(somaNutricao([], 'delivered')).toBeNull()
    expect(somaNutricao([row('a', data.inicio, 0)], 'delivered')).toBe(0)
    expect(somaNutricao([row('a', data.inicio, null), row('b', data.inicio, 7)], 'delivered')).toBeNull()
    expect(filtrarNutricao(data, data.inicio, data.fim, 'Oral Unic').fluxos).toHaveLength(1)
  })
  it('recusa cobertura ausente, período invertido e dias não publicados', () => {
    expect(periodoNutricaoValido(data, data.inicio, data.fim)).toBe(true)
    expect(periodoNutricaoValido(data, data.fim, data.inicio)).toBe(false)
    expect(periodoNutricaoValido(data, data.inicio, '2026-11-19')).toBe(false)
    expect(periodoNutricaoValido({ ...data, dias: ['2026-11-16', '2026-11-18'] }, data.inicio, data.fim)).toBe(false)
  })
})
