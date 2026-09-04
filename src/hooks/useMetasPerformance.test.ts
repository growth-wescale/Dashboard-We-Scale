import { describe, it, expect } from 'vitest'
import { aggregate } from '@/hooks/useMetasPerformance'
import type { RawMetaRow } from '@/hooks/useMetasPerformance'

const base: RawMetaRow = {
  nome_colaborador: 'Xayane', marca: 'Oral Unic', mes_referencia: '2026-09-01', funcao: 'SDR',
  meta_sql: null, meta_agendamento: null, meta_reuniao_realizada: null,
  meta_cof: null, meta_financeira: null, meta_qtd_vendas: null, meta_volume_sal: null,
}

describe('aggregate — meta_volume_sal (meta de SAL)', () => {
  it('soma meta_volume_sal (texto no banco) por pessoa/função, convertendo pra número', () => {
    const rows: RawMetaRow[] = [
      { ...base, marca: 'Oral Unic', meta_volume_sal: '10' },
      { ...base, marca: 'Viva', meta_volume_sal: '15' },
    ]
    const [linha] = aggregate(rows)
    expect(linha.metaSal).toBe(25)
  })

  it('meta_volume_sal nula soma 0, não quebra', () => {
    const rows: RawMetaRow[] = [{ ...base, meta_volume_sal: null }]
    expect(aggregate(rows)[0].metaSal).toBe(0)
  })

  it('metaSal fica separado por função (SDR x Closer), mesma pessoa', () => {
    const rows: RawMetaRow[] = [
      { ...base, funcao: 'SDR', meta_volume_sal: '10' },
      { ...base, funcao: 'Closer', meta_volume_sal: '999' },
    ]
    const agregados = aggregate(rows)
    expect(agregados.find(a => a.funcao === 'SDR')!.metaSal).toBe(10)
    expect(agregados.find(a => a.funcao === 'Closer')!.metaSal).toBe(999)
  })
})
