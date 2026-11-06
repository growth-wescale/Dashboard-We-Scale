import { mensalStatusEndpoint, previaMensal } from '@/lib/previaMensal'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const Publicacao = createContext<string | undefined>(undefined)

export function usePeriodoSemPublicacao(inicio: string) {
  const dia = useContext(Publicacao)
  return dia !== undefined && inicio >= '2026-11-01' && (!dia || inicio > dia)
}

export function PeriodoDisponivel({ inicio, children }: { inicio: string; children: ReactNode }) {
  if (usePeriodoSemPublicacao(inicio))
    return <p role="status">Dados do período ainda não disponíveis.</p>
  return <>{children}</>
}

export function CoberturaMensalPrevia({ children, ativa }: { children: ReactNode; ativa: boolean }) {
  const [dia, setDia] = useState('')
  const [carga, setCarga] = useState('consultando a última publicação')
  useEffect(() => {
    if (!ativa) return
    const ctrl = new AbortController()
    const atualizar = async () => {
      try {
        const r = await fetch(mensalStatusEndpoint, { signal: ctrl.signal, cache: 'no-store' })
        if (!r.ok) throw new Error()
        const { publicado, dia: snapshot } = await r.json()
        const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(publicado))
        setDia(snapshot)
        setCarga('última publicação da ouro em ' + data + ' (Brasília). Períodos posteriores têm cobertura pendente.')
      } catch {
        if (!ctrl.signal.aborted) { setDia(''); setCarga('cobertura da ouro indisponível.') }
      }
    }
    void atualizar()
    const timer = setInterval(atualizar, 60000)
    return () => { ctrl.abort(); clearInterval(timer) }
  }, [ativa])
  if (!ativa) return <>{children}</>
  return <Publicacao.Provider value={dia}>{previaMensal && <aside style={{ padding: '8px 16px', background: '#fff4d3', color: '#523c10' }}>Prévia mensal de Marketing · {carga}</aside>}{children}</Publicacao.Provider>
}
