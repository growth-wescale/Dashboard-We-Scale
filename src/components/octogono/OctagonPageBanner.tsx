/** Moldura visual para páginas que não têm um layout específico de arena.
 * Não consulta dados nem modifica filtros, gráficos ou cálculos da página. */
const TITULOS: Record<string, string> = {
  '/marca': 'Saúde da Marca',
  '/okrs': 'Meta & OKRs',
  '/funil-vendas': 'Visão Macro',
  '/performance-vendas': 'Performance',
  '/analise-perda': 'Análise de Perda',
  '/linha-do-tempo': 'Linha do Tempo',
  '/analise-objecoes': 'Análise de Objeções',
  '/metas': 'Configuração das Metas',
  '/acessos': 'Usuários & Acessos',
}

export function OctagonPageBanner({ pathname }: { pathname: string }) {
  const route = Object.keys(TITULOS).find(key => pathname === key || pathname.startsWith(`${key}/`))
  if (!route) return null

  return <div className="oct-page-banner" aria-hidden="true">
    <div><small>WE SCALE · OCTÓGONO</small><h2>{TITULOS[route]}</h2></div>
    <span>Performance em foco. Decisões baseadas em dados.</span>
  </div>
}
