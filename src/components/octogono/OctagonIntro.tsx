import { useCallback, useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

const INTRO_KEY = 'ws-ufc-intro'
const SOM_KEY = 'ws-ufc-sound'

function readPreference(key: string, value: string): boolean {
  try { return localStorage.getItem(key) === value } catch { return false }
}

/** Abertura em vídeo do protótipo aprovado, usando o MP4 original fornecido. */
export function OctagonIntro() {
  const [open, setOpen] = useState(() => !readPreference(INTRO_KEY, 'off'))
  const [out, setOut] = useState(false)
  const [go, setGo] = useState(false)
  const [sound, setSound] = useState(() => readPreference(SOM_KEY, 'on'))
  const [run, setRun] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    videoRef.current?.pause()
    setOut(true)
    window.setTimeout(() => setOpen(false), 520)
  }, [])

  useEffect(() => {
    const replay = () => { setOut(false); setGo(false); setOpen(true); setRun(r => r + 1) }
    window.addEventListener('gp-replay', replay)
    return () => window.removeEventListener('gp-replay', replay)
  }, [])

  useEffect(() => {
    if (!open) return
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    video.muted = !sound
    video.play().catch(() => {
      video.muted = true
      setSound(false)
      video.play().catch(() => setGo(true))
    })
    const fallback = window.setTimeout(() => setGo(true), 2500)
    return () => { window.clearTimeout(fallback); video.pause() }
    // O vídeo reinicia somente ao reabrir; o som é alterado diretamente no elemento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, run])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLButtonElement>('.ufv-controls button')?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey) }
  }, [open, close])

  if (!open) return null

  const never = () => {
    try { localStorage.setItem(INTRO_KEY, 'off') } catch { /* preferência apenas nesta sessão */ }
    close()
  }
  const toggleSound = () => {
    const next = !sound
    setSound(next)
    try { localStorage.setItem(SOM_KEY, next ? 'on' : 'off') } catch { /* sessão atual */ }
    if (videoRef.current) {
      videoRef.current.muted = !next
      if (next && videoRef.current.paused && !videoRef.current.ended) void videoRef.current.play()
    }
  }
  const stageW = Math.max(window.innerWidth, window.innerHeight * 16 / 9)

  return <div key={run} ref={dialogRef} className={`ufv${go ? ' go' : ''}${out ? ' ufc-out' : ''}`}
    role="dialog" aria-modal="true" aria-label="Abertura do Octógono">
    <div className="ufv-stage">
      <video ref={videoRef} src="/assets/octogono-intro.mp4" playsInline preload="auto" muted
        onPlaying={() => setGo(true)} onError={() => setGo(true)} />
      <div className="ufv-mat" aria-hidden="true">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: Math.round(stageW * .056), lineHeight: 1, color: '#141416', whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>WE SCALE</div>
        <div style={{ marginTop: Math.round(stageW * .006), fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: Math.max(9, Math.round(stageW * .011)), letterSpacing: '.45em', color: '#7A5E14' }}>OCTÓGONO</div>
      </div>
      <div className="ufv-shade" aria-hidden="true" />
    </div>
    <div className="ufv-top">
      <div className="ufc-annc" aria-label="And now">
        {'AAAAND NOW'.split('').map((ch, i) => ch === ' '
          ? <span key={i} className="sp" />
          : <span key={i} className={i < 4 ? 'a' : ''}
              style={{ animationDelay: `${6.2 + (i < 4 ? i * .16 : .64 + (i - 4) * .07)}s` }}>{ch}</span>)}
        <span className="ufc-dots" style={{ animationDelay: '7.5s' }}>…</span>
      </div>
      <div className="ufc-welcome" style={{ animationDelay: '7.9s' }}>
        <div className="l1">Seja muito bem-vindo ao</div>
        <div className="l2">Octógono <b>We Scale</b></div>
      </div>
    </div>
    <div className="ufc-actions">
      <button className="ufc-enter" type="button" onClick={close}>Entrar no octógono</button>
      <button className="ufc-nomore" type="button" onClick={never}>Não mostrar novamente</button>
    </div>
    <div className="ufv-controls">
      <button className={`ufc-ghost${sound ? ' on' : ''}`} type="button" onClick={toggleSound} aria-pressed={sound}>
        {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}{sound ? 'Som ligado' : 'Ativar som'}
      </button>
      <button className="ufc-ghost" type="button" onClick={close}>Pular</button>
    </div>
  </div>
}
