# Configuração das Metas — redesenho do fluxo de lançamento

Data: 30/09/2026 · Pedido e decisões: Junior · Substitui a tela dos Passos 0–6
do Hub de Metas (`2026-09-02-hub-configuracao-metas-design.md`, §4). O modelo
de dados, as versões imutáveis e a publicação (`gravar-meta` →
`publicar_meta_versao`) **não mudam**.

## 1. Por que refazer

Diagnóstico do fluxo atual (30/09, com a V1 de setembro no banco):

1. **"Começar do zero" cria um rascunho com 0 marcas** e nenhum passo permite
   adicionar marca — Taxas, Funil e Pessoas renderizam listas vazias.
2. **A V1 de setembro foi importada com todas as etapas `fixo`**, sem nenhuma
   taxa. "Nova versão a partir desta" abre o Passo 2 (Taxas), que só lista
   etapas `derivado` → "volte ao Passo 3" em todas as marcas.
3. **Ordem invertida:** Taxas (2) depende do modo escolhido no Funil (3), e o
   Funil fala a língua do motor (Fixo/Derivado/Desligado + "origem" num menu
   de 13 etapas).
4. **Sugestão "mês anterior" só lê taxa gravada.** Setembro não tem nenhuma,
   então outubro nasceria sem sugestão.
5. **Nada persiste antes de publicar** — recarregar a página perde tudo.
6. **Semanas é o 1º passo**, mas a distribuição semanal não tem nenhum leitor
   no dashboard (só `DB_Metas_Performance` alimenta as telas).

## 2. Decisões (Junior, 30/09)

| # | Decisão |
|---|---|
| C1 | Nome da tela e do menu: **Configuração das Metas** |
| C2 | Funil reverso **SQL → Diagnóstico → SAL → COF → Vendas**. Vendas é a âncora |
| C3 | **Ligações** fica fora da cadeia: o gestor escolhe conversão sobre o SQL (agendamento) ou número fixo |
| C4 | Cada etapa acima de Vendas: **conversão de referência**, **nova conversão** ou **número manual** (+ "sem meta nesta etapa" pra marca sem SDR) |
| C5 | Metas da marca em **inteiro arredondado pra cima, sem cascata**: cada etapa é calculada com a conversão exata a partir do valor EXATO da de baixo, e só o resultado é arredondado |
| C6 | Divisão por pessoa por **peso** (vários SDRs e Closers por marca). SDR leva Ligações, SQL, Diagnóstico, SAL; Closer leva COF, Vendas, Faturamento (mesma partição do espelho de hoje) |
| C7 | Distribuição semanal **manual como hoje**, no fim do fluxo, com um atalho opcional "preencher proporcional aos dias" |
| C8 | Rascunho salvo **no navegador** (localStorage), a cada alteração |
| C9 | Arquitetura: **painel de marcas + editor por marca** (não wizard linear nem planilha única) |

## 3. Fluxo

### 3.1 Tela inicial

- Seletor de mês.
- Mês sem versão e sem rascunho → cartão "Outubro 2026 ainda não tem meta" +
  **Configurar metas de outubro** (parte do mês anterior: marcas, taxa de
  franquia, conversões e pessoas vêm preenchidas; **vendas ficam em branco**)
  + link secundário "Começar em branco" (sem referência nenhuma).
- Mês com versões → lista (como hoje) com **Ativar** e **Criar revisão a
  partir desta**.
- Rascunho salvo → aviso "Configuração de outubro em andamento — X de Y marcas
  prontas" com **Continuar** e **Descartar**.

### 3.2 Montagem — 3 passos

Cabeçalho fixo: mês, "montando a V{n}", de onde partiu (mês anterior / V{k} /
em branco), "salvo neste navegador".

**1 · Marcas.** Resumo (vendas, faturamento, X/Y prontas) + card por marca com
status, vendas, faturamento e SQL. "Adicionar marca" (marcas de vendas de
`BRAND_LIST` fora do rascunho) e "Remover do mês" dentro do editor.

Status (derivado, nunca marcado à mão):

- **Não configurada** — vendas do mês não informadas.
- **Em configuração** — vendas informadas, mas há pendência.
- **Configurada** — sem pendência.

**Editor da marca** — três blocos, na ordem em que se pensa:

1. *Base do mês* — vendas previstas e taxa de franquia média (ticket), cada
   uma com o valor de referência ao lado ("setembro: 5 · usar"). Faturamento
   = vendas × ticket.
2. *Funil de metas* — de cima (SQL) pra baixo (Vendas, destacada como ponto de
   partida). Entre as etapas, o conector mostra a conversão usada e um
   seletor de 3 opções. Etapa manual vira ponto de partida pras de cima.
   Valor recalculado pisca. Ligações num bloco tracejado acima do SQL.
3. *Time da marca* — SDRs e Closers com peso, "dividir igualmente", meta de
   cada pessoa ao vivo.

Rodapé: "Voltar para marcas" e "Próxima marca →".

**2 · Semanas.** Dia de virada + tabela por pessoa (semanas nas colunas), com
meta do mês e quanto falta distribuir. Etapas distribuíveis como hoje: SDR →
Ligações e SQL; Closer → COF e Vendas. Atalho "preencher proporcional aos
dias". Não trava a publicação.

