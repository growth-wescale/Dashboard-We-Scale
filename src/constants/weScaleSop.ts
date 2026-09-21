export interface WeScaleSopSemana {
  label: string
  mql: number
}

export interface WeScaleSop {
  /** Data do snapshot (DD/MM). */
  ate: string
  mtd: {
    /** Ex.: "MTD Set (01-21)" */
    periodo: string
    invest: number
    leads: number
    mql: number
    cpMql: number
    scaleParceiro: { invest: number; leads: number }
    beautyConnection: { invest: number; leads: number }
    vendas: { fechadas: number; mapeadas: number; receita: number }
  }
  /** Semanas de setembro já encerradas, em ordem cronológica. */
  semanas: WeScaleSopSemana[]
}

export const WE_SCALE_SOP_ATUAL: WeScaleSop = {
  ate: '21/09',
  mtd: {
    periodo: 'MTD Set (01-21)',
    invest: 9133,
    leads: 37,
    mql: 27,
    cpMql: 272,
    scaleParceiro: { invest: 7357, leads: 27 },
    beautyConnection: { invest: 1776, leads: 10 },
    vendas: { fechadas: 3, mapeadas: 2, receita: 8494 },
  },
  semanas: [
    { label: 'S1 Set (01-07)', mql: 12 },
    { label: 'S2 Set (08-14)', mql: 15 },
  ],
}
