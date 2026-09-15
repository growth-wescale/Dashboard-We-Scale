export interface WeScaleSopSemana {
  label: string
  mql: number
}

export interface WeScaleSop {
  /** Data do snapshot (DD/MM). */
  ate: string
  mtd: {
    /** Ex.: "MTD Set (01-15)" */
    periodo: string
    invest: number
    leads: number
    mql: number
    cpMql: number
  }
  /** Semanas de setembro já encerradas, em ordem cronológica. */
  semanas: WeScaleSopSemana[]
}

export const WE_SCALE_SOP_ATUAL: WeScaleSop = {
  ate: '15/09',
  mtd: {
    periodo: 'MTD Set (01-15)',
    invest: 3745,
    leads: 27,
    mql: 27,
    cpMql: 139,
  },
  semanas: [
    { label: 'S1 Set (01-07)', mql: 12 },
    { label: 'S2 Set (08-14)', mql: 15 },
  ],
}
