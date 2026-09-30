import { useEffect, useRef, useState } from 'react'
import { inputStyle } from './metasUi'

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
 * Campo numérico em pt-BR. Enquanto focado mostra o que foi digitado; fora de
 * foco, o número formatado. Devolve `null` quando vazio.
 */
export function CampoNumero({
  valor, onMudar, casas = 0, prefixo, sufixo, largura = 110, destaque = false, rotulo, placeholder, autoFocus,
}: {
  valor: number | null
  onMudar: (v: number | null) => void
  casas?: number
  prefixo?: string
  sufixo?: string
  largura?: number
  destaque?: boolean
  rotulo?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const [texto, setTexto] = useState(() => formatar(valor, casas))
  const focado = useRef(false)

  useEffect(() => {
    if (!focado.current) setTexto(formatar(valor, casas))
  }, [valor, casas])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {prefixo && <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>{prefixo}</span>}
      <input
        value={texto}
        inputMode={casas > 0 ? 'decimal' : 'numeric'}
        aria-label={rotulo}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => { focado.current = true }}
        onBlur={() => { focado.current = false; setTexto(formatar(valor, casas)) }}
        onChange={e => { setTexto(e.target.value); onMudar(interpretar(e.target.value, casas)) }}
        style={{
          ...inputStyle,
          width: largura,
          textAlign: 'right',
          fontSize: destaque ? 20 : 14,
          fontWeight: destaque ? 600 : 500,
          padding: destaque ? '8px 12px' : '6px 10px',
        }}
      />
      {sufixo && <span style={{ fontSize: 13, color: 'var(--ws-text-secondary)' }}>{sufixo}</span>}
    </span>
  )
}
