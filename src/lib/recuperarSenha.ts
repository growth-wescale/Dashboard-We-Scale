/**
 * Mensagem pra quem pediu o link de redefinir senha e o Supabase recusou.
 *
 * Conta inexistente NÃO é erro aqui: o Supabase responde sucesso mesmo assim, e
 * a tela mostra sempre a mesma confirmação, pra não revelar quem tem conta.
 * O que sobra é limite de envio (o SMTP padrão do Supabase manda poucos
 * e-mails por hora) e falha de rede.
 */
export function mensagemErroRecuperacao(erro: { message?: string; status?: number; code?: string }): string {
  const texto = `${erro.code ?? ''} ${erro.message ?? ''}`
  if (erro.status === 429 || /rate.?limit|security purposes|only request this after/i.test(texto)) {
    return 'Muitos pedidos de link agora. Espere alguns minutos e tente de novo.'
  }
  if (/fetch|network/i.test(texto)) {
    return 'Sem conexão com o servidor. Confira sua internet e tente de novo.'
  }
  return 'Não foi possível enviar o link agora. Tente de novo em instantes.'
}
