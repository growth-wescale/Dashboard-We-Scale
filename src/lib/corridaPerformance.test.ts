import { describe, it, expect } from 'vitest'
import {
  classificarVelocidade,
  difDias,
  normalizarFonte,
  pesoFonte,
  pontosCloser,
  pontosSdr,
  SDR_SPEED_TIERS,
  CLOSER_SPEED_TIERS,
  type RrUnidade,
  type VendaUnidade,
} from './corridaPerformance'

describe('pesoFonte', () => {
  it('1 pt: Inbound, Indicação, Parceiro, inbound - Repasse e sem classificação', () => {
    expect(pesoFonte('Inbound')).toBe(1)
    expect(pesoFonte('Indicação')).toBe(1)
    expect(pesoFonte('Parceiro')).toBe(1)
    expect(pesoFonte('inbound - Repasse')).toBe(1)
    expect(pesoFonte('Sem Classificação')).toBe(1)
    expect(pesoFonte(null)).toBe(1)
    expect(pesoFonte('')).toBe(1)
    expect(pesoFonte('   ')).toBe(1)
  })

  it('2 pts: todo o restante', () => {
    expect(pesoFonte('Prospecção Ativa')).toBe(2)
    expect(pesoFonte('Resgate')).toBe(2)
    expect(pesoFonte('Evento')).toBe(2)
    expect(pesoFonte('Outro CRM')).toBe(2)
    expect(pesoFonte('Outro Crm')).toBe(2)
    expect(pesoFonte('Franqueado')).toBe(2)
    expect(pesoFonte('valor novo qualquer')).toBe(2)
  })

  it('tolera acento, caixa e espaçamento em volta do "-"', () => {
    expect(pesoFonte('INBOUND')).toBe(1)
    expect(pesoFonte('indicacao')).toBe(1)
    expect(pesoFonte('inbound-repasse')).toBe(1)
    expect(pesoFonte('  Inbound  -  Repasse ')).toBe(1)
    expect(pesoFonte('PROSPECÇÃO ATIVA')).toBe(2)
  })
})

describe('normalizarFonte', () => {
  it('minúsculo, sem acento, espaço colapsado e "-" padronizado', () => {
    expect(normalizarFonte('Inbound - Repasse')).toBe('inbound - repasse')
    expect(normalizarFonte('inbound-repasse')).toBe('inbound - repasse')
    expect(normalizarFonte('  Prospecção   Ativa ')).toBe('prospeccao ativa')
    expect(normalizarFonte(null)).toBe('')
  })
})

describe('difDias', () => {
  it('conta dias corridos fracionários', () => {
    expect(difDias('2026-09-01T00:00:00Z', '2026-09-01T12:00:00Z')).toBeCloseTo(0.5, 5)
    expect(difDias('2026-09-01T00:00:00Z', '2026-09-05T00:00:00Z')).toBe(4)
  })
  it('null quando falta um lado ou a data é inválida', () => {
    expect(difDias(null, '2026-09-01T00:00:00Z')).toBeNull()
    expect(difDias('2026-09-01T00:00:00Z', undefined)).toBeNull()
    expect(difDias('não é data', '2026-09-01T00:00:00Z')).toBeNull()
  })
})

describe('classificarVelocidade — trilha SDR', () => {
  const t = (d: number | null) => classificarVelocidade(d, SDR_SPEED_TIERS)
  it('respeita os limites do doc (inclusivos no lado rápido)', () => {
    expect(t(0)).toMatchObject({ mult: 1.5, tag: 'Resposta Relâmpago' })
    expect(t(0.5)).toMatchObject({ mult: 1.5 })
    expect(t(0.51)).toMatchObject({ mult: 1.2, tag: 'Ritmo Ideal' })
    expect(t(1)).toMatchObject({ mult: 1.2 })
    expect(t(1.01)).toMatchObject({ mult: 1.0, tag: 'Padrão' })
    expect(t(3)).toMatchObject({ mult: 1.0 })
    expect(t(3.01)).toMatchObject({ mult: 0.8, tag: 'Atenção' })
    expect(t(7)).toMatchObject({ mult: 0.8 })
    expect(t(7.01)).toMatchObject({ mult: 0.5, tag: 'Lento' })
    expect(t(90)).toMatchObject({ mult: 0.5 })
  })
  it('leadtime negativo é tratado como 0 (relâmpago)', () => {
    expect(t(-3)).toMatchObject({ mult: 1.5 })
  })
  it('sem data → multiplicador neutro 1', () => {
    expect(t(null)).toMatchObject({ mult: 1, tag: '—' })
  })
})

