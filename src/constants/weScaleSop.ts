export interface WeScaleSopSemana {
  label: string
  mql: number
}

export interface WeScaleSop {
  /** Mês ao qual o snapshot pertence (YYYY-MM). */
  mes: string
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
  mes: '2026-09',
  ate: '28/09',
  mtd: {
    periodo: 'MTD Set (01-28)',
    invest: 12431,
    leads: 68,
    mql: 49,
    cpMql: 254,
    scaleParceiro: { invest: 9804, leads: 68 },
    beautyConnection: { invest: 2628, leads: 0 },
    vendas: { fechadas: 3, mapeadas: 2, receita: 8494 },
  },
  semanas: [
    { label: 'S1 Set (01-07)', mql: 12 },
    { label: 'S2 Set (08-14)', mql: 15 },
    { label: 'S3 Set (15-21)', mql: 9 },
    { label: 'S4 Set (22-28)', mql: 13 },
  ],
}

const WE_SCALE_SOP_POR_MES: Record<string, WeScaleSop> = {
  [WE_SCALE_SOP_ATUAL.mes]: WE_SCALE_SOP_ATUAL,
}

/** Retorna somente o snapshot correspondente ao mês selecionado. */
export function getWeScaleSop(mes: string): WeScaleSop | null {
  return WE_SCALE_SOP_POR_MES[mes] ?? null
}
