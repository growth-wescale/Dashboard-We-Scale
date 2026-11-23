import { describe, expect, it } from 'vitest'
import {
  acaoDaMudanca, diffMarcas, emailValido, filtrarBloqueios, marcasDoBloqueio, montarLinhaDoTempoLead,
  normalizarEmail, resumoLog, resumoOndeApareceu, rotuloStatusNegocio, textoMarcas,
  type BloqueioLogRow, type BloqueioRow, type ConversaoLead, type NegocioLeadRow,
} from './bloqueio'

const rotulo = (m: string) => ({ 'Odonto Scale': 'Odonto Legacy', 'We Scale': 'Scale Partner' } as Record<string, string>)[m] ?? m

function bloqueio(p: Partial<BloqueioRow>): BloqueioRow {
  return {
    email: 'a@b.co', marcas: ['Inpot'], bloqueado: true, motivo: 'x', criado_em: '2026-11-23T10:00:00Z', criado_por: 'j@w.com',
    atualizado_em: '2026-11-23T10:00:00Z', atualizado_por: 'j@w.com', bloqueado_desde: '2026-11-23T10:00:00Z', bloqueado_por: 'j@w.com',
    tentativas_bloqueadas: 0, ultima_tentativa_bloqueada: null, conversoes: 0, ultima_conversao: null, negocios_crm: 0, nome: null, ...p,
  }
}

function log(p: Partial<BloqueioLogRow>): BloqueioLogRow {
  return { id: 1, email: 'a@b.co', acao: 'bloqueio', marcas_antes: [], marcas_depois: ['Inpot'], motivo: 'sem perfil', autor: 'j@w.com', em: '2026-11-23T10:00:00Z', ...p }
}

function negocio(p: Partial<NegocioLeadRow>): NegocioLeadRow {
  return {
    email: 'a@b.co', id_deal: 'd1', nome_contato: 'Fulano', marca: 'Inpot', nome_funil: 'SDR', nome_etapa: 'Tentando Contato', status: 'lost',
    responsavel: 'Xayane', criado_em: '2026-04-13T06:37:50Z', fechado_em: '2026-07-06T19:13:04Z', deleted_at: null, motivo_perda: 'Fora do perfil (ICP)', ...p,
  }
}

function conversao(p: Partial<ConversaoLead>): ConversaoLead {
  return { id: 1, recebido_em: '2026-11-23T11:32:59Z', marca: 'Inpot', resultado: 'atribuido', motivo: null, nome_sdr: 'Xayane', id_deal: null, lead_nome: 'Fulano', ...p }
}

describe('e-mail', () => {
  it('normaliza com minúscula e sem espaço', () => {
    expect(normalizarEmail('  Fulano@Gmail.COM ')).toBe('fulano@gmail.com')
  })
  it('valida igual ao banco', () => {
    expect(emailValido(' Fulano@Gmail.com ')).toBe(true)
    expect(emailValido('fulano@gmail')).toBe(false)
    expect(emailValido('ful ano@gmail.com')).toBe(false)
    expect(emailValido('')).toBe(false)
  })
})

describe('acaoDaMudanca', () => {
  it('de nenhuma para alguma é bloqueio', () => expect(acaoDaMudanca([], ['Inpot'])).toBe('bloqueio'))
  it('para nenhuma é desbloqueio', () => expect(acaoDaMudanca(['Inpot'], [])).toBe('desbloqueio'))
  it('troca de marcas é alteração', () => expect(acaoDaMudanca(['Inpot'], ['Inpot', 'Viva'])).toBe('alteracao'))
  it('mesmo conjunto (em outra ordem) não muda nada', () => {
    expect(acaoDaMudanca(['Viva', 'Inpot'], ['Inpot', 'Viva'])).toBeNull()
    expect(acaoDaMudanca([], [])).toBeNull()
  })
})

describe('diffMarcas', () => {
  it('separa o que entrou e o que saiu', () => {
    expect(diffMarcas(['Inpot', 'Viva'], ['Viva', 'B2Case'])).toEqual({ adicionadas: ['B2Case'], removidas: ['Inpot'] })
  })
})

describe('textoMarcas', () => {
  const todas = ['B2Case', 'Inpot', 'Odonto Scale']
  it('todas as marcas', () => expect(textoMarcas(['Odonto Scale', 'B2Case', 'Inpot'], todas, rotulo)).toBe('Todas as marcas'))
  it('nenhuma', () => expect(textoMarcas([], todas, rotulo)).toBe('Nenhuma'))
  it('lista com rótulo do RD', () => expect(textoMarcas(['Odonto Scale', 'Inpot'], todas, rotulo)).toBe('Inpot, Odonto Legacy'))
})

describe('resumoLog', () => {
  it('bloqueio', () => expect(resumoLog(log({}), rotulo)).toBe('Bloqueou em Inpot'))
  it('alteração', () => expect(resumoLog(log({ acao: 'alteracao', marcas_antes: ['Inpot'], marcas_depois: ['Odonto Scale'] }), rotulo)).toBe('Incluiu Odonto Legacy · Tirou Inpot'))
  it('desbloqueio', () => expect(resumoLog(log({ acao: 'desbloqueio', marcas_antes: ['Inpot', 'We Scale'], marcas_depois: [] }), rotulo)).toBe('Desbloqueou (estava em Inpot, Scale Partner)'))
})

