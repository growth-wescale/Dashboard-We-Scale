import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Bot } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const WELCOME = 'Olá! Sou o assistente We Scale. Tenho acesso aos dados dos últimos 30 dias. Pergunte sobre MQLs, leads, investimento, funil ou qualquer métrica das marcas.'

export function AiChat() {
  const [open, setOpen]     = useState(false)
  const [msgs, setMsgs]     = useState<Message[]>([])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const next: Message[] = [...msgs, { role: 'user', content: text }]
    setMsgs(next)
    setInput('')
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { messages: next },
      })
      if (error) throw error
      setMsgs([...next, { role: 'assistant', content: data.answer }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao conectar com o assistente.'
      setMsgs([...next, { role: 'assistant', content: `Erro: ${msg}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const displayed: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'assistant', content: WELCOME },
    ...msgs,
  ]

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Abrir assistente"
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--ws-vinho-b)',
          border: 'none',
          cursor: 'pointer',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,.35)',
          zIndex: 200,
          transition: 'transform .15s, box-shadow .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 92,
            right: 28,
            width: 380,
            maxHeight: 520,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--ws-surface)',
            border: '1px solid var(--ws-border)',
            borderRadius: 'var(--radius-lg, 12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,.4)',
            zIndex: 200,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            background: 'var(--ws-vinho-b)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <Bot size={20} color="#fff" />
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-body)' }}>
                Assistente We Scale
              </div>
              <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 11, fontFamily: 'var(--font-body)' }}>
                Dados dos últimos 30 dias
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)', display: 'flex', padding: 2 }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {displayed.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '84%',
                  padding: '9px 12px',
                  borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: m.role === 'user' ? 'var(--ws-vinho-b)' : 'var(--ws-bg)',
                  border: m.role === 'assistant' ? '1px solid var(--ws-border)' : 'none',
                  color: m.role === 'user' ? '#fff' : 'var(--ws-text-primary)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontFamily: 'var(--font-body)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '9px 12px',
                  borderRadius: '12px 12px 12px 4px',
                  background: 'var(--ws-bg)',
                  border: '1px solid var(--ws-border)',
                  color: 'var(--ws-text-secondary)',
                  fontSize: 13,
                  fontFamily: 'var(--font-body)',
                  fontStyle: 'italic',
                }}>
                  Analisando dados...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--ws-border)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Pergunte sobre os dados..."
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: '1px solid var(--ws-border)',
                borderRadius: 8,
                padding: '8px 10px',
                background: 'var(--ws-bg)',
                color: 'var(--ws-text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                lineHeight: 1.4,
                outline: 'none',
                maxHeight: 90,
                overflowY: 'auto',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: 'none',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                background: input.trim() && !loading ? 'var(--ws-vinho-b)' : 'var(--ws-border)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background .15s',
                flexShrink: 0,
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
