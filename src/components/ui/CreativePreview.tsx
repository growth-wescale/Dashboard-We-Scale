import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Image as ImageIcon, Play, X } from 'lucide-react'
import type { AdCreativePreview } from '@/hooks/useAdCreatives'

interface CreativePreviewProps {
  preview: AdCreativePreview
  label?: string
  compact?: boolean
}

export function CreativePreview({ preview, label = 'Ver anúncio', compact = false }: CreativePreviewProps) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const hasInternalPreview = Boolean(preview.mediaUrl || preview.thumbnailUrl)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!hasInternalPreview) {
    return preview.postUrl ? (
      <a href={preview.postUrl} target="_blank" rel="noopener noreferrer" style={linkStyle(compact)}>
        <ExternalLink size={compact ? 12 : 14} /> Facebook
      </a>
    ) : null
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle(compact)} aria-label={`${label}: ${preview.adName}`}>
        {preview.mediaType === 'video' ? <Play size={compact ? 12 : 14} fill="currentColor" /> : <ImageIcon size={compact ? 12 : 14} />}
        {label}
      </button>
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview do anúncio ${preview.adName}`}
          onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(7, 12, 22, .82)', backdropFilter: 'blur(5px)', display: 'grid', placeItems: 'center', padding: 20 }}
        >
          <div style={{ width: 'min(980px, 96vw)', maxHeight: '92vh', background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--ws-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.adName}</div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-secondary)', marginTop: 2 }}>Preview interno · não exige acesso à BM</div>
              </div>
              {preview.postUrl && (
                <a href={preview.postUrl} target="_blank" rel="noopener noreferrer" style={linkStyle(false)}>
                  <ExternalLink size={14} /> Abrir no Facebook
                </a>
              )}
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Fechar preview" style={{ border: 0, background: 'var(--ws-bg)', color: 'var(--ws-text-primary)', width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ background: '#090d14', flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: 16 }}>
              {preview.mediaType === 'video' && preview.mediaUrl ? (
                <video controls playsInline preload="metadata" poster={preview.thumbnailUrl ?? undefined} style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(92vh - 100px)', borderRadius: 8, background: '#000' }}>
                  <source src={preview.mediaUrl} />
                  Seu navegador não conseguiu reproduzir este vídeo.
                </video>
              ) : (
                <img src={preview.mediaUrl ?? preview.thumbnailUrl ?? ''} alt={`Criativo do anúncio ${preview.adName}`} style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(92vh - 100px)', objectFit: 'contain', borderRadius: 8 }} />
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function buttonStyle(compact: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, var(--ws-border))',
    background: 'color-mix(in srgb, var(--brand-accent) 9%, var(--ws-surface))',
    color: 'var(--brand-accent)', borderRadius: 7, cursor: 'pointer', fontWeight: 700,
    fontSize: compact ? 10 : 11, padding: compact ? '3px 7px' : '5px 9px', whiteSpace: 'nowrap',
  }
}

function linkStyle(compact: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ws-text-secondary)',
    fontSize: compact ? 10 : 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
  }
}
