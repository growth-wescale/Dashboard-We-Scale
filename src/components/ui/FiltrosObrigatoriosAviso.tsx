import { AlertCircle } from 'lucide-react'

/**
 * Aviso central que substitui o conteúdo da aba quando um filtro obrigatório
 * (Marca ou Período) está sem nenhuma opção marcada. A `FilterBar` continua
 * no topo, com a borda vermelha no filtro pendente.
 */
export function FiltrosObrigatoriosAviso({ faltando }: { faltando: string[] }) {
  const alvo = faltando.length === 1
    ? faltando[0]
    : `${faltando.slice(0, -1).join(', ')} e ${faltando.at(-1)}`

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      textAlign: 'center', padding: '64px 24px',
      color: 'var(--ws-text-secondary)',
    }}>
      <AlertCircle size={28} style={{ color: 'var(--status-critico, #dc2626)' }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ws-text-primary)' }}>
        Selecione {alvo} para ver os dados
      </div>
      <div style={{ fontSize: 13, maxWidth: 360 }}>
        Nenhuma opção marcada em {faltando.length === 1 ? 'um filtro obrigatório' : 'filtros obrigatórios'}.
        Marque ao menos uma opção {faltando.length === 1 ? 'nele' : 'em cada'} para o dashboard voltar.
      </div>
    </div>
  )
}