describe('classificarVelocidade — trilha Closer', () => {
  const t = (d: number | null) => classificarVelocidade(d, CLOSER_SPEED_TIERS)
  it('respeita os limites do doc', () => {
    expect(t(14)).toMatchObject({ mult: 1.5, tag: 'Fechamento Relâmpago' })
    expect(t(14.01)).toMatchObject({ mult: 1.2, tag: 'Ritmo Ideal' })
    expect(t(17)).toMatchObject({ mult: 1.2 })
    expect(t(17.01)).toMatchObject({ mult: 1.0, tag: 'Padrão' })
    expect(t(28)).toMatchObject({ mult: 1.0 })
    expect(t(28.01)).toMatchObject({ mult: 0.8, tag: 'Atenção' })
    expect(t(40)).toMatchObject({ mult: 0.8 })
    expect(t(40.01)).toMatchObject({ mult: 0.5, tag: 'Lento' })
  })
})

/** RR de fonte 2 pts com gap MQL→agendamento de `gapDias` e RR num dia único (sem bônus). */
function rr(nome: string, diaRr: number, gapDias: number, fonte: RrUnidade['fonte'] = 'Prospecção Ativa'): RrUnidade {
  const dd = String(diaRr).padStart(2, '0')
  const mql = '2026-08-20T00:00:00Z'
  const agendamento = new Date(Date.parse(mql) + gapDias * 86_400_000).toISOString()
  return { nome, fonte, dataMql: mql, dataAgendamento: agendamento, dataRr: `2026-09-${dd}T13:00:00Z` }
}

describe('pontosSdr — exemplos do doc', () => {
  it('SDR X: 10 RR de 2 pts respondidas em 0,4 dia → 1,5× → 30 pts', () => {
    const rrs = Array.from({ length: 10 }, (_, i) => rr('X', i + 1, 0.4))
    const [linha] = pontosSdr(rrs, ['X'])
    expect(linha.volume).toBe(10)
    expect(linha.volume2pts).toBe(10)
    expect(linha.pontos).toBe(30) // 10 × (2 × 1.5)
    expect(linha.tagVelocidade).toBe('Resposta Relâmpago')
  })

  it('SDR Y: 15 RR de 2 pts em 4 dias → 0,8× → 24 pts', () => {
    const rrs = Array.from({ length: 15 }, (_, i) => rr('Y', i + 1, 4))
    const [linha] = pontosSdr(rrs, ['Y'])
    expect(linha.volume).toBe(15)
    expect(linha.pontos).toBe(24) // 15 × (2 × 0.8)
    expect(linha.tagVelocidade).toBe('Atenção')
  })

  it('SDR de fonte 1 pt (Inbound) pontua metade do de 2 pts, mesmo ritmo', () => {
    const rrs = Array.from({ length: 10 }, (_, i) => rr('Z', i + 1, 0.4, 'Inbound'))
    const [linha] = pontosSdr(rrs, ['Z'])
    expect(linha.volume).toBe(10)
    expect(linha.volume2pts).toBe(0)
    expect(linha.pontos).toBe(15) // 10 × (1 × 1.5)
  })

  it('Indicação e Repasse valem 1 pt', () => {
    const rrs = [
      rr('W', 1, 0.4, 'Indicação'),
      rr('W', 2, 0.4, 'inbound - Repasse'),
    ]
    const [linha] = pontosSdr(rrs, ['W'])
    expect(linha.volume2pts).toBe(0)
    // 2 RR no mesmo mês, dias distintos, sem bônus: 2 × (1 × 1.5) = 3
    expect(linha.pontos).toBe(3)
  })
})

