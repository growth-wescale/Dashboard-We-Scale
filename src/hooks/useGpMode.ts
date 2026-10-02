import { useCallback, useEffect, useState } from 'react'

/**
 * Tema Octógono do dashboard. Mantém a preferência anterior de liga/desliga.
 *
 * Controla o atributo `data-gp="ufc"` no `<html>` e persiste em
 * `localStorage.ws-gp-mode`. Emite evento `gp-replay` pra reabrir a intro.
 *
 * **Default**: LIGADO. A escolha explícita do usuário persiste via toggle.
 */

const LS_KEY = 'ws-gp-mode'
const HTML_ATTR = 'data-gp'
const HTML_ATTR_VALUE = 'ufc'

function computeDefault(): boolean {
  return true
}

function readInitial(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v === 'on') return true
    if (v === 'off') return false
  } catch {
    // localStorage bloqueado — silêncio, cai no default
  }
  return computeDefault()
}

export interface UseGpModeResult {
  gpAtivo: boolean
  setGpAtivo: (v: boolean) => void
  toggleGp: () => void
  replayIntro: () => void
}

export function useGpMode(): UseGpModeResult {
  const [gpAtivo, setGpAtivoState] = useState<boolean>(readInitial)

  // Sincroniza atributo no <html> + persiste em localStorage
  useEffect(() => {
    const el = document.documentElement
    if (gpAtivo) {
      el.setAttribute(HTML_ATTR, HTML_ATTR_VALUE)
    } else {
      el.removeAttribute(HTML_ATTR)
    }
    try {
      localStorage.setItem(LS_KEY, gpAtivo ? 'on' : 'off')
    } catch {
      // sem persistência — o estado in-memory vale pela sessão
    }
  }, [gpAtivo])

  const setGpAtivo = useCallback((v: boolean) => setGpAtivoState(v), [])
  const toggleGp = useCallback(() => setGpAtivoState(v => !v), [])
  const replayIntro = useCallback(() => {
    window.dispatchEvent(new Event('gp-replay'))
  }, [])

  return { gpAtivo, setGpAtivo, toggleGp, replayIntro }
}
