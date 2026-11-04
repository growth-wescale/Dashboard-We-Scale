import { fotoVendedor } from './fotosVendedores'

// Retratos específicos da Campanha; as duas novas vendedoras usam o mapa compartilhado.
const FOTOS: Record<string, string> = {
  'Bruna': '/assets/campanha-ufc/bruna.png',
  'Douglas': '/assets/campanha-ufc/douglas.png',
  'Paula Marinheiro': '/assets/campanha-ufc/paula.png',
  'Jéssica': '/assets/campanha-ufc/jessica.png',
  'Sarah Padilha': '/assets/campanha-ufc/sarah.png',
  'Thiago': '/assets/campanha-ufc/thiago.png',
  'Xayane': '/assets/campanha-ufc/xayane.png',
}

export function fotoCampanha(nome: string, fotoAtual?: string): string | undefined {
  return FOTOS[nome.trim()] ?? fotoVendedor(nome, fotoAtual)
}
