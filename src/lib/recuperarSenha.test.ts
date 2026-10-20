import { describe, expect, it } from 'vitest'
import { mensagemErroRecuperacao } from './recuperarSenha'

describe('mensagemErroRecuperacao', () => {
  it('limite de envio pelo status 429', () => {
    expect(mensagemErroRecuperacao({ status: 429, message: 'x' })).toMatch(/Espere alguns minutos/)
  })

  it('limite de envio pelo código ou texto do Supabase', () => {
    expect(mensagemErroRecuperacao({ code: 'over_email_send_rate_limit' })).toMatch(/Espere alguns minutos/)
    expect(mensagemErroRecuperacao({ message: 'For security purposes, you can only request this after 42 seconds.' }))
      .toMatch(/Espere alguns minutos/)
  })

  it('falha de rede', () => {
    expect(mensagemErroRecuperacao({ message: 'Failed to fetch' })).toMatch(/internet/)
  })

  it('qualquer outro erro cai na mensagem genérica', () => {
    expect(mensagemErroRecuperacao({ status: 500, message: 'Error sending recovery email' })).toMatch(/Não foi possível enviar/)
    expect(mensagemErroRecuperacao({})).toMatch(/Não foi possível enviar/)
  })
})
