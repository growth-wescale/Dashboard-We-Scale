import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { ReunioesLinha } from '@/components/ui/ReunioesLinha'

describe('ReunioesLinha', () => {
  it('Enter/Espaço na linha não sobem para o card clicável (que abriria outro pop-up)', () => {
    const resumo = { reunioes: [], total: 2, deLive: 1, diagnosticos: 3, diagsDeLiveForaDoRecorte: [], porSdr: new Map(), porCloser: new Map() }
    const el = ReunioesLinha({ resumo, pronto: true, onClick: () => {} }) as ReactElement<{ onKeyDown?: (e: unknown) => void }>
    const stopPropagation = vi.fn()
    el.props.onKeyDown?.({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalled()
  })
})
