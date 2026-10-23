# Migração dos funis de marca para SDR/Closer — análise prévia

Data: 21/10/2026 · Fonte: Supabase de Expansão (`cygxmduuwlwfbodfrlkr`), API do RD CRM (token do Vault via `pg_net`) e código do dashboard. Nada foi alterado: só leitura.

Pedido do Junior: levar todos os deals dos funis **Inpot, Lisô Laser, Get it, Rota's, Odonto Legacy e Oral Unic** para os funis **SDR** e **Closer**, conforme a marca de cada um, sem perder dado, mantendo o histórico de etapas e **sem inflar as etapas do dashboard**.

---

## 0. Resumo

A migração é viável, mas se for feita "só movendo no RD" o dashboard muda em três lugares, e nenhum deles é bug: é o desenho atual.

1. **Histórico retroativo entra inteiro.** A matview usa o funil do *snapshot* para todos os ciclos do deal (`COALESCE(s_funil, nome_funil)`). Deal que passa a estar no SDR traz com ele todos os eventos antigos no funil de marca (desde set/2025), que viram passagens nos meses em que aconteceram. Meses já reportados mudam (inclusive set/26: a Inpot ganharia +24 SQL, +28 SAL, +11 COF só do trabalho da Raissa dentro do funil Inpot).
2. **Pico no dia da migração.** O RD grava a troca de funil como **entrada nova no histórico de etapas**. O espelho transforma isso num evento `mudanca_etapa` "lateral" (ex.: `Diagnóstico -> Diagnóstico (1 dia)`) datado da migração. Em Passagens é +1 por deal movido no mês; em Deals únicos, +1 para cada deal que ainda não tinha passado nessa etapa no mês. Provado com o deal `6ace137e…` (Odonto Legacy → Closer em 16/10).
3. **Odonto Legacy tem regra própria no código** (SQL conta só na "Reunião Agendada" do funil Legacy; a do Closer **não** conta para essa marca). Depois da migração, todo SQL do Legacy sumiria do funil até o código ser invertido.

