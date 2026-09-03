# Hub de Configuração de Metas — status (mesclado e em produção)

> **Leia este arquivo primeiro.** Ele existe pra você (ou eu, numa sessão
> futura) não precisar reconstruir o contexto do zero. Pra detalhe técnico
> linha a linha de cada tarefa — quem implementou, o que a revisão achou,
> cada correção — o registro completo está em
> `.superpowers/sdd/2026-09-02-hub-configuracao-metas/progress.md` (mesma
> pasta deste worktree; não vai pro git, é rascunho de execução).

**Concluído em 03/09/2026.** 16 das 18 tarefas do plano executadas e
verificadas (Tasks 1-16). Task 17 (semear setembro/2026 pelo próprio Hub)
foi pulada de propósito — ver seção 8. Task 18 virou "mesclar rápido",
por pedido explícito do Junior pra testar direto em produção.

**⚠️ Setembro/2026 NÃO está nas tabelas novas do Hub.** Os dados reais e
corrigidos de setembro (25 vendas / R$981.385) só existem na tabela
espelho antiga (`DB_Metas_Performance`), inseridos direto por SQL. Se você
abrir `/metas`, selecionar setembro/2026 e publicar sem reproduzir esses
números exatamente, o Hub vai SOBRESCREVER a tabela espelho. **Teste o
Hub com outubro** (mês novo, sem risco) até decidir se vale pré-carregar
setembro nas tabelas novas.

---

## 1. Onde as coisas estão

| O quê | Onde |
|---|---|
| Branch de trabalho | `docs/hub-configuracao-metas` |
| Worktree (fora do OneDrive de propósito) | `~/ws-dashboard-worktree-hub-metas` |
| Design (o quê e por quê) | `docs/superpowers/specs/2026-09-02-hub-configuracao-metas-design.md` |
| Plano (as 18 tarefas, passo a passo) | `docs/superpowers/plans/2026-09-02-hub-configuracao-metas.md` |
| Registro de execução (técnico, completo) | `.superpowers/sdd/2026-09-02-hub-configuracao-metas/progress.md` |

Pra retomar: entrar no worktree, checar esse ledger, seguir a partir do
"próximo passo exato" da seção 3 abaixo.

## 2. O que já está pronto (Tasks 1–16 de 18)

Motor de cálculo **inteiro construído e testado** (26 testes, mais os 3
que a Task 4 corrigiu e outros — total do arquivo `metasEngine.test.ts`
sobe conforme as tarefas avançam):

1. **Schema** — as 7 tabelas `meta_*` já existem no Supabase Expansão, com
   RLS travada em leitura só (nem `anon` nem `authenticated` conseguem
   escrever — só a Edge Function, com `service_role`).
2. **Motor · tipos e semanas** — as 13 etapas do funil de metas, geração
   de semanas a partir do dia de virada escolhido.
3. **Motor · resolução do funil** — a peça central: cada etapa
   fixa/derivada/desligada, detecção de ciclo, resolução por fixpoint.
4. **Motor · detecção de gap** — mostra quando duas âncoras fixas (ex.:
   Ligações e Fechamento) implicam uma taxa diferente da que foi
   configurada entre elas.
5. **Motor · rateio por peso** — divide a meta da marca entre N pessoas
   (sem limite de 2), proporcional ao peso de cada uma.
6. **Motor · geração do espelho** — transforma o funil resolvido de cada
   marca nas linhas exatas que `DB_Metas_Performance` espera (SDR só
   preenche SQL/agendamento/reunião, Closer só preenche COF/financeira/
   qtd — nunca os dois ao mesmo tempo).
7. **Edge Function `gravar-meta`** — já implantada em produção
   (`verify_jwt: false`, CORS liberado, valida a sessão do usuário contra
   o Supabase de Marketing antes de gravar com `service_role` no de
   Expansão). Nunca foi testada de ponta a ponta com uma sessão real (não
   tem como gerar um token de sessão de verdade neste ambiente) — a Task 9
   vai ser a primeira chamadora real, prestar atenção aí.