describe('filtrarBloqueios', () => {
  const rows = [
    bloqueio({ email: 'edival@gmail.com', nome: 'Edivaldo Mota' }),
    bloqueio({ email: 'outro@x.com', nome: 'João', marcas: [], bloqueado: false }),
  ]
  it('por situação', () => {
    expect(filtrarBloqueios(rows, { busca: '', situacao: 'bloqueados' }).map(r => r.email)).toEqual(['edival@gmail.com'])
    expect(filtrarBloqueios(rows, { busca: '', situacao: 'desbloqueados' }).map(r => r.email)).toEqual(['outro@x.com'])
    expect(filtrarBloqueios(rows, { busca: '', situacao: 'todos' })).toHaveLength(2)
  })
  it('busca por e-mail ou nome, sem acento e sem caixa', () => {
    expect(filtrarBloqueios(rows, { busca: 'JOAO', situacao: 'todos' }).map(r => r.email)).toEqual(['outro@x.com'])
    expect(filtrarBloqueios(rows, { busca: 'edival@', situacao: 'todos' }).map(r => r.email)).toEqual(['edival@gmail.com'])
  })
})

describe('montarLinhaDoTempoLead', () => {
  it('junta tudo em ordem decrescente e a conversão absorve o negócio que criou', () => {
    const itens = montarLinhaDoTempoLead(
      [conversao({ id: 7, id_deal: 'd3', recebido_em: '2026-11-23T11:32:59Z' }), conversao({ id: 9, resultado: 'bloqueado', recebido_em: '2026-11-25T09:00:00Z' })],
      [negocio({ id_deal: 'd1', criado_em: '2026-04-13T06:37:50Z' }), negocio({ id_deal: 'd3', criado_em: '2026-11-23T11:33:01Z' })],
      [log({ em: '2026-11-24T12:00:00Z' })],
    )
    expect(itens.map(i => i.tipo)).toEqual(['conversao', 'bloqueio', 'conversao', 'negocio'])
    const absorveu = itens[2]
    expect(absorveu.tipo === 'conversao' && absorveu.negocio?.id_deal).toBe('d3')
    expect(itens[3].tipo === 'negocio' && itens[3].negocio.id_deal).toBe('d1')
  })
  it('negócio sem data vai para o fim', () => {
    const itens = montarLinhaDoTempoLead([], [negocio({ id_deal: 'x', criado_em: null, fechado_em: null }), negocio({ id_deal: 'y' })], [])
    expect(itens.map(i => (i.tipo === 'negocio' ? i.negocio.id_deal : ''))).toEqual(['y', 'x'])
  })
})

describe('rotuloStatusNegocio', () => {
  it('traduz o status do espelho', () => {
    expect(rotuloStatusNegocio('ongoing', null)).toBe('Em andamento')
    expect(rotuloStatusNegocio('open', null)).toBe('Em andamento')
    expect(rotuloStatusNegocio('won', null)).toBe('Ganho')
    expect(rotuloStatusNegocio('lost', null)).toBe('Perdido')
    expect(rotuloStatusNegocio('lost', '2026-10-01T00:00:00Z')).toBe('Excluído no RD')
    expect(rotuloStatusNegocio(null, null)).toBe('—')
  })
})

describe('marcasDoBloqueio', () => {
  it('só regras vigentes, sem as de teste, com o rótulo do RD, em ordem de rótulo', () => {
    const r = marcasDoBloqueio([
      { marca: 'Odonto Scale', marca_rd: 'Odonto Legacy', vigente_ate: null },
      { marca: 'Inpot', marca_rd: 'Inpot', vigente_ate: null },
      { marca: 'Inpot', marca_rd: 'Inpot', vigente_ate: '2026-10-19T00:00:00Z' },
      { marca: 'Teste', marca_rd: 'Teste', vigente_ate: null },
      { marca: 'Teste-erro', marca_rd: 'Marca Inexistente', vigente_ate: null },
    ])
    expect(r).toEqual([{ marca: 'Inpot', rotulo: 'Inpot' }, { marca: 'Odonto Scale', rotulo: 'Odonto Legacy' }])
  })
})

describe('resumoOndeApareceu', () => {
  it('conta conversões e negócios por marca (rótulo do RD)', () => {
    const r = resumoOndeApareceu(
      [conversao({ marca: 'Odonto Scale' }), conversao({ marca: 'Inpot' })],
      [negocio({ marca: 'Inpot', id_deal: '1' }), negocio({ marca: 'Inpot', id_deal: '2' }), negocio({ marca: 'Odonto Legacy', id_deal: '3' })],
      rotulo,
    )
    expect(r).toEqual([{ rotulo: 'Inpot', conversoes: 1, negocios: 2 }, { rotulo: 'Odonto Legacy', conversoes: 1, negocios: 1 }])
  })
})
