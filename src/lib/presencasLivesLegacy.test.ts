import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { presencasLivesLegacy } from './presencasLivesLegacy'
import { ComunidadeLegacyPanel } from '@/components/sop/ComunidadeLegacyPanel'
import { comunidadeLegacyDoMes } from '@/constants/comunidadeLegacy'

describe('Presença nas lives de Legacy', () => {
  it('deduplica os retornos entre encontros, sem somar reconexões nem internos', () => {
    expect(presencasLivesLegacy('2026-11-01', '2026-11-23')).toEqual({
      unicos: 16, recorrentes: 6,
      historico: [
        { dia: '2026-11-05', presentes: 6, acumulados: 6 },
        { dia: '2026-11-12', presentes: 9, acumulados: 14 },
        { dia: '2026-11-19', presentes: 8, acumulados: 16 },
      ],
    })
  })

  it('recalcula únicos e recorrência apenas nos encontros selecionados', () => {
    const recorte = presencasLivesLegacy('2026-11-12', '2026-11-19')
    expect(recorte.unicos).toBe(13)
    expect(recorte.recorrentes).toBe(4)
    expect(recorte.historico.map(r => r.acumulados)).toEqual([9, 13])
    const isolado = presencasLivesLegacy('2026-11-19', '2026-11-19')
    expect(isolado.unicos).toBe(8)
    expect(isolado.recorrentes).toBe(0)
    expect(presencasLivesLegacy('2026-11-20', '2026-11-23').historico).toEqual([])
  })

  it('mostra presença em novembro, sem transformar as inscrições históricas em presença', () => {
    const novembro = renderToStaticMarkup(createElement(ComunidadeLegacyPanel, {
      data: comunidadeLegacyDoMes('2026-11'), accent: '#7f0c72', inicio: '2026-11-01', fim: '2026-11-23',
    }))
    expect(novembro).toContain('>236</span>')
    expect(novembro).toContain('23/11')
    expect(novembro).toContain('Presença nas lives')
    expect(novembro).toContain('>16</dd>')
    expect(novembro).not.toContain('Novos inscritos')
    const outubro = renderToStaticMarkup(createElement(ComunidadeLegacyPanel, {
      data: comunidadeLegacyDoMes('2026-10'), accent: '#7f0c72', inicio: '2026-10-01', fim: '2026-10-31',
    }))
    expect(outubro).toContain('>192</span>')
    expect(outubro).toContain('Inscrições nas lives')
    expect(outubro).toContain('>8</dd>')
    expect(outubro).not.toContain('Presença nas lives')
  })
})
