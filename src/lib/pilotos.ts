/**
 * Pilotos da Campanha de Metas: quem aparece em cada mês é quem tem meta
 * naquele mês (`DB_Metas_Performance`), não uma lista fixa no código.
 *
 * Quem já correu com perfil F1 (foto do pódio, cor e escuderia) mantém o
 * perfil. Piloto novo ganha iniciais, uma cor estável (pelo nome) e a foto do
 * cadastro (`nome_cargo_foto.foto`), se tiver.
 */

export interface PerfilPiloto {
  nome: string
  iniciais: string
  cor: string
  foto?: string
  escuderia?: string
}

const PERFIS_F1: Record<string, Omit<PerfilPiloto, 'nome'>> = {
  // Closers
  'Jéssica': { iniciais: 'JES', cor: '#00D2BE', foto: '/assets/vendedores/jessica.png', escuderia: 'Mercedes AMG Petronas' },
  'Douglas': { iniciais: 'DOU', cor: '#006F62', foto: '/assets/vendedores/douglas.png', escuderia: 'Aston Martin' },
  'Aurélio Briano': { iniciais: 'AUR', cor: '#005AFF', foto: '/assets/vendedores/aurelio.png', escuderia: 'Williams Racing' },
  'Bruna': { iniciais: 'BRU', cor: '#FF8000', foto: '/assets/vendedores/bruna.png', escuderia: 'McLaren' },
  // SDRs
  'Sarah Padilha': { iniciais: 'SAR', cor: '#00D2BE', foto: '/assets/vendedores/sarah.png', escuderia: 'Mercedes AMG Petronas' },
  'Thiago': { iniciais: 'THI', cor: '#3671C6', foto: '/assets/vendedores/thiago.png', escuderia: 'Red Bull Racing' },
  'Xayane': { iniciais: 'XAY', cor: '#B6BABD', foto: '/assets/vendedores/xayane.png', escuderia: 'Mercedes SDR' },
  'Vanessa Daniel': { iniciais: 'VAN', cor: '#F91536', foto: '/assets/vendedores/vanessa.png', escuderia: 'Ferrari' },
}

/** Cores de equipe pra piloto novo (todas com bom contraste no fundo escuro e no claro). */
const PALETA = ['#E10600', '#229971', '#6692FF', '#FF87BC', '#C92D4B', '#52E252', '#B6BABD', '#FFD12E']

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function corEstavel(nome: string): string {
  let h = 0
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETA[h % PALETA.length]
}

export function perfilPiloto(nome: string, fotoCadastro?: string | null): PerfilPiloto {
  const limpo = nome.trim()
  const f1 = PERFIS_F1[limpo]
  if (f1) return { nome: limpo, ...f1 }
  const primeiro = semAcento(limpo.split(/\s+/)[0] ?? limpo)
  return {
    nome: limpo,
    iniciais: primeiro.slice(0, 3).toUpperCase(),
    cor: corEstavel(limpo),
    foto: fotoCadastro ?? undefined,
  }
}

/** Nomes (como estão no banco, sem repetir) de quem tem linha da função no mês. */
export function nomesComMeta(rows: ReadonlyArray<{ nome_colaborador: string | null; funcao: string | null }>, funcao: 'SDR' | 'Closer'): string[] {
  const vistos = new Map<string, string>()
  for (const r of rows) {
    if (r.funcao !== funcao || !r.nome_colaborador) continue
    const nome = r.nome_colaborador.trim()
    const chave = nome.toLowerCase()
    if (nome && !vistos.has(chave)) vistos.set(chave, nome)
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
