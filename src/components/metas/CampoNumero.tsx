import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import './metas.css'

function formatar(v: number | null, casas: number): string {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })
}

/** Aceita "74.900", "47,2", "1.557,6". Inteiro (casas = 0) ignora tudo que não é dígito. */
function interpretar(texto: string, casas: number): number | null {
  const t = texto.trim()
  if (!t) return null
  if (casas === 0) {
    const digitos = t.replace(/\D/g, '')
    return digitos ? Number(digitos) : null
  }
  const n = Number(t.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Campo numérico em pt-BR com setinhas (▲▼) e seta do teclado pra subir/descer
 * de `passo` em `passo`, sem precisar digitar. Enquanto focado mostra o que
 * foi digitado; fora de foco, o número formatado. Devolve `null` quando vazio.
 */
export function CampoNumero({
  valor, onMudar, casas = 0, passo = 1, min = 0, max, prefixo, sufixo, largura = 110, destaque = false,
  rotulo, placeholder, autoFocus, desabilitado = false, invalido = false,
}: {
  valor: number | null
  onMudar: (v: number | null) => void
  casas?: number
  passo?: number
  min?: number
  max?: number
  prefixo?: string
  sufixo?: string
  largura?: number
  destaque?: boolean
  rotulo?: string
  placeholder?: string
  autoFocus?: boolean
  desabilitado?: boolean
  /** Borda vermelha (valor que não fecha a regra, ex.: soma dos pesos). */
  invalido?: boolean
}) {
  const [texto, setTexto] = useState(() => formatar(valor, casas))
  const textoRef = useRef(texto)
  textoRef.current = texto
  const focado = useRef(false)

  // O texto sempre acompanha o valor real. Só não reescreve enquanto a pessoa
  // digita algo que já vale o mesmo número (ex.: "47," com valor 47).
  useEffect(() => {
    if (!focado.current || interpretar(textoRef.current, casas) !== valor) setTexto(formatar(valor, casas))
  }, [valor, casas])

  function limitar(n: number): number {
    const fator = 10 ** casas
    const r = Math.round(n * fator) / fator
    return Math.min(max ?? Infinity, Math.max(min, r))
  }

  function passar(direcao: 1 | -1) {
    if (desabilitado) return
    onMudar(limitar((valor ?? 0) + direcao * passo))
  }

  const alturaSeta = destaque ? 20 : 15
  const setaStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: alturaSeta,
    border: 'none', background: 'none', padding: 0, cursor: desabilitado ? 'not-allowed' : 'pointer',
    color: 'var(--ws-text-secondary)',
  } as const

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {prefixo && <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>{prefixo}</span>}
      <span className="cm-campo" style={{
        display: 'inline-flex', alignItems: 'stretch', borderRadius: 'var(--radius-sm)',
        border: `1px solid ${invalido ? 'var(--status-risco)' : 'var(--ws-border)'}`, boxShadow: invalido ? '0 0 0 2px var(--status-risco-bg)' : 'none',
        background: desabilitado ? 'var(--ws-bg)' : 'var(--ws-surface)', overflow: 'hidden',
      }}>
        <input
          value={texto}
          inputMode={casas > 0 ? 'decimal' : 'numeric'}
          aria-label={rotulo}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={desabilitado}
          onFocus={() => { focado.current = true }}
          onBlur={() => { focado.current = false; setTexto(formatar(valor, casas)) }}
          onChange={e => {
            setTexto(e.target.value)
            const n = interpretar(e.target.value, casas)
            onMudar(n == null ? null : Math.min(max ?? Infinity, Math.max(min, n)))
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowUp') { e.preventDefault(); passar(1) }
            if (e.key === 'ArrowDown') { e.preventDefault(); passar(-1) }
          }}
          style={{
            width: largura, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right',
            fontFamily: 'var(--font-body)', color: 'var(--ws-text-primary)',
            fontSize: destaque ? 20 : 14, fontWeight: destaque ? 600 : 500,
            padding: destaque ? '8px 6px 8px 12px' : '5px 4px 5px 10px',
          }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: '1px solid var(--ws-border)' }}>
          <button type="button" tabIndex={-1} aria-label={`Aumentar ${rotulo ?? ''}`.trim()} disabled={desabilitado}
            className="cm-seta" onMouseDown={e => e.preventDefault()} onClick={() => passar(1)} style={setaStyle}>
            <ChevronUp size={13} />
          </button>
          <button type="button" tabIndex={-1} aria-label={`Diminuir ${rotulo ?? ''}`.trim()} disabled={desabilitado}
            className="cm-seta" onMouseDown={e => e.preventDefault()} onClick={() => passar(-1)}
            style={{ ...setaStyle, borderTop: '1px solid var(--ws-border)' }}>
            <ChevronDown size={13} />
          </button>
        </span>
      </span>
      {sufixo && <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>{sufixo}</span>}
    </span>
  )
}
