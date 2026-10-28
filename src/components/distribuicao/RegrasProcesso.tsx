import { useState } from 'react'
import { cardStyle, sectionTitleStyle } from '@/components/metas/metasUi'
import { etapasDoProcesso, type ConfigDistribuicao } from '@/lib/distribuicao/regrasProcesso'
import { botaoTexto } from './ui'

// Todas as regras do processo, na ordem em que cada conversão passa. Abre fechado: quem usa a aba
// todo dia não precisa rolar por cima.
export function RegrasProcesso({ config }: { config: ConfigDistribuicao[] }) {
  const [aberto, setAberto] = useState(false)
  const etapas = etapasDoProcesso(config)
  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={sectionTitleStyle}>Como a distribuição funciona</h2>
        <button type="button" style={botaoTexto()} onClick={() => setAberto(a => !a)} aria-expanded={aberto} aria-controls="regras-processo">
          {aberto ? 'Fechar' : 'Ver todas as regras'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ws-text-secondary)' }}>
        O caminho de cada conversão, do formulário até o deal no RD. Os números vêm da configuração em uso.
      </p>
      {aberto && (
        <ol id="regras-processo" style={{ margin: '14px 0 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {etapas.map(e => (
            <li key={e.titulo} style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{e.titulo}</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--ws-text-secondary)', maxWidth: 820 }}>
                {e.itens.map(i => <li key={i}>{i}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