8. **Hook `useMetaMes`** — lê o estado completo de um mês (semanas, funil
   por marca, pessoas, distribuição semanal) das 7 tabelas. **Corrigido
   uma vez** (erros de query descartados, sem listener de refresh, sem
   proteção contra resposta atrasada) — ⚠️ **a revisão dessa correção
   ainda não rodou**, ver seção 3.

## 3. Próximo passo exato

O Hub inteiro (Passos 0-6, tabelas, Edge Function) está pronto, buildado,
testado (165/165) e mesclado em `main` — deploy automático dispara no
merge do PR. Não tem "próximo passo de construção" — o que resta é uso
real:

1. Junior testa em produção (`/metas`), preferencialmente com **outubro**
   primeiro (ver aviso no topo sobre setembro).
2. Reportar ajustes encontrados — viram tasks novas, não reabertura deste
   plano.
3. Decidir se vale pré-carregar setembro/2026 nas tabelas novas do Hub
   (hoje só existe na tabela espelho, via SQL direto).
4. Construir a Corrida de Performance de verdade (pontuação real,
   substituindo o ranking por %-atingimento) — aprovado pelo Junior,
   nunca iniciado. Ver `docs/corrida-de-performance-logica.md`.

## 4. Tasks 9–18 — status final

| # | O que é | Status |
|---|---|---|
| 9 | Hooks de escrita — `useSalvarMeta` + `useTaxaMesAnterior` | ✅ feito |
| 10 | Página do Hub — casca, rota `/metas`, item de menu, Passo 0 | ✅ feito |
| 11 | Passo 1 — Semanas | ✅ feito |
| 12 | Passo 2 — Taxas de conversão | ✅ feito |
| 13 | Passo 3 — Funil por marca | ✅ feito |
| 14 | Passo 4 — Pessoas por marca | ✅ feito |
| 15 | Passo 5 — Distribuição semanal | ✅ feito (+ correção marca/função pós-revisão) |
| 16 | Passo 6 — Revisar e publicar | ✅ feito |
| 17 | Semear setembro/2026 pelo próprio Hub | ⏭️ pulada de propósito — ver seção 8 |
| 18 | Verificação final, PR | ✅ feito — este PR |

## 5. ⚠️ Importante: setembro já foi corrigido manualmente — a Task 17 precisa usar os números novos, não os da planilha original

Depois que a Task 17 foi planejada, o Junior pediu duas correções diretas
no banco (via SQL, fora do Hub — a ferramenta ainda não existia pra fazer
isso pela interface):

| Marca | Antes (planilha original) | Depois (pedido do Junior, 02/09) |
|---|---|---|
| Eletrovias · Jéssica | 4 vendas · R$ 159.600 | **6 vendas · R$ 239.400** |
| Lisô Laser | Jéssica, 1 venda · R$ 39.900 | **Bruna, 2 vendas · R$ 79.800** |

Total do mês mudou de **22 vendas / R$ 861.685** (o número que a Task 17
do plano original testa) para **25 vendas / R$ 981.385**.

Quando a Task 17 rodar de verdade pelo Hub, ela precisa reproduzir esses
números **já corrigidos**, não os originais da planilha `Metas 2026.xlsx`
— senão o `delete+insert` da publicação apaga a correção do Junior. A
tabela e o teste de aceitação em `docs/superpowers/plans/2026-09-02-hub-
configuracao-metas.md` §8/Task 17 ainda mostram os números **antigos**
(22 / R$ 861.685) — atualizar antes de rodar, ou lançar setembro com os
números certos direto na Task 17 e ajustar o teste de aceitação pra bater
com 25 / R$ 981.385.

## 6. Decisões importantes já tomadas (não redecidir)

- **Direção do motor**: flexível por etapa (fixo/derivado/desligado), não
  "tudo meta reversa" nem "tudo planilha antiga" — decisão do Junior.
- **Rateio**: por peso ajustável, sem limite de pessoas por marca.
- **Semanas**: o gerente define o dia de virada e distribui os números na
  mão — o sistema nunca rateia sozinho.
- **Taxas**: sugestão vem do mês anterior E do histórico do CRM: o
  gerente decide, nunca automático.
