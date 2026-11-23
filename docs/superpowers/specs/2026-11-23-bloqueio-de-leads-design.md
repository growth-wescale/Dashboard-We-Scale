# Bloqueio de Leads — design

Data: 23/11/2026 · Pedido do Junior (a partir da Xay, SDR) · Supabase de Expansão + dashboard

## Por quê

Um lead sem perfil (3 negócios na Inpot desde abril, todos perdidos por "Fora do perfil (ICP)")
continua se cadastrando na LP, e cada conversão vira um negócio novo para a SDR. O suporte do RD
sugeriu filtrar a automação do RD Marketing por segmentação, mas desde 19/10/2026 quem cria o
negócio é a nossa distribuição (`distribuir-lead` → `distribuicao_processar`), alimentada por um
webhook de conversão sem filtro. O bloqueio tem que morar na distribuição.

Medido em 23/11: dos 2.019 negócios criados pela distribuição desde 19/10, 68 eram de lead já
perdido antes; em 13 o último motivo foi "Fora do perfil" ou "Dados inválidos".

## O que o Junior decidiu

- Bloqueio **só por e-mail** (telefone não).
- **Marcas escolhidas no bloqueio**, uma ou várias; dá para mudar depois.
- **Histórico de tudo**: bloqueio, alteração de marcas e desbloqueio, com quem fez, quando, em qual
  lead e as marcas antes e depois.
- **Aba própria "Bloqueio de Leads"**, liberável para qualquer tipo de acesso na tela de Acessos;
  começa só com o Administrador.

## Comportamento

1. Conversão de e-mail bloqueado para a marca da regra: **não cria negócio, não dispara COF e não
   conta no rodízio**. Fica no Registro de leads com o resultado novo **Bloqueado** e o motivo
   "e-mail bloqueado para <marca> desde DD/MM/AAAA (por <quem>)".
2. A checagem vem logo depois de achar a regra da marca e antes da trava de reenvio de 10 min, da
   régua de MQL e do resto. Vale também para a caixa reserva (mesma função) e para marca em sombra.
3. O RD Marketing continua registrando a conversão (não temos como impedir). Parar os e-mails do RD
   para a pessoa é desativar o lead no RD Marketing, como o suporte falou.
4. Desbloquear (tirar todas as marcas) faz a próxima conversão seguir o fluxo normal. Conversão
   "Bloqueada" não conta para a trava de reenvio de 10 min.

## Dados (Supabase de Expansão)

- `distribuicao_bloqueio`: estado atual, 1 linha por e-mail (minúsculo, sem espaço). `marcas` vazio
  = desbloqueado. Nunca apagada.
- `distribuicao_bloqueio_log`: append-only (trigger impede UPDATE/DELETE). Ação `bloqueio`
  (de nenhuma para alguma marca), `alteracao` (troca de marcas) ou `desbloqueio` (para nenhuma),
  com marcas antes/depois, motivo, autor (e-mail do login) e horário.
- Marca = `distribuicao_regra.marca` (nome interno; a tela mostra `marca_rd`, ex. Odonto Scale →
  Odonto Legacy).
- `distribuicao_bloqueio_salvar(email, marcas, motivo, autor, marcas_antes)`: única escrita; valida
  e-mail, marcas conhecidas e motivo (obrigatório em toda ação); recusa "nada mudou" e recusa (409) se
  o bloqueio mudou desde que a tela abriu (`marcas_antes` ≠ atual). Só `service_role`.
- `distribuicao_bloqueio_vigente(email, marca)`: usada por `distribuicao_processar`.
- Leitura pela tela: `vw_distribuicao_bloqueios`, `vw_distribuicao_bloqueio_log`, a RPC
  `distribuicao_lead_negocios(email)` (negócios do e-mail no RD CRM, de `deal_contatos` +
  `deal_snapshot`; RPC para a chave anon não baixar todos os contatos) e a
  `vw_distribuicao_atribuicoes` que já existe (conversões desde 16/10).

## Escrita autenticada

Edge Function `gravar-bloqueio-lead` (Expansão, `verify_jwt` desligado como `gravar-distribuicao`):
valida a sessão no Supabase de Marketing, exige `tem_permissao('aba.bloqueio-leads')` e conta sem
limite de marca (`minhas_permissoes()`, mesma regra do front) antes de chamar a RPC. Quem vê a aba
pode bloquear e desbloquear.

## Tela

Rota `/bloqueio-leads`, item "Bloqueio de Leads" no menu de Vendas, chave `aba.bloqueio-leads` no
catálogo (`ABAS`). Conteúdo:

- Botão **Bloquear e-mail**: e-mail, marcas (caixas de seleção, com "Marcar todas"), motivo. Ao
  digitar um e-mail conhecido, mostra onde ele já apareceu (conversões e negócios por marca); se o
  e-mail já está na lista, abre com as marcas atuais.
- **Lista**: lead, marcas bloqueadas, bloqueado desde/por, última alteração, tentativas barradas,
  negócios no CRM; ações Histórico, Editar, Desbloquear. Filtro por busca e situação.
- **Histórico de bloqueios** (todos os e-mails): quando, quem, lead, ação, mudança, motivo.
- **Histórico do lead** (painel): linha do tempo única com as conversões recebidas (e o resultado de
  cada uma), os negócios no RD CRM (etapa, status, motivo da perda) e as ações de bloqueio, em ordem.

Na aba Distribuição de Leads: resultado novo "Bloqueado" na legenda e no filtro do registro, e um
passo novo em "Como a distribuição funciona".

## Fora do escopo

- Bloqueio por telefone; bloqueio automático por motivo de perda; aviso no negócio de lead que já
  foi perdido antes (os três ficam como ideia).
- Blindagem das views contra a chave anon (mesma pendência da "Entrega 2" do controle de acessos:
  as views novas expõem e-mails como as `vw_distribuicao_*` que já existem).

## Abordagens consideradas

- **Lista manual por e-mail, com marcas (escolhida)**: exatamente o pedido; controle humano.
- Bloqueio automático por motivo de perda: sem decisão humana, prende quem mudou de situação.
- Só avisar no negócio novo: não poupa a SDR nem o MQL inflado.
