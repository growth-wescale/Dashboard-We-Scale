import { useLocation } from 'react-router-dom'
import { PARTNER_MARKETING_ROUTES } from '@/lib/partnerOuroFetch'
import { useEffect, useState } from 'react'

/** Aviso de contrato da parcela Partner, inclusive no consolidado e no PDF. */
export function PartnerSourceNote() {
  const { pathname } = useLocation()
  const [loaded, setLoaded] = useState<string | null>(null)
  useEffect(() => {
    const onRead = (event: Event) => {
      const value = (event as CustomEvent<{ observedAt?: string }>).detail?.observedAt
      if (value) setLoaded(value)
    }
    window.addEventListener('partner-ouro:read', onRead)
    return () => window.removeEventListener('partner-ouro:read', onRead)
  }, [])
  if (import.meta.env.VITE_PARTNER_OURO_ENABLED !== 'true' || !PARTNER_MARKETING_ROUTES.has(pathname)) return null
  return <div role="note" style={{ fontSize: 11, padding: '7px 18px', color: 'var(--ws-text-secondary)', borderBottom: '1px solid var(--ws-border)', lineHeight: 1.5 }}>
    <strong>Scale Partner · base automática.</strong> Marketing conta contatos qualificados, com datas do CRM. As páginas de Vendas mantêm suas fontes atuais.
    {' '}Setembro tem cobertura histórica parcial; fechamentos manuais identificados na S&amp;OP permanecem históricos.
    {loaded && <> Registro mais recente atualizado: {new Date(loaded).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</>}
  </div>
}
