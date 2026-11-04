// Retratos aprovados para uso em todos os avatares das duas vendedoras.
const FOTOS_APROVADAS = new Map([
  ['Cassiana Lavall', '/assets/campanha-ufc/cassiana.png'],
  ['Thaina Freitas', '/assets/campanha-ufc/thaina.png'],
])

export function fotoVendedor(nome: string, fotoCadastro?: string | null): string | undefined {
  return FOTOS_APROVADAS.get(nome.trim()) ?? (fotoCadastro?.trim() || undefined)
}
