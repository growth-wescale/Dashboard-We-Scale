// Fotos aprovadas exclusivas da página Campanha de Metas.
// Não altera o cadastro compartilhado nem as imagens da TV/outras páginas.
const FOTOS: Record<string, string> = {
  'Paula Marinheiro': '/assets/campanha-ufc/paula.png',
  'Jéssica': '/assets/campanha-ufc/jessica.png',
  'Sarah Padilha': '/assets/campanha-ufc/sarah.png',
  'Thiago': '/assets/campanha-ufc/thiago.png',
  'Xayane': '/assets/campanha-ufc/xayane.png',
}

export function fotoCampanha(nome: string, fotoAtual?: string): string | undefined {
  return FOTOS[nome.trim()] ?? fotoAtual
}
