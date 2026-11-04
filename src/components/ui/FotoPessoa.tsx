import { useState, type CSSProperties, type ReactNode } from 'react'
import { fotoVendedor } from '@/lib/fotosVendedores'

export function FotoPessoa({ nome, foto, fallback, style }: {
  nome: string
  foto?: string | null
  fallback: ReactNode
  style?: CSSProperties
}) {
  const src = fotoVendedor(nome, foto)
  const retratoAprovado = fotoVendedor(nome)
  const [fotoComFalha, setFotoComFalha] = useState<string | null>(null)

  if (!src || src === fotoComFalha) return <>{fallback}</>

  return <img src={src} alt={nome} draggable={false}
    onError={() => setFotoComFalha(src)}
    style={{
      display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', ...style,
      ...(retratoAprovado ? { objectPosition: 'center 20%', transform: 'scale(1.7)', transformOrigin: 'center 25%' } : {}),
    }} />
}