**3 · Revisar e publicar.** Tabela marcas × etapas, prévia por pessoa (o que o
dashboard vai mostrar), comparação com o mês anterior e com a versão ativa,
lista de pendências com link pra marca, nome/motivo, "ativar ao publicar".
Publicar exige **todas** as marcas do rascunho configuradas (marca sem meta no
mês sai do rascunho).

## 4. Regras de cálculo

Convenção de taxa: a conversão de uma etapa X é **X → etapa de baixo**
(`valor(baixo) / valor(X)`). Ligações: `SQL / Ligações`.

Resolução por marca, de baixo pra cima:

```
exato[Vendas] = vendas
para X em COF, SAL, Diagnóstico, SQL:
  manual      → exato[X] = valor digitado
  referência  → exato[X] = exato[baixo] / taxaReferência[X]
  nova        → exato[X] = exato[baixo] / taxaDigitada
  sem meta    → sem valor
meta[X] = ceil(exato[X])            (C5 — sem cascata)
Ligações: mesmo esquema, com baixo = SQL
faturamento = vendas × ticket
```

Etapa por conversão cuja de baixo está sem meta não calcula → pendência
("escolha número manual ou sem meta"). Marcar "sem meta" numa etapa leva
junto as de cima que não forem manuais.

**Referência.**

- Mês novo: versão **ativa** do mês anterior. Taxa de cada etapa = taxa
  gravada, se a etapa era derivada da de baixo; senão, a taxa implícita dos
  valores exatos (`exato(baixo)/exato(X)`) — é o caso de toda a V1 de
  setembro. Etapa desligada/ausente no mês anterior → começa "sem meta".
- Revisão (V2 a partir de V{k}): a própria V{k}. Etapas `fixo` de versão
  `origem='hub'` voltam como **manual** (foi escolha do gestor); de versão
  `importado`, como **referência** (o fixo era só o jeito de importar).
- Marca sem referência → conversões em branco (pendência até preencher).

**Pendências** (qualquer uma deixa a marca "em configuração"): ticket ≤ 0;
etapa sem taxa ou com taxa ≤ 0; manual sem valor; etapa por conversão acima
de etapa sem meta; nenhum Closer; nenhum SDR quando alguma etapa de SDR tem
meta; pesos de SDR ou de Closer ≠ 100%.

**Pessoa:** `meta(pessoa) = meta(marca) × peso/100`, sem arredondar (a soma bate
com a marca; o dashboard já mostra arredondado pra cima).

## 5. Persistência

Rascunho → `ConfigEtapa[]` (o formato que `publicar_meta_versao` já grava):

| Etapa no rascunho | `meta_marca_etapa` |
|---|---|
| Vendas | `fixo`, `valor_fixo = vendas` |
| referência | `derivado`, `etapa_origem = baixo`, `taxa`, `taxa_origem = 'mes_anterior'` |
| nova conversão | `derivado`, `etapa_origem = baixo`, `taxa`, `taxa_origem = 'manual'` |
| manual | `fixo`, `valor_fixo` |
| sem meta | `desligado` |

`taxa_origem = 'mes_anterior'` também cobre "referência = versão base" numa
revisão (a constraint do banco só aceita `mes_anterior|historico_crm|manual`).

O espelho (`linhas_espelho` → `DB_Metas_Performance`) é gerado a partir dos
valores **arredondados** (C5), pela mesma `gerarLinhasEspelho`. Recarregar a
versão depois dá os mesmos números: `derivado` volta como referência com a
taxa gravada, e `ceil(exato)` é determinístico.

Rascunho local: `localStorage['ws-config-metas:v1:<mes>']` com o rascunho, as
referências e a versão base. Leitura/escrita em try/catch; falha = segue sem
persistir.

## 6. Código

- `src/lib/configMetas.ts` (novo, puro, testado): tipos do rascunho,
  referência a partir de uma versão, resolução arredondada, pendências/status,
  conversão ↔ `ConfigEtapa[]`, prévia por pessoa, preenchimento proporcional.
- `src/lib/rascunhoMetas.ts` (novo): localStorage.
- `src/pages/HubMetas.tsx` reescrita: tela inicial + casca da montagem.
- `src/components/metas/`: `PainelMarcas`, `EditorMarca` (+ `FunilReverso`,
  `TimeMarca`), `PassoSemanas` e `PassoRevisarPublicar` reescritos.
  `PassoTaxas`, `PassoFunilMarca`, `PassoPessoas`, `PassoDistribuicaoSemanal`
  saem.
- Menu (`AppLayout`) e catálogo de permissões (`permissoes.ts`, só o rótulo;
  a chave `aba.metas` fica) passam a dizer "Configuração das Metas".
- `metasEngine.ts` intacto (continua usado pra ler versões e gerar o espelho).

## 7. Verificação

- `npm run build` (tsc -b) + `npx vitest run` fora do OneDrive.
- Testes do módulo novo cobrindo: referência a partir da V1 real de setembro
  (Inpot: COF→Vendas 47,2%), arredondamento sem cascata, manual como âncora
  intermediária, sem meta em cascata, pendências, ida-e-volta
  rascunho → `ConfigEtapa[]` → rascunho, espelho arredondado.
- Tela vista renderizada com dado real numa rota temporária sem login
  (removida antes do commit). **Nenhuma publicação de teste** — versão não
  pode ser apagada.

## 8. Fora de escopo

Meta de MQL; meta de SAL do Closer; Campanha de Metas lendo a distribuição
semanal; rascunho compartilhado entre computadores (no banco).
