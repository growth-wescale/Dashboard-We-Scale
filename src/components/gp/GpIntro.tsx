import { useEffect, useState } from 'react'

/**
 * Overlay animado de abertura do Modo GP — tema Fórmula 1.
 * Portado do handoff `_handoff_gp_mode/reference/gp-mode.jsx` (fn GpIntro).
 *
 * **Comportamento:**
 * - Aparece automaticamente em toda abertura do dashboard SE o Modo GP
 *   estiver ativo E `localStorage.ws-gp-intro !== 'off'`.
 * - Botão "Não mostrar novamente" seta `ws-gp-intro = 'off'` (só browser).
 * - Botão "Pular" ou "Entrar no dashboard" fecha com fade de 480ms (não
 *   marca "off" — reabre na próxima sessão).
 * - Evento `gp-replay` (disparado pelo botão ▶ na topbar) reabre
 *   ignorando o `ws-gp-intro`.
 * - Respeita `prefers-reduced-motion` (animações reduzidas via CSS).
 *
 * **Só é renderizado quando o Modo GP está ativo** — controle no AppLayout.
 */

const LS_KEY = 'ws-gp-intro'
const WORDMARK = 'WE SCALE'
const STREAKS = [
  { top: '24%', delay: 0 },
  { top: '38%', delay: 0.12 },
  { top: '52%', delay: 0.05 },
  { top: '64%', delay: 0.2 },
  { top: '78%', delay: 0.1 },
]

function seenBefore(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === 'off'
  } catch {
    return false
  }
}

export function GpIntro() {
  const [open, setOpen] = useState<boolean>(() => !seenBefore())
  const [out, setOut] = useState(false)

  // Reabre via evento `gp-replay` (botão ▶ na topbar)
  useEffect(() => {
    const handleReplay = () => {
      setOut(false)
      setOpen(false)
      requestAnimationFrame(() => setOpen(true))
    }
    window.addEventListener('gp-replay', handleReplay)
    return () => window.removeEventListener('gp-replay', handleReplay)
  }, [])

  if (!open) return null

  const close = () => {
    setOut(true)
    setTimeout(() => setOpen(false), 480)
  }

  const never = () => {
    try {
      localStorage.setItem(LS_KEY, 'off')
    } catch {
      // sem persistência — fecha só nessa sessão
    }
    close()
  }

  return (
    <div
      className={'gp-intro' + (out ? ' gp-out' : '')}
      role="dialog"
      aria-label="Abertura Modo GP"
    >
      <div className="gp-intro__checker" />
      {STREAKS.map((s, i) => (
        <div
          key={i}
          className="gp-intro__streak"
          style={{ top: s.top, animationDelay: `${s.delay}s` }}
        />
      ))}

      <div className="gp-intro__skipwrap">
        <button className="gp-intro__ghost" onClick={close} type="button">
          Pular
        </button>
      </div>

      <div className="gp-intro__stage">
        <div className="gp-intro__word">
          {WORDMARK.split('').map((ch, i) =>
            ch === ' ' ? (
              <span key={i} className="gp-intro__sp" />
            ) : (
              <span key={i} style={{ animationDelay: `${0.35 + i * 0.09}s` }}>
                {ch}
              </span>
            ),
          )}
          <div className="gp-intro__swoosh" />
        </div>
        <div className="gp-intro__tag">GP We Scale · Setembro 2026</div>
        <div className="gp-intro__sub">Cada semana é uma volta. Cada venda, uma ultrapassagem.</div>
        <div className="gp-intro__actions">
          <button className="gp-intro__enter" onClick={close} type="button">
            Entrar no dashboard
          </button>
          <button className="gp-intro__nomore" onClick={never} type="button">
            Não mostrar novamente
          </button>
        </div>
      </div>
    </div>
  )
}
