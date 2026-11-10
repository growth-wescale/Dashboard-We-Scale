/**
 * Escolha do toggle Todos · SDR · Closer da Análise de Perda, guardada no
 * navegador só por conveniência: sem storage (aba anônima, bloqueio), volta
 * pra "Todos".
 */

import { useState } from 'react'
import { CAMADAS_PERDA } from '@/lib/perdaRows'
import type { CamadaPerda } from '@/lib/perdaRows'

const CHAVE = 'ws-analise-perda-camada'

function lerGuardado(): CamadaPerda {
  try {
    const v = localStorage.getItem(CHAVE)
    return (CAMADAS_PERDA as readonly string[]).includes(v ?? '') ? (v as CamadaPerda) : 'todos'
  } catch {
    return 'todos'
  }
}

export function useCamadaPerda(): [CamadaPerda, (c: CamadaPerda) => void] {
  const [camada, setCamadaState] = useState<CamadaPerda>(lerGuardado)
  function setCamada(c: CamadaPerda) {
    setCamadaState(c)
    try { localStorage.setItem(CHAVE, c) } catch { /* sem storage: fica só nesta visita */ }
  }
  return [camada, setCamada]
}
