import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { clampK, clampX0, kAjuste, nivelDeZoom, MARGENS, type NivelZoom } from '@/lib/timeline/zoom'

interface Opts {
  diasTotal: number
  larguraViewport: number
  /** Largura do conteúdo no k atual (vem do layout) — pra travar o pan. */
  larguraConteudo: number
}

const PASSO_BOTAO = 1.6

/**
 * Estado de zoom/pan da Pista. `k` = px por dia, `x0` = deslocamento em px.
 * Ctrl/⌘+scroll ou pinch = zoom ancorado no cursor; scroll simples e arrasto =
 * pan; botões −/+/ajustar. O nível (Macro/Etapas/Micro) deriva de `k` com
 * histerese — abre sempre em Etapas ajustado ao deal inteiro.
 *
 * IMPORTANTE: `handlers.onWheel` espera receber um `WheelEvent` de DOM puro,
 * registrado pelo componente via `addEventListener('wheel', h, { passive:
 * false })` num `useEffect` sobre o `ref` do container — NUNCA como prop
 * `onWheel` do React. O listener de wheel do React é passivo por padrão, e
 * `preventDefault()` dentro dele é um no-op (o scroll da página não é
 * bloqueado), quebrando o zoom com Ctrl/⌘+scroll e o pan por trackpad.
 */
export function useZoomPan({ diasTotal, larguraViewport, larguraConteudo }: Opts) {
  const kFit = useMemo(() => kAjuste(diasTotal, larguraViewport), [diasTotal, larguraViewport])
  const [k, setK] = useState(kFit)
  const [x0, setX0] = useState(0)
  const [nivel, setNivel] = useState<NivelZoom>('etapas')
  const [arrastando, setArrastando] = useState(false)
  const arrasto = useRef<{ x: number; x0: number } | null>(null)
  const inicializado = useRef(false)

  // 1ª medição do viewport (largura 0 → real): ajusta ao deal uma vez.
  useEffect(() => {
    if (inicializado.current || larguraViewport <= 0 || diasTotal <= 0) return
    inicializado.current = true
    setK(kFit); setX0(0); setNivel('etapas')
  }, [kFit, larguraViewport, diasTotal])

  useEffect(() => { setNivel(n => nivelDeZoom(k, n)) }, [k])
  useEffect(() => { setX0(v => clampX0(v, larguraConteudo, larguraViewport)) }, [larguraConteudo, larguraViewport])

  /** Zoom multiplicativo mantendo o ponto sob `xCursor` (px no viewport) parado. */
  const zoomEm = useCallback((fator: number, xCursor: number) => {
    setK(kAtual => {
      const kNovo = clampK(kAtual * fator, kFit)
      const dias = (xCursor - MARGENS.ESQ + x0) / kAtual
      setX0(clampX0(dias * kNovo - (xCursor - MARGENS.ESQ), larguraConteudo * (kNovo / kAtual), larguraViewport))
      return kNovo
    })
  }, [kFit, x0, larguraConteudo, larguraViewport])

  const zoomIn = useCallback(() => zoomEm(PASSO_BOTAO, larguraViewport / 2), [zoomEm, larguraViewport])
  const zoomOut = useCallback(() => zoomEm(1 / PASSO_BOTAO, larguraViewport / 2), [zoomEm, larguraViewport])
  const ajustar = useCallback(() => { setK(kFit); setX0(0) }, [kFit])

  // Ver nota do JSDoc acima do hook: precisa ser ligado via addEventListener
  // nativo com { passive: false }, nunca via prop onWheel do React.
  const onWheel = useCallback((e: WheelEvent) => {
    const alvo = e.currentTarget as HTMLElement | null
    const esq = alvo?.getBoundingClientRect().left ?? 0
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      zoomEm(Math.exp(-e.deltaY * 0.01), e.clientX - esq)
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      e.preventDefault()
      setX0(v => clampX0(v + (e.deltaX || e.deltaY), larguraConteudo, larguraViewport))
    }
  }, [zoomEm, larguraConteudo, larguraViewport])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return
    arrasto.current = { x: e.clientX, x0 }
    setArrastando(true)
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }, [x0])
  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!arrasto.current) return
    setX0(clampX0(arrasto.current.x0 - (e.clientX - arrasto.current.x), larguraConteudo, larguraViewport))
  }, [larguraConteudo, larguraViewport])
  const onPointerUp = useCallback(() => { arrasto.current = null; setArrastando(false) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.key === '+' || e.key === '=') zoomIn()
      else if (e.key === '-') zoomOut()
      else if (e.key === '0') ajustar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIn, zoomOut, ajustar])

  return { k, x0, nivel, zoomIn, zoomOut, ajustar, arrastando, handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp } }
}
