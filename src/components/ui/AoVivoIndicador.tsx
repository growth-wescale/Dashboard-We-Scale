import { baseEtapas, baseVendas } from '@/lib/aoVivo/basesVendas'
import { useBaseAoVivo, useCanalAoVivo } from '@/hooks/useBaseAoVivo'

/**
 * Selo "Ao vivo" das abas de Vendas: diz se os números estão acompanhando o
 * banco sozinhos (aviso do Realtime), se estão sendo conferidos de tempos em
 * tempos (sem o aviso) ou se a última atualização falhou.
 *
 * `comEtapas` = a página também usa os eventos de etapa (Visão Macro,
 * Performance); sem ele, os eventos nem são carregados (Análise de Perda).
 */

function horario(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function AoVivoIndicador({ comEtapas = false }: { comEtapas?: boolean }) {
  const canal = useCanalAoVivo()
  const vendas = useBaseAoVivo(baseVendas)
  const etapas = useBaseAoVivo(baseEtapas, comEtapas)

  const carregando = vendas.carregando || etapas.carregando
  const erro = vendas.erro ?? etapas.erro
  const ultimaMudanca = horario(vendas.atualizadoEm ?? etapas.atualizadoEm)

  let cor = 'var(--ws-text-secondary)'
  let texto = 'Conectando…'
  let dica = 'Ligando o aviso ao vivo do banco.'
  let pulsando = false

  if (carregando) {
    texto = 'Carregando…'
    dica = 'Baixando a base de Vendas pela primeira vez neste navegador.'
  } else if (erro) {
    cor = 'var(--status-risco)'
    texto = 'Sem atualizar'
    dica = `A última conferência com o banco falhou (${erro}). Os números são os da última atualização`
      + `${ultimaMudanca ? ` (${ultimaMudanca})` : ''}; o painel tenta de novo sozinho.`
  } else if (canal === 'ao-vivo') {
    cor = 'var(--status-positivo)'
    texto = 'Ao vivo'
    pulsando = true
    dica = 'Os números se atualizam sozinhos quando o banco muda (o banco acompanha o RD a cada poucos minutos).'
      + (ultimaMudanca ? ` Última mudança no banco: ${ultimaMudanca}.` : '')
  } else if (canal === 'sem-canal') {
    cor = 'var(--status-atencao)'
    texto = 'Atualiza a cada 30 s'
    dica = 'O aviso ao vivo do banco não está disponível agora; o painel confere o banco a cada 30 segundos.'
      + (ultimaMudanca ? ` Última mudança no banco: ${ultimaMudanca}.` : '')
  }

  return (
    <span
      role="status"
      aria-live="polite"
      title={dica}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 11px', borderRadius: 999,
        border: '1px solid var(--ws-border)', background: 'var(--ws-surface)',
        fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
        color: 'var(--ws-text-secondary)', whiteSpace: 'nowrap', cursor: 'default',
      }}
    >
      <span
        aria-hidden="true"
        className={pulsando ? 'ao-vivo-ponto--pulsando' : undefined}
        style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }}
      />
      {texto}
    </span>
  )
}
