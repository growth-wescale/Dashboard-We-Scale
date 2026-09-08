export interface ComunidadeLegacy {
  ate: string
  total: number
  origens: { label: string; n: number; pct: number }[]
  quadrantes: {
    tier: 'ok' | 'mid' | 'low'
    pct: number
    label: string
    aprox: string
  }[]
  sampleN: number
  duplicados?: { leads: number; pico: string }
}

export const COMUNIDADE_LEGACY_ATUAL: ComunidadeLegacy = {
  ate: '08/09',
  total: 170,
  origens: [
    { label: 'Cadastros Legacy (site)', n: 138, pct: 81 },
    { label: 'Iscas (materiais)', n: 4, pct: 2 },
    { label: 'Lista de espera Odontoclub', n: 2, pct: 1 },
    { label: 'Newsletter', n: 3, pct: 2 },
    { label: 'Outros / indireta', n: 23, pct: 14 },
  ],
  quadrantes: [
    { tier: 'ok',  pct: 25, label: 'Dentista com clínica',    aprox: '~43 pessoas · ICP alto' },
    { tier: 'mid', pct: 30, label: 'Dentista sem clínica',    aprox: '~51 · quer abrir/comprar franquia' },
    { tier: 'mid', pct: 38, label: 'Não-dentista sem clínica', aprox: '~64 · perfil investidor puro' },
    { tier: 'low', pct: 7,  label: 'Não-dentista com clínica', aprox: '~12 · investidor com dentista sócio' },
  ],
  sampleN: 170,
  duplicados: { leads: 12, pico: '1 pessoa se cadastrou 5x' },
}