- **Sem controle de permissão por usuário ainda** (login do dash não está
  fortificado) — desenhado pra plugar depois, não é gap esquecido.
- **Escrita só pela Edge Function**, nunca pela anon key exposta (motivo:
  a anon key está no histórico do repo público).
- **A tabela antiga `DB_Metas_Performance` continua sendo o espelho** —
  Performance Detalhada, Visão Macro e Campanha de Metas continuam lendo
  dela sem mudança nenhuma.

## 7.5 Meta semanal por Closer — nova tabela real, fora do Hub

Antes de pausar de novo, o Junior pediu a meta semanal (achada na aba
Closer da planilha, "FECHAMENTO POR SEMANA") pra viabilizar Pole Position
e Troféu Senna sem esperar o Hub. Criada `meta_closer_semana` (mes_
referencia, nome_colaborador, semana_numero 1-5, meta_qtd_vendas), RLS
SELECT-only, dado real (não mock):

| Closer | Sem.1 | Sem.2 | Sem.3 | Sem.4 | Total |
|---|---|---|---|---|---|
| Douglas | 1 | 2 | 1 | 1 | 5 |
| Jéssica | 1 | 2 | 1 | 2 | 6 |
| Bruna | 1 | 1 | 2 | 2 | 6 |
| Aurélio Briano | 1 | 2 | 3 | 2 | 8 |

Jéssica e Bruna já refletem as correções da seção 5 (Eletrovias 6, Lisô
Laser movido pra Bruna) — a quebra semanal delas é nova, veio direto do
Junior, não da planilha original (que só tinha os totais antigos).

**O que NÃO foi feito ainda**: nenhuma tela lê essa tabela — ela só existe
no banco. A pontuação real da Corrida de Performance (Volume × Velocidade,
Pole Position calculado de verdade, etc.) continua pendente — o Junior
pediu pra voltar pro Hub antes de construir isso. Ver
`docs/corrida-de-performance-logica.md` pra lógica completa quando for
retomar.

## 7. Coisa nova que aconteceu enquanto o Hub estava pausado (fora deste plano)

- **"Metas por Marca"** (seção da Campanha de Metas) foi corrigida e já
  está em produção — parou de usar uma tabela mock que nunca existiu e
  passou a ler `DB_Metas_Performance` de verdade. PR #53, já mesclado.
  Não depende do Hub, não foi feito nesta branch.
- **A Corrida de Performance** (pontuação por volume × velocidade, doc
  `docs/corrida-de-performance-logica.md`) está sendo construída **agora**,
  antes do Hub — isso inverte a ordem original do meu design (que previa
  a Corrida depois do Hub, porque as "Voltas" iam usar as semanas que o
  Hub define). Como o Hub ainda não existe, a Corrida vai usar o
  calendário fixo de setembro que já está no código
  (`CampanhaMetas.tsx`), não `meta_semana`. **Quando o Hub for retomado e
  publicar o primeiro mês de verdade, vale reconsiderar se as "Voltas"
  devem passar a usar `meta_semana`** (era o plano original, D13 do spec)
  — ver `docs/superpowers/specs/2026-09-02-hub-configuracao-metas-design.md`
  §12.5.

## 8. Por que a Task 17 foi pulada

Setembro/2026 já tem dado real e corrigido em `DB_Metas_Performance`
(inserido por SQL direto, não pelo Hub — ver seção 5). Rodar a Task 17
como planejada (semear setembro clicando pelo próprio wizard) exigiria
reproduzir esses números exatos através da UI, e nenhum agente tem acesso
de login/dev-server pra fazer isso de forma confiável. Como o objetivo era
mesmo testar a ferramenta — e o Junior vai testar em produção pessoalmente
— pular esse passo e ir direto pro merge foi a troca certa: mais rápido,
sem risco de corromper o dado real de setembro por um seed malfeito.

**Recomendação**: testar o Hub lançando **outubro/2026** primeiro (mês
"limpo", sem dado legado pra proteger). Setembro só pelo Hub depois que
alguém decidir se vale pré-carregar os números certos nas tabelas novas
antes de publicar.