Os três têm solução conhecida (seção 5). O que trava de verdade está no RD: **661 dos 759 deals abertos são "Novos Leads" dormentes de 2025 sem Marca, Fonte Macro, Cidade e Estado** (Rota's 469, Get it 131, Lisô 61), e o RD recusa qualquer `PUT` com campo obrigatório vazio. E a cadência do SDR (`inclui_existentes`) pegaria todos eles.

---

## 1. O que existe hoje (deal_snapshot, sem excluídos)

| Funil | Abertos | Perdidos | Ganhos | Observação |
|---|---|---|---|---|
| Rota's | **469** | 28 | 1 | 100% em "Novos Leads", dono Brunno, criados set–dez/2025, todos com última atualização em 28/04/2026. Marca saiu da We Scale |
| Get it | **131** | 9 | 0 | 100% em "Novos Leads", dona Jéssica, criados set–nov/2025, última atualização fev/2026. Marca saiu da We Scale |
| Lisô Laser | **61** | 228 | 3 | 100% em "Novos Leads", Brunno/Xayane, criados set/2025–jan/2026 (+1 de set/26). Sem Marca no RD |
| Inpot | **6** | 837 | 18 | 3 Novos Leads + 3 Tentando Contato (Xayane, Daniel Giovannetti, Brunno). Funil usado em set/26 pela Raissa (resgate: 118 reaberturas, 273 trocas de dono) |
| Odonto Legacy | **92** | 842 (+21 "Odonto Scale") | 10 (+2) | Sarah 91, Thaina 1. Tentando 50 · Contato Efetivo 20 · Conexão 16 · Interesse 2 · Reunião Agendada 2 · SAL 1 · No Show 1. **Já está no dashboard** (allowlist). 526 tarefas abertas em 81 deals, 70 execuções de cadência ativas |
| Oral Unic | 0 | 45 | 2 | Só histórico |

Total aberto: **759**. Fechado: ~2.080 (Inpot 855, Legacy 875, Lisô 231, Oral Unic 47, Rota's 29, Get it 9).

Marca no filtro do dashboard: `BRAND_LIST` não tem Get it nem Rota's. Mesmo migrados, esses deals ficam invisíveis no Consolidado (o filtro exclui marca fora da lista).

---

## 2. Como o dashboard reage (banco)

### 2.1 Allowlist por nome do funil
`vw_funil_vendas` só aceita `nome_funil IN ('SDR','Closer','Prospecção Ativa','Odonto Scale','Odonto Legacy')` ou `id_funil` = Scale Partner. Inpot, Lisô, Oral Unic, Get it e Rota's estão **fora inteiros** hoje. Odonto Legacy está dentro.

### 2.2 O funil do deal é o do snapshot, para todos os ciclos
`mv_deal_ciclo_enriquecido`: `COALESCE(s_funil, nome_funil) AS nome_funil`. Ou seja, quando o snapshot disser SDR, **todos** os ciclos do deal (inclusive os perdidos em 2025 no funil Inpot) passam a `nome_funil = 'SDR'` e entram no dashboard. Hoje só 2 ciclos em 10.928 estão no dashboard por esse motivo (medido) — porque quase ninguém foi movido de funil depois de perdido.

Os eventos antigos têm nome de etapa que `etapa_canonica` já traduz ("Novos Leads" → Novo MQL, "Tentando contato (Cadência)" → Tentando Contato, "Documentação" → Pré-Contrato…). Então o histórico vira passagem **no mês em que aconteceu**.

**Tamanho do efeito**, só com os deals **abertos** (sem Odonto Legacy, que já conta):

| Mês | Novo MQL retroativo | de onde |
|---|---|---|
| 2025-09 | +233 | Rota's 190 · Get it 38 · Lisô 5 |
| 2025-10 | +255 | Rota's 152 · Get it 72 · Lisô 31 |
| 2025-11 | +152 | Rota's 122 · Get it 21 · Lisô 9 |
| 2025-12 / 2026-01 | +7 / +13 | Rota's 5 · Lisô 2 / Lisô 13 |

Sem Get it e Rota's, sobra ~70 (Lisô + Inpot), em meses de 2025.

Se os **fechados** também forem movidos, entra tudo: só o funil Inpot em 2025-09 traz 247 MQL, 34 SQL, 11 SAL, 9 COF, 14 Pré-Contrato ganhos; e **set/2026** ganha Inpot 44 MQL, 123 Tentando Contato, 24 SQL, 28 SAL, 11 COF, 2 Comitê (resgate da Raissa, 17–24/09, dentro do funil Inpot). O RMP de setembro mudaria.

Nuance: "Reunião Agendada SQL" nos funis de marca tem `id_etapa` próprio. Os modos por evento (Performance, cards da Performance) só contam SQL nas etapas do Closer/Scale Partner (`idsEtapaObrigatoria`), então o SQL histórico desses funis **não** contaria, mas Diagnóstico/SAL/COF contariam — o funil de 2025 ficaria com Diagnóstico > SQL. Se o histórico for desejado, basta incluir os 5 ids legados na lista (não há duplicação de handoff nesses funis).

### 2.3 O pico do dia da migração
`processar_deal_evento` não grava etapa para as origens `api_sync`/`api_espelho_edge` (as únicas vivas desde 17/08): a etapa vem de `registrar_stage_history`, que lê `deal_stage_histories` do RD. E o RD **registra a troca de funil como entrada nova** nesse histórico:

```
deal 6ace137efe506e002305cff2 (Odonto Legacy → Closer, 16/10 09:10)
  Odonto Scale / Diagnóstico          13/10 16:03 → 16/10 09:10
  Closer       / Diagnóstico (1 dia)  16/10 09:10 → (aberto)
```

Resultado no banco: 1 `mudanca_funil` + 1 `mudanca_etapa` lateral (`Diagnóstico -> Diagnóstico (1 dia)`) por deal, datados da migração. Dos movimentos de funil desde 01/08 feitos via sync/espelho, 90%+ têm esse evento lateral; os que não têm são os do backfill de 18/08, que gravou só o `mudanca_funil` sem reler o histórico.

Efeito por modo:
- **Performance (Passagens)**: +1 por deal movido, no mês da migração, na etapa de destino. Com os 759: Novo MQL +664, Tentando Contato +53, Contato Efetivo +20, Conexão +16, SQL (Closer) +2, SAL +1…
- **Performance (Deals únicos)**: +1 só para deal que ainda não tinha passagem nessa etapa no mês. Para o Legacy (92, quase todos criados/movidos em outubro) o efeito é pequeno; para os dormentes de 2025 é +1 cada.
- **Datas da linha** (`data_novo_mql` etc.): são `min()` por etapa, **não mudam**. Safra ("Deals criados no período") e Aging seguem nas datas originais de 2025.
- **Atual**: mostra os deals onde estão. Isso é verdade, não inflação: 664 "Novo MQL" abertos no SDR apareceriam porque **estariam** lá.

**Mitigação que já existe na casa**: `deal_eventos_excluidos_manualmente` (407 linhas; usada em 18/08 para anular a automação de marketing que devolveu deals a "Novo MQL"). `registrar_stage_history` consulta essa tabela e **nunca recria** evento registrado nela. Procedimento: depois do sync, apagar os `mudanca_etapa` laterais da janela da migração (mesma etapa canônica antes e depois, mesmo instante do `mudanca_funil`) e registrá-los lá com motivo. O `mudanca_funil` fica, e a Linha do Tempo continua mostrando "Mudou de funil".

### 2.4 Regras do Odonto Legacy no código que precisam virar
- `idsEtapaObrigatoria(stage, marca)` em `src/lib/metrics.ts`: para marca Odonto Legacy, SQL conta **só** na etapa `68b84341646c55001ed64e53` do funil Legacy, e a do Closer não conta. Depois da migração: os 2 deals em "Reunião Agendada" caem fora do balde no Atual, e **todo SQL futuro do Legacy** (Sarah agendando no SDR → Closer) deixa de contar. Tem que passar a aceitar Closer + a etapa Legacy (histórico).
- `ETAPAS_AUSENTES_POR_MARCA['Odonto Scale'] = ['Comitê']`: deal Legacy no Closer passa por Comitê; remover.
- Fallback de marca por `id_funil` do Legacy em `vw_funil_vendas`/`vw_funil_etapas_v2`: inócuo (os 92 abertos têm Marca), pode ficar.
- Cadência "Odonto Legacy — Tentativa de Contato" (id 3) e a regra de distribuição do Legacy apontam para o funil antigo (seção 3).

### 2.5 O que **não** muda
- `vw_deal_origem_comercial` (Inbound × Prospecção Ativa): só olha `nome_funil = 'Prospecção Ativa'`.
- Trava de venda, ciclos (perda/retomada), motivos de perda, `data_*` por etapa.
- Eleição de SDR/Closer: camada dos eventos legados sai da ordem da etapa canônica, já funciona assim hoje para o Legacy.
- Tarefas, anotações, produtos, contatos, valores: são do deal, não do funil.
- Nada é apagado: `deal_eventos` é append-only e `deal_stage_historico` guarda o histórico cru do RD. O único jeito de "perder" dado no dashboard é deal sem Marca (regra "deal sem marca é invisível").

---

## 3. Efeitos no RD e nas automações

### 3.1 Campos obrigatórios (API `custom_fields`, 21/10)

| Campo | Obrigatório em |
|---|---|
| Marca, Cidade, Estado | sempre |
| Fonte Macro | todas as etapas de SDR, Closer, Prospecção Ativa e Odonto Legacy |
| Canal de Conexão | SDR: Conexão, Reunião Agendada SQL, No Show (e as da Prospecção Ativa) |
| Motivo no-show | SDR/PA: No Show |
| Closer responsável | todas as etapas do Closer (e Reunião Agendada/Diagnóstico/SAL/Oportunidade/Documentação do Legacy) |
| Temperatura da negociação | Closer: SAL, COF, Comitê, Pré-Contrato |
| Data de assinatura da COF, Previsão de fechamento | Closer: COF, Comitê, Pré-Contrato |

O que falta nos abertos:

| Grupo | n | Falta |
|---|---|---|
| Rota's / Get it / Lisô "Novos Leads" | 661 | Marca, Fonte Macro, Cidade, Estado (o payload nem tem as chaves) |
| Inpot | 6 | Fonte Macro (6), Marca/Cidade/Estado (2) |
| Legacy → SDR/Conexão | 16 | Canal de Conexão (11) |
| Legacy → SDR/No Show | 1 | Canal de Conexão, Motivo no-show |
| Legacy → Closer/Reunião Agendada SQL | 2 | nada (Closer responsável preenchido) |
| Legacy → Closer/SAL | 1 | Temperatura da negociação |

`PUT` de custom fields faz merge, então os valores podem ir no **mesmo** `PUT` da troca de etapa. Mas alguém tem que decidir os valores (Fonte Macro dos dormentes = "Resgate"? Cidade/Estado = "a"?).

### 3.2 Cadência do SDR pega tudo que entrar
Cadência 6 "SDR - Tentativa de Contato (21 dias)": `inclui_existentes`, etapas Novo MQL/Tentando/Contato Efetivo/Interesse Reunião, marcas B2Case, Inpot, Liso Laser, Oral Unic, Eletrovias, Viva, IDA, 103 passos, `encerrar_tarefas`, e **move o deal de Novo MQL para Tentando Contato no disparo** (mais um evento de etapa). Todo deal migrado com essas marcas entra: 661 dormentes × cadência = milhares de tarefas para os SDRs numa manhã.

**Odonto Legacy não está na lista de marcas.** Os 92 deals sairiam da cadência 3 (presa ao funil Legacy; `encerrar_tarefas` = true fecha as 526 tarefas abertas) e não entrariam em nenhuma. Antes de mover: incluir "Odonto Legacy" na cadência 6 (ou apontar a 3 para o SDR com filtro de marca) e decidir o que fazer com as execuções em curso.

### 3.3 Automações n8n por webhook do RD
`closer_reuniao_agendada` dispara na "Reunião Agendada SQL" do Closer (2 deals do Legacy, ambos com Closer responsável preenchido → troca de dono para o Closer do campo); `no_show_sdr_historico` no No Show (1 deal). Volume baixo. O risco é o **disjuntor de webhooks** receber centenas de updates em minutos: migrar em lotes, fora do horário.

### 3.4 Distribuição de leads e RD Marketing
A regra vigente do Odonto Legacy (`distribuicao_regra`, versão 2, `ativo`) cria deal em **"Odonto Scale / Novos Leads"**. Sem publicar uma versão nova apontando para SDR / Novo MQL no mesmo momento, lead novo do Legacy continua caindo no funil velho. A automação antiga "OdontoScale > CRM (Limpo)" (LP antiga, pendência da seção 8 do CLAUDE.md) também.

### 3.5 Sync e carga
`wf_5` absorve 30 deals a cada 5 min; o `espelho_rd_edge` o resto, em lotes de 25 (~20 s cada, respeita 429). 759 deals ≈ 15–20 min; 2.800 ≈ 1 h. Matview refaz a cada 2 min. Não há risco de perda: o que o sync não pegar numa rodada pega na próxima.

### 3.6 Dono, SLA, automações nativas
- Dono no SDR deve ser SDR ativo. Hoje: Get it = Jéssica (Closer), Rota's/Lisô = Brunno, Inpot = Daniel Giovannetti (fora do cadastro). Decidir no mesmo `PUT` (`user_id`).
- "Tempo na etapa"/SLA do RD reinicia na migração (cosmético).
- Automações nativas do RD (Configurações → Automações) não têm API: conferir à mão se existe gatilho nas etapas do SDR/Closer antes de mover em massa.

### 3.7 Como executar a escrita
`PUT /api/v1/deals/:id` com `deal_stage_id` na raiz (memória `rd-api-criar-deal-e-webhook-mkt`). `pg_net` não tem PUT: mesmo padrão da `transferir-responsavel` (tabela-plano, backup do estado anterior, `PUT` + `GET` de confirmação, lotes ≤ 55). **Testar antes com 1 deal no "Funil de teste"** para confirmar que a API aceita etapa de outro funil, como o RD grava o histórico e o que o n8n dispara.

Deals fechados: não foi testado se o RD aceita mover deal ganho/perdido via API. Se o objetivo for apagar os funis antigos, eles precisam estar vazios.

---

## 4. Mapeamento de etapas

| Funil de marca (Inpot, Lisô, Oral Unic, Get it, Rota's) | Destino |
|---|---|
| Novos Leads | SDR / Novo MQL |
| Tentando contato (Cadência) | SDR / Tentando Contato |
| No Show | SDR / No Show |
| Reunião Agendada SQL | Closer / Reunião Agendada SQL |
| Diagnóstico | Closer / Diagnóstico (1 dia) |
| Negociação SAL | Closer / Negociação SAL (7 dias) |
| Oportunidade COF | Closer / Oportunidade COF (7 dias) |
| Comitê | Closer / Comitê (5 dias) |
| Pré-Contrato enviado | Closer / Pré Contrato (5 dias) |

| Odonto Legacy | Destino |
|---|---|
| Novos Leads · Tentando Contato · Contato Efetivo · Interesse Reunião · Conexão · No Show | SDR, mesma etapa |
| Reunião Agendada | Closer / Reunião Agendada SQL |
| Diagnóstico · Negociação SAL | Closer, mesma etapa |
| Oportunidade | Closer / Oportunidade COF |
| Documentação | Closer / Pré Contrato (o catálogo já trata "Documentação" como Pré-Contrato) |

---

## 5. Decisões que só o Junior pode tomar

1. **Escopo**: só os 759 abertos, ou também os ~2.080 fechados (histórico)?
2. **Rota's e Get it** (600 "Novos Leads" de 2025, marcas que saíram): mover, dar perda em massa no funil antigo, ou deixar onde estão?
3. **Lisô 61 + Inpot 3 "Novos Leads" de 2025**: resgate de verdade (entram na cadência, SDR liga) ou perda?
4. **Histórico no dashboard**: aceitar que meses passados mudem (inclusive set/26) ou isolar? Isolar = trocar na matview o funil de ciclo fechado para o do **próprio** ciclo (`CASE WHEN ciclo = ciclo_max THEN s_funil ELSE nome_funil END`), o que hoje mexe em 2 ciclos de 10.928.
5. **Pico da migração**: anular os eventos laterais via `deal_eventos_excluidos_manualmente` (recomendado) ou deixar e explicar?
6. **Cadência**: Odonto Legacy entra na cadência do SDR? Os dormentes entram na cadência (se forem migrados)?
7. **Valores** para Marca/Fonte Macro/Cidade/Estado/Canal de Conexão dos deals que não têm.
8. **Funis antigos no RD depois**: esconder, apagar (exige vazios) ou manter para histórico?

---

## 6. Ordem proposta de execução (depois das decisões)

1. **Código do dashboard, antes de mover** (1 PR): `idsEtapaObrigatoria` aceita Closer + etapa Legacy; remover `Comitê` de `ETAPAS_AUSENTES_POR_MARCA`; se o histórico for desejado, incluir os ids de "Reunião Agendada SQL" dos funis de marca; se for isolado, a mudança na matview com checksum antes/depois.
2. **Cadência e distribuição**: marca Odonto Legacy na cadência 6 (e encerrar a 3 de forma controlada); versão nova da regra de distribuição do Legacy apontando SDR / Novo MQL; conferir automações nativas do RD.
3. **Plano e backup**: tabela-plano (deal, etapa destino, dono destino, campos a preencher), backup de `deal_snapshot` + `deal_eventos` dos deals envolvidos, Edge Function `mover-funil` no padrão da `transferir-responsavel`.
4. **Teste com 1 deal** no "Funil de teste": API, histórico do RD, webhook/n8n, sync, matview.
5. **Migração em lotes** (Legacy primeiro, depois Inpot/Lisô; dormentes só se decidido), fora do horário comercial, acompanhando `sync_execucao`.
6. **Pós**: anular eventos laterais, `REFRESH` da matview, conferir contagens por etapa/mês (set/26 e out/26) e o funil Atual contra o RD; registrar no CLAUDE.md.
