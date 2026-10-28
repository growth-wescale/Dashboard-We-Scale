// Texto da seção "Como a distribuição funciona" (aba Distribuição de Leads), na ordem em que cada
// conversão passa pelo processo. Os números vêm de distribuicao_config (vw_distribuicao_config),
// então mudar a configuração muda o texto. A regra em si mora no banco: distribuicao_processar
// (docs/sql/2026-10-16-distribuicao-leads.sql e 2026-10-28-distribuicao-reconversao.sql).

export interface ConfigDistribuicao { chave: string; valor: string }

export interface EtapaProcesso { titulo: string; itens: string[] }

function num(config: ConfigDistribuicao[], chave: string, padrao: number): number {
  const v = Number(config.find(c => c.chave === chave)?.valor)
  return Number.isFinite(v) && v > 0 ? v : padrao
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function etapasDoProcesso(config: ConfigDistribuicao[]): EtapaProcesso[] {
  const janela = num(config, 'janela_dedup_min', 10)
  const tentativas = num(config, 'retries_rd', 3)
  const silencio = num(config, 'alerta_silencio_horas', 6)
  return [
    {
      titulo: 'Chega a conversão',
      itens: [
        'O RD Marketing avisa a distribuição a cada conversão. Só entram os formulários de chatbot que têm regra (o identificador aparece no card de cada marca, por exemplo eletrovias_multistep). Os outros formulários e os eventos do CRM são ignorados.',
        'A mesma conversão chegando duas vezes (pelo caminho reserva ou por reenvio do RD) é ignorada.',
      ],
    },
    {
      titulo: `Bloqueio de reenvio (${plural(janela, 'minuto', 'minutos')})`,
      itens: [
        `Se o mesmo e-mail preencher o mesmo formulário da mesma marca de novo em menos de ${plural(janela, 'minuto', 'minutos')}, a conversão fica como Duplicado e não vira deal.`,
        'Formulário diferente, ou depois desse tempo, segue para os próximos passos.',
      ],
    },
    {
      titulo: 'Régua de MQL',
      itens: [
        'Cada marca tem um campo de capital e os valores que barram (estão no card da marca, com o histórico de versões). Valor barrado fica como Barrado e não vira deal.',
        'Campo vazio passa.',
      ],
    },
    {
      titulo: 'Lead que já tem deal aberto',
      itens: [
        'A distribuição procura deal aberto do lead em qualquer marca e qualquer funil (SDR, Closer, Prospecção Ativa…), pelo e-mail ou pelo telefone (DDD + últimos 8 dígitos, sem o +55).',
        'Se achar, o deal novo continua sendo criado no funil SDR da marca, mas vai para o SDR que já atendeu esse lead (o SDR do deal aberto mais recente). Closer nunca recebe por essa regra.',
        'O deal novo ganha uma anotação: "este MQL já tem deal aberto", com o link, o funil, a etapa, a marca e o responsável de cada deal aberto, e se foi identificado por E-mail, Telefone ou E-mail e Telefone.',
        'Se esse SDR estiver inativo, fora ou de férias, ou se o deal anterior não tiver SDR, o lead vai pelo rodízio normal e a anotação continua.',
      ],
    },
    {
      titulo: 'Quem recebe: rodízio pelo peso da meta',
      itens: [
        'O time da marca são os SDRs com peso na versão ativa da meta do mês (ou o time fixado na regra, quando houver). Só entra quem está ativo no cadastro, tem usuário no RD e não está marcado como fora.',
        'Recebe quem está mais abaixo da sua cota: recebidos − peso × (total + 1) ÷ 100. Empate: maior peso, depois ordem alfabética.',
        'A contagem recomeça quando uma versão de meta é ativada, na virada do mês e quando alguém do time sai ou volta. O rodízio vale dali em diante e nunca compensa o passado.',
        'Lead que foi para o SDR anterior (passo acima) entra na contagem desse SDR, se ele for do time da marca.',
      ],
    },
    {
      titulo: 'Ninguém disponível',
      itens: ['Se nenhum SDR do time pode receber, o deal vai para o responsável padrão da regra e chega aviso no Teams.'],
    },
    {
      titulo: 'Criação no RD',
      itens: [
        'O deal nasce no funil e na etapa da regra, com Marca, Fonte Macro Inbound, cidade, estado, UTMs e os campos extras da regra.',
        'Se o e-mail já tem contato no RD, o deal é ligado a esse contato. Só nasce contato novo para e-mail que o RD ainda não conhece.',
        'Depois do deal: a conversão da COF no RD Marketing (dispara o e-mail e a anotação da COF), e a nota e a tarefa da regra, quando a marca tem.',
      ],
    },
    {
      titulo: 'Quando o RD falha',
      itens: [
        `Limite de uso ou erro do RD: repete até ${plural(tentativas, 'vez', 'vezes')}. Sem resposta a tempo não repete, porque o RD pode ter criado o deal: fica como Erro, com o botão Reprocessar no registro.`,
        'Caminho reserva: cada conversão também é guardada no Supabase de Marketing. Se a principal não chegou, ela é repassada a cada 2 minutos, sem duplicar deal.',
      ],
    },
    {
      titulo: 'Alertas no Teams',
      itens: [
        `Marca ativa sem nenhum lead há mais de ${plural(silencio, 'hora', 'horas')}, em dia útil das 9h às 20h.`,
        'Erro ao criar deal, deal no responsável padrão, COF que não disparou, nota ou tarefa que não foi criada, e contato que não foi ligado.',
      ],
    },
  ]
}
