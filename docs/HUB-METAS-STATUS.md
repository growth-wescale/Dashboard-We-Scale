# Hub de Configuração de Metas — status (pausado, retomar depois)

> **Leia este arquivo primeiro.** Ele existe pra você (ou eu, numa sessão
> futura) não precisar reconstruir o contexto do zero. Pra detalhe técnico
> linha a linha de cada tarefa — quem implementou, o que a revisão achou,
> cada correção — o registro completo está em
> `.superpowers/sdd/2026-09-02-hub-configuracao-metas/progress.md` (mesma
> pasta deste worktree; não vai pro git, é rascunho de execução).

**Pausado em**: 02/09/2026, por pedido direto do Junior — prioridade virou
"corrigir os cards da Corrida de Performance pra bater de verdade com a
lógica de bonificação" (trabalho novo, fora deste plano). O Hub **não foi
abandonado**, só adiado.

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

## 2. O que já está pronto (Tasks 1–8 de 18)

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

## 3. Próximo passo exato ao retomar

1. **Rodar a re-revisão da correção da Task 8** antes de qualquer coisa
   nova — foi aplicada mas nunca revisada (a sessão foi interrompida por
   outra prioridade no meio do caminho). Range: `c5ece80..ad234ce`.
2. Depois: Task 9 em diante (lista completa abaixo).

## 4. O que falta (Tasks 9–18)

| # | O que é |
|---|---|
| 9 | Hooks de escrita — `useSalvarMeta` (chama a Edge Function) + `useTaxaMesAnterior` (sugestão de taxa) |
| 10 | Página do Hub — casca, rota `/metas`, item de menu, Passo 0 (abrir/copiar mês) |
| 11 | Passo 1 — Semanas |
| 12 | Passo 2 — Taxas de conversão (sugestão do mês anterior) |
| 13 | Passo 3 — Funil por marca (fixo/derivado/desligado, cálculo ao vivo) |
| 14 | Passo 4 — Pessoas por marca (sem limite de quantidade) |
| 15 | Passo 5 — Distribuição semanal (manual, o sistema não rateia sozinho) |
| 16 | Passo 6 — Revisar e publicar |
| 17 | Semear setembro/2026 **pelo próprio Hub** (teste de aceitação da ferramenta) — ⚠️ **ver seção 5, os números mudaram** |
| 18 | Verificação final, checksum de regressão, PR |

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
