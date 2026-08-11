import { useState, useEffect, useRef } from 'react'
import { X, Clock, ChevronDown } from 'lucide-react'
import type { Touchpoint, StatusHistorico, StatusExecucao } from '@/lib/types'

const STATUS_LABELS: Record<StatusExecucao, string> = {
  a_fazer:      'A fazer',
  copy_escrita: 'Copy escrita',
  testeira:     'Testeira',
  revisao:      'Revisão',
  aprovado:     'Aprovado',
  publicado:    'Publicado',
}

const STATUS_COLORS: Record<StatusExecucao, { bg: string; color: string }> = {
  a_fazer:      { bg: '#F1F3F6', color: '#7C6B78' },
  copy_escrita: { bg: '#E4F0FF', color: '#0169F2' },
  testeira:     { bg: '#FDF1DE', color: '#C07700' },
  revisao:      { bg: '#F3EDFF', color: '#7B2FBE' },
  aprovado:     { bg: '#E4F6F5', color: '#0A7A68' },
  publicado:    { bg: '#D6F5E8', color: '#046638' },
}

interface TouchpointDrawerProps {
  tp: Touchpoint | null
  onClose: () => void
  onStatusChange: (tpId: string, status: StatusExecucao) => Promise<{ ok: boolean; error?: string } | void>
  onCopyChange: (tpId: string, copy: string) => Promise<{ ok: boolean; error?: string } | void>
  fetchHistorico: (tpId: string) => Promise<StatusHistorico[]>
}

