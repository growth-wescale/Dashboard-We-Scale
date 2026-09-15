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
  ate: '15/09',
  total: 190,
  origens: [
    { label: 'Cadastros Legacy (site)', n: 157, pct: 83 },
    { label: 'Newsletter', n: 6, pct: 3 },
    { label: 'Outros / indireta', n: 23, pct: 12 },
    { label: 'Lista de espera Odontoclub', n: 2, pct: 1 },
    { label: 'Iscas (materiais)', n: 2, pct: 1 },
  ],
  quadrantes: [
    { tier: 'ok',  pct: 42, label: 'Dentista com clínica',    aprox: '~80 pessoas · ICP alto' },
    { tier: 'mid', pct: 45, label: 'Dentista sem clínica',    aprox: '~85 · quer abrir/comprar franquia' },
    { tier: 'low', pct: 13, label: 'Não-dentista com clínica', aprox: '~25 · investidor com dentista sócio' },
  ],
  sampleN: 190,
  duplicados: { leads: 12, pico: '1 pessoa se cadastrou 5x' },
}

/**
 * Snapshot manual do funil de negociações da Odonto Legacy (Consultoria).
 * Junior atualiza semanalmente — número de deals em cada etapa direto do RD,
 * fora do que o dashboard consegue derivar (a leitura automática pega tudo,
 * mas separa "safra Ago em cadência não-respondendo" precisa de contexto de
 * negócio).
 */
export interface FunilLegacyEtapa {
  label: string
  deals: number
  /** Só se houver — ex.: "14 perdidos" dos 18 Contato efetivo. */
  nota?: string
}

export interface FunilLegacy {
  /** Data do snapshot (DD/MM). */
  ate: string
  etapas: FunilLegacyEtapa[]
  /** Rodapé opcional pra contexto sobre a linha "em cadência" etc. */
  rodape?: string
}

export const FUNIL_ODONTO_LEGACY_ATUAL: FunilLegacy = {
  ate: '11/09',
  etapas: [
    { label: 'Tentando contato',   deals: 58 },
    { label: 'Contato efetivo',    deals: 18, nota: '14 perdidos' },
    { label: 'Em cadência (Ago)',  deals: 3,  nota: 'ICP · deixaram de responder' },
  ],
  rodape: 'Snapshot manual · 3 em cadência = ICP da safra de agosto que deixaram de responder',
}
