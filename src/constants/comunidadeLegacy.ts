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
  ate: '31/08',
  total: 107,
  origens: [
    { label: 'Cadastros Legacy (site)', n: 75, pct: 70 },
    { label: 'Iscas (materiais)', n: 4, pct: 4 },
    { label: 'Lista de espera Odontoclub', n: 2, pct: 2 },
    { label: 'Newsletter', n: 3, pct: 3 },
    { label: 'Outros / indireta', n: 23, pct: 21 },
  ],
  quadrantes: [
    { tier: 'ok',  pct: 24, label: 'Dentista com clínica',    aprox: '~26 pessoas · ICP alto' },
    { tier: 'mid', pct: 41, label: 'Dentista sem clínica',    aprox: '~44 · quer abrir/comprar franquia' },
    { tier: 'mid', pct: 27, label: 'Não-dentista sem clínica', aprox: '~29 · perfil investidor puro' },
    { tier: 'low', pct: 8,  label: 'Não-dentista com clínica', aprox: '~9 · investidor com dentista sócio' },
  ],
  sampleN: 51,
  duplicados: { leads: 4, pico: '1 pessoa se cadastrou 5x' },
}