describe('pontosSdr — bônus de mais de uma RR no mesmo dia', () => {
  it('2 RR de 1 pt no mesmo dia (Brasília), ritmo padrão → 1,5× cada', () => {
    const base: Omit<RrUnidade, 'dataRr'> = {
      nome: 'A',
      fonte: 'Inbound',
      dataMql: '2026-09-01T00:00:00Z',
      dataAgendamento: '2026-09-03T00:00:00Z', // 2 dias → Padrão (1,0×)
    }
    const rrs: RrUnidade[] = [
      { ...base, dataRr: '2026-09-05T13:00:00Z' }, // 10:00 BRT dia 5
      { ...base, dataRr: '2026-09-05T22:00:00Z' }, // 19:00 BRT dia 5
    ]
    const [linha] = pontosSdr(rrs, ['A'])
    expect(linha.pontos).toBe(3) // 2 × (1 × 1.5 bônus × 1.0 velocidade)
  })

  it('as mesmas 2 RR em dias diferentes → sem bônus', () => {
    const base: Omit<RrUnidade, 'dataRr'> = {
      nome: 'A',
      fonte: 'Inbound',
      dataMql: '2026-09-01T00:00:00Z',
      dataAgendamento: '2026-09-03T00:00:00Z',
    }
    const rrs: RrUnidade[] = [
      { ...base, dataRr: '2026-09-05T13:00:00Z' },
      { ...base, dataRr: '2026-09-06T13:00:00Z' },
    ]
    const [linha] = pontosSdr(rrs, ['A'])
    expect(linha.pontos).toBe(2) // 2 × (1 × 1.0)
  })
})

describe('pontosSdr — recorte por nome', () => {
  it('quem não está na lista de nomes é descartado; quem está sem RR fica zerado', () => {
    const rrs = [rr('Fulano', 1, 0.4)]
    const linhas = pontosSdr(rrs, ['A', 'B'])
    expect(linhas.map(l => l.nome)).toEqual(['A', 'B'])
    expect(linhas.every(l => l.volume === 0 && l.pontos === 0)).toBe(true)
    expect(linhas[0].tempoMedianoDias).toBeNull()
    expect(linhas[0].tagVelocidade).toBe('—')
  })
})

describe('pontosSdr — leadtime ausente', () => {
  it('sem data de MQL → conta volume com multiplicador neutro', () => {
    const rrs: RrUnidade[] = [
      { nome: 'A', fonte: 'Inbound', dataMql: null, dataAgendamento: '2026-09-03T00:00:00Z', dataRr: '2026-09-05T13:00:00Z' },
    ]
    const [linha] = pontosSdr(rrs, ['A'])
    expect(linha.volume).toBe(1)
    expect(linha.pontos).toBe(1) // 1 × 1 (neutro)
    expect(linha.tempoMedianoDias).toBeNull()
  })
})

describe('pontosCloser — multiplicador por-venda, nunca sobre a média', () => {
  it('ciclos 3/50/48/51/49 dias: 1 rápida + 4 travadas', () => {
    // Datas de venda em dias-calendário distintos (Brasília) — sem bônus de "+1 no mesmo dia".
    const dias = [3, 50, 48, 51, 49]
    const rrRef = Date.parse('2026-08-01T12:00:00Z')
    const vendas: VendaUnidade[] = dias.map(d => ({
      nome: 'A',
      fonte: 'Inbound' as const,
      dataRr: '2026-08-01T12:00:00Z',
      dataVenda: new Date(rrRef + d * 86_400_000).toISOString(),
    }))
    const [linha] = pontosCloser(vendas, ['A'])
    // por-venda: 3d → 1.5 ; 50/48/51/49 → 0.5 cada → 1.5 + 4×0.5 = 3.5
    expect(linha.pontos).toBe(3.5)
    // média (~40,2 dias) cairia em "Lento" (0,5×) e daria 2,5 — não é o que fazemos
    expect(linha.pontos).not.toBe(2.5)
    expect(linha.volume).toBe(5)
    expect(linha.tagVelocidade).toBe('Lento') // mediana = 49
  })
})