export function TouchpointDrawer({ tp, onClose, onStatusChange, onCopyChange, fetchHistorico }: TouchpointDrawerProps) {
  const [historico, setHistorico] = useState<StatusHistorico[]>([])
  const [copyDraft, setCopyDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const copyRef = useRef<HTMLTextAreaElement>(null)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!tp) return
    setCopyDraft(tp.copy_atual ?? tp.copy_original ?? '')
    setHistorico([])
    setShowHistory(false)
  }, [tp?.id])

  async function loadHistorico() {
    if (!tp) return
    const h = await fetchHistorico(tp.id)
    setHistorico(h)
    setShowHistory(true)
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!tp) return
    await onStatusChange(tp.id, e.target.value as StatusExecucao)
  }

  async function handleSaveCopy() {
    if (!tp || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    await onCopyChange(tp.id, copyDraft)
    setSaving(false)
    savingRef.current = false
  }

  if (!tp) return null

  const statusStyle = STATUS_COLORS[tp.status] ?? STATUS_COLORS.a_fazer

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(51,3,45,0.18)',
          zIndex: 400, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(780px, 92vw)',
        background: 'var(--ws-surface)',
        borderLeft: '1px solid var(--ws-border)',
        zIndex: 401,
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              {tp.dia && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                  background: 'var(--ws-bg)', border: '1px solid var(--ws-border)',
                  borderRadius: 6, padding: '2px 8px', color: 'var(--ws-text-secondary)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>{tp.dia}</span>
              )}
              {tp.canal && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11,
                  color: 'var(--ws-text-secondary)',
                }}>{tp.canal}</span>
              )}
              {tp.tag && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                  background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast)',
                  borderRadius: 6, padding: '2px 8px',
                }}>{tp.tag}</span>
              )}
            </div>
            <h2 style={{
              margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500,
              fontSize: 18, color: 'var(--ws-text-primary)', lineHeight: 1.2,
            }}>{tp.ttitle ?? '(sem título)'}</h2>
            {tp.objetivo && (
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ws-text-secondary)', lineHeight: 1.5 }}>
                {tp.objetivo}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ws-text-secondary)', padding: 4, borderRadius: 8, flexShrink: 0,
          }}><X size={20} /></button>
        </div>

        {/* Status row */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--ws-border)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', fontWeight: 500 }}>Status</span>
            <div style={{ position: 'relative' }}>
              <select
                value={tp.status}
                onChange={handleStatusChange}
                style={{
                  appearance: 'none',
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  background: statusStyle.bg, color: statusStyle.color,
                  border: 'none', borderRadius: 8,
                  padding: '5px 28px 5px 10px',
                  cursor: 'pointer',
                }}
              >
                {(Object.keys(STATUS_LABELS) as StatusExecucao[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <ChevronDown size={12} style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', color: statusStyle.color,
              }} />
            </div>
          </div>

          {tp.criativo_status && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--ws-text-secondary)', fontWeight: 500 }}>Criativo</span>
              <span style={{
                fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '3px 8px',
                background: tp.criativo_status === 'ok' ? '#D6F5E8' : '#FDF1DE',
                color: tp.criativo_status === 'ok' ? '#046638' : '#C07700',
              }}>{tp.criativo_status === 'ok' ? 'OK' : 'A fazer'}</span>
            </div>
          )}

          <button
            onClick={showHistory ? () => setShowHistory(false) : loadHistorico}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: '1px solid var(--ws-border)',
              borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
              fontSize: 12, color: 'var(--ws-text-secondary)', fontFamily: 'var(--font-body)',
            }}
          >
            <Clock size={13} /> Histórico
          </button>
        </div>

        {/* History */}
        {showHistory && historico.length > 0 && (
          <div style={{
            margin: '0 24px', marginTop: 16, marginBottom: 0,
            background: 'var(--ws-bg)', borderRadius: 10, padding: '12px 16px',
            border: '1px solid var(--ws-border)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Histórico de status
            </div>
            {historico.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--ws-text-secondary)', padding: '4px 0', borderTop: '1px solid var(--ws-border)' }}>
                <span style={{ whiteSpace: 'nowrap' }}>{new Date(h.mudado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span style={{ color: 'var(--ws-text-primary)' }}>{STATUS_LABELS[h.status_anterior as StatusExecucao] ?? h.status_anterior} → {STATUS_LABELS[h.status_novo as StatusExecucao] ?? h.status_novo}</span>
              </div>
            ))}
          </div>
        )}

        {/* Copy columns */}
        <div style={{
          flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr',
          padding: '20px 24px', gap: 20, minHeight: 0,
        }}>
          {/* Original */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Copy original (referência)
            </div>
            <div style={{
              flex: 1, background: 'var(--ws-bg)', borderRadius: 10,
              border: '1px solid var(--ws-border)', padding: 14,
              fontSize: 13, color: 'var(--ws-text-primary)', lineHeight: 1.6,
              overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              minHeight: 240, fontFamily: 'var(--font-body)',
            }}>
              {tp.copy_original ?? '—'}
            </div>
          </div>

          {/* Atual */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-secondary)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Copy atual (editável)
            </div>
            <textarea
              ref={copyRef}
              value={copyDraft}
              onChange={e => setCopyDraft(e.target.value)}
              onBlur={handleSaveCopy}
              style={{
                flex: 1, resize: 'none', background: 'var(--ws-surface)',
                border: '1px solid var(--ws-border)', borderRadius: 10,
                padding: 14, fontSize: 13, color: 'var(--ws-text-primary)',
                lineHeight: 1.6, fontFamily: 'var(--font-body)', minHeight: 240,
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand-accent)' }}
              placeholder="Digite a copy aqui..."
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSaveCopy}
                disabled={saving}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  background: 'var(--brand-accent)', color: 'var(--brand-accent-contrast)',
                  border: 'none', borderRadius: 8, padding: '7px 16px',
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>

        {/* Criativo nota */}
        {tp.criativo_nota && (
          <div style={{
            margin: '0 24px 24px', background: '#FDF1DE',
            borderRadius: 10, padding: '12px 16px', fontSize: 13,
            color: '#7A4800', lineHeight: 1.5, border: '1px solid #F2D49A',
          }}>
            <span style={{ fontWeight: 600 }}>Nota criativo: </span>{tp.criativo_nota}
          </div>
        )}
      </div>
    </>
  )
}
