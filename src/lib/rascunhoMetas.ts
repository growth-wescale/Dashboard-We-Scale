import type { RascunhoConfig } from '@/lib/configMetas'

/**
 * Rascunho da Configuração das Metas salvo no navegador (decisão C8 do spec):
 * sobrevive a recarregar a página, só vale neste computador/navegador. Toda
 * leitura/escrita em try/catch — janela anônima, armazenamento bloqueado ou
 * cheio simplesmente não persistem.
 */
const PREFIXO = 'ws-config-metas:v1:'

function armazenamento(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null ? null : globalThis.localStorage
  } catch {
    return null
  }
}

export function carregarRascunho(mesReferencia: string): RascunhoConfig | null {
  try {
    const bruto = armazenamento()?.getItem(PREFIXO + mesReferencia)
    if (!bruto) return null
    const r = JSON.parse(bruto) as Partial<RascunhoConfig> | null
    if (!r || r.mesReferencia !== mesReferencia || !r.origem || !Array.isArray(r.marcas) || !Array.isArray(r.semanas)) return null
    return { ...r, distribuicaoSemanal: Array.isArray(r.distribuicaoSemanal) ? r.distribuicaoSemanal : [] } as RascunhoConfig
  } catch {
    return null
  }
}

export function salvarRascunho(r: RascunhoConfig): boolean {
  try {
    const s = armazenamento()
    if (!s) return false
    s.setItem(PREFIXO + r.mesReferencia, JSON.stringify(r))
    return true
  } catch {
    return false
  }
}

export function descartarRascunho(mesReferencia: string): void {
  try {
    armazenamento()?.removeItem(PREFIXO + mesReferencia)
  } catch {
    // sem armazenamento: nada a apagar
  }
}
