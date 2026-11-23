// Zoom: meetinglistdetails_2026_11_01_2026_11_23.csv.
// Agregação por e-mail normalizado, sem identificadores no cliente.
// Reconexões, anfitrião e internos confirmados excluídos antes da agregação.
export const PRESENCAS_LIVES_LEGACY = {
  inicio: '2026-11-01',
  ate: '2026-11-23',
  nome: 'Odonto Legacy',
  dias: ['2026-11-05', '2026-11-12', '2026-11-19'],
  grupos: [
    { dias: ['2026-11-05'], pessoas: 3 },
    { dias: ['2026-11-05', '2026-11-12', '2026-11-19'], pessoas: 1 },
    { dias: ['2026-11-05', '2026-11-19'], pessoas: 2 },
    { dias: ['2026-11-12'], pessoas: 5 },
    { dias: ['2026-11-12', '2026-11-19'], pessoas: 3 },
    { dias: ['2026-11-19'], pessoas: 2 },
  ],
}

export function presencasLivesLegacy(inicio: string, fim: string) {
  const fonte = PRESENCAS_LIVES_LEGACY
  const dias = fonte.dias.filter(d => d >= inicio && d <= fim)
  const grupos = fonte.grupos.map(g => ({ ...g, dias: g.dias.filter(d => dias.includes(d)) }))
  return {
    unicos: grupos.reduce((n, g) => n + (g.dias.length ? g.pessoas : 0), 0),
    recorrentes: grupos.reduce((n, g) => n + (g.dias.length >= 2 ? g.pessoas : 0), 0),
    historico: dias.map(dia => ({
      dia,
      presentes: grupos.reduce((n, g) => n + (g.dias.includes(dia) ? g.pessoas : 0), 0),
      acumulados: grupos.reduce((n, g) => n + (g.dias.some(d => d <= dia) ? g.pessoas : 0), 0),
    })),
  }
}
