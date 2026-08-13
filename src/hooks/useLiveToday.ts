import { useEffect, useState } from 'react'
import { todayLocal } from '@/lib/dateUtils'

/** Retorna a data local de hoje (YYYY-MM-DD) e atualiza automaticamente ao virar o dia.
 *  Use em vez de const TODAY em module scope, que congela na hora do carregamento da página.
 */
export function useLiveToday(): string {
  const [today, setToday] = useState<string>(() => todayLocal())
  useEffect(() => {
    const iv = setInterval(() => {
      const now = todayLocal()
      setToday(prev => (prev !== now ? now : prev))
    }, 60_000)
    return () => clearInterval(iv)
  }, [])
  return today
}
