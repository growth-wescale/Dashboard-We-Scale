# Eletrovias — casos de origem para Maicon

Maicon, precisamos fechar a cobertura e a classificação de Eletrovias na ouro antes de ativar Marketing. **Investimento está encerrado e não precisa ser revisto.** O dashboard deve consumir a classificação da origem: toda negociação criada no CRM é MQL; a qualificação da LP deve ser preservada, sem novo cálculo por capital.

Este encaminhamento reúne os IDs e os retornos esperados. **Não autoriza alterações no RD, fatos do DW, Vendas, demais marcas ou produção.** Se a solução exigir intervenção nesses sistemas, apresentar a ação exata antes de executar. Não criar pessoas, apagar importações, reenviar formulários ou mudar marcas/datas para fechar totais.

**Fonte/data:** fotografia da investigação de 27/10/2026, encerrada às 14:40 BRT: Supabase Marketing, DW e GETs das contas RD conectadas. Este documento foi preparado a partir dessa evidência; não é uma nova auditoria. Como a carga é automática, verificar se o caso já chegou antes de propor intervenção. Só conferir os IDs abaixo; não reabrir as outras marcas.

**Como localizar os IDs:**

- **ID da submissão/base atual:** `public.leads.id` no Supabase de Marketing, marca Eletrovias; não é um ID de contato RD.
- **Negócio/contato CRM:** IDs da conta `wescale_principal_crm`.
- **Contato RD Marketing:** UUID do contato, distinto do contato CRM.
- **Registro ouro:** `registro_key` de `ouro.vw_leads_candidatos`, no DW `oralunic_dw`. O campo `lead_ocorrencia_id` desse registro aponta para o evento normalizado em `prata.rdm_events`.

## 1. Negócio sem contato — confirmar identidade antes de propor vínculo

- Negócio CRM: `6ad18c51de18d10020db5411`.
- Linha atual: `fd8a1d23-3f9d-4575-991d-3a485eeffa66`; dia **15/10**, classificada como MQL.
- Na fotografia, negócio ganho, Marca=Eletrovias. O endpoint específico `GET /deals/{id}/contacts` respondeu 200 com lista vazia; a prata também tem zero vínculos. O GET principal do negócio não foi usado sozinho para concluir ausência de contato.
- **O que precisa ser resolvido:** confirmar a identidade real e explicar por que o negócio está sem contato. Indicar o contato existente correto, se houver evidência. Não criar uma pessoa com base no nome da negociação nem inventar email/telefone; não transformar negócio sem identidade em pessoa no KPI.
- **Retorno esperado:** negócio → identidade comprovada → contato real ou impedimento → proposta de exposição do vínculo na ouro. Se exigir alteração no RD, solicitar aprovação específica; este encaminhamento não a concede.

## 2. Dezessete contatos sem correspondência — rastrear 19 submissões reais

São **17 contatos, 19 submissões, seis MQLs** na base atual. Nas consultas pelo email desses registros: RD Marketing 404 e CRM zero contatos. Também não foram encontrados nas fontes DW consultadas. Isso **não prova exclusão nem falha de envio**; é necessário rastrear os logs/recibos da origem.

A cópia `prata.wescale_marketing_leads` consultada termina em **22/09/2026**, com última observação em 23/09; ela não cobre essas submissões de outubro.

**O que precisa ser resolvido:** localizar cada submissão pelo ID da base atual, verificar recebimento/entrega e identificar como o registro real chegará à ouro, mantendo marca, data e classificação originais. Não reenviar para o RD nem reconstruir pessoas nesta etapa. Os três IDs na mesma linha representam uma pessoa com três submissões; preservar as três linhas, sem contá-las como três pessoas.

| Caso | Data(s) na base atual | Classificação da origem | ID(s) da submissão (`public.leads.id`) |
|---|---|---|---|
| A01 | 2026-10-12 | Lead | `553a31b4-f353-4877-b646-c2651be10a0c` |
| A02 | 2026-10-16 | Lead | `58e92563-9521-4622-8f50-8a19358fa7a7` |
| A03 | 2026-10-23 | Lead | `14cc0754-4971-4255-b104-115f2c37e378` |
| A04 | 2026-10-23 | MQL | `16906b1d-4ece-4283-8c70-19a16ebd5404` |
| A05 | 2026-10-23 | Lead | `3aecebe7-c3fd-42bc-9ce8-9af3c8dc9ee9`<br>`805ff60c-5063-4cf1-9d92-90d15df0bf5b`<br>`867fb984-e362-40a7-a097-34fcd74b90dc` |
| A06 | 2026-10-23 | Lead | `7445e6a5-9a00-4643-b6ec-2e31efc74137` |
| A07 | 2026-10-23 | Lead | `8248b9bc-5013-49f3-989e-0a44f4626b91` |
| A08 | 2026-10-23 | Lead | `c41493c6-4f68-4601-a6cb-a5f6c70f29de` |
| A09 | 2026-10-23 | Lead | `e890c675-ea80-4874-a022-e8ede94a14b3` |
| A10 | 2026-10-23 | Lead | `f7f7155f-9472-449a-9014-8590362b84b0` |
| A11 | 2026-10-23 | Lead | `fc1afbd9-d903-4676-a1a0-bf710786f124` |
| A12 | 2026-10-24 | Lead | `744677c6-ff60-4497-9de4-2dd431322e84` |
| A13 | 2026-10-25 | MQL | `2d46cc7a-d097-44d8-a17d-ca9b48dfc550` |
| A14 | 2026-10-25 | MQL | `c5d4c88c-9623-4774-8ad8-91523ab2b9a2` |
| A15 | 2026-10-26 | MQL | `697e1e67-cca7-4d74-8d99-ad46aa6d5de5` |
| A16 | 2026-10-26 | MQL | `d68a3086-5133-4222-a936-31c27b0d99de` |
| A17 | 2026-10-26 | MQL | `de9c18b0-7736-40c3-b270-5f55248aec66` |

**Critério de retorno:** ID de submissão → comprovante/status de entrega → identidade confirmada → registro/view ouro ou impedimento técnico. Não declarar resolvido apenas porque o total agregado aumentou.

## 3. Dois Leads já no RD Marketing — verificar cobertura da coleta

| ID da submissão atual | Contato RD Marketing | Data / evento |
|---|---|---|
| `bb1bfca4-9d41-496b-9bfe-88332be4a3a2` | `c3e112f6-80d0-43ad-88f3-8774233a9387` | 27/10; `eletrovias_multistep` |
| `c2b04134-462d-4b51-9887-c3cc86a28926` | `4a0e98e1-718a-4299-b36d-5288071b96c7` | 27/10; `eletrovias_multistep` |

**Evidência:** contatos e eventos existem no RD Marketing; ainda não estavam na ouro na leitura. Ambos são Lead na base atual, não novos MQLs.

**O que precisa ser resolvido:** identificar o estágio da coleta/normalização/publicação e verificar se o fluxo automático já os disponibilizou. Retornar `registro_key`, ID do evento e horário da carga. Se não chegaram, apresentar a causa e a correção proposta no fluxo; não criar duplicatas nem forçar reprocessamento por este documento.

## 4. Classificação original — 89 casos, não 89 novos MQLs

Os 89 eventos presentes na ouro não carregam classificação MQL/Lead no payload recebido do RD Marketing. A base atual tem **84 Leads, três MQLs e dois casos sem correspondência**. Em 86 dos 87 com referência, email e dia coincidem; isso ajuda a rastrear, mas não substitui a confirmação da submissão real. Um MQL tem diferença de data e está detalhado abaixo.

**O que precisa ser resolvido:** expor na ouro a classificação original de cada submissão com ID e proveniência, a partir da origem que efetivamente a gravou. Não recalcular pelas respostas de capital/momento/espaço. Não copiar `cf_lead_type` atual de um contato de várias marcas para todos os eventos. Para os dois sem referência, localizar a evidência de origem; manter desconhecido enquanto não existir comprovação.

Os três MQLs têm tratamentos diferentes:

### C1 — negócio Eletrovias atualizado na origem, DW com marca anterior

- Submissão de 23/10: `78138be8-2c74-43b6-be2b-ffcae5069446`.
- Contato RD Marketing: `3056ddbe-de81-453e-ad0a-2dbe1c53d9d5`.
- Negócio CRM: `6adbe687c3de7d002414e087`; contato CRM: `6adbe687c3de7d002414e088`.
- Registro ouro da captação: `lead:573beeae25917e33bdab1e7d111ab700`.
- **Evidência:** CRM vivo informou Marca=Eletrovias, atualizado em 27/10 às 13:56; fotografia ouro publicada às 13:51 ainda mostrava B2Case. A outra negociação desse contato, `6adca9d9b19ce6002818a65a`, é B2Case e deve permanecer assim.
- **Retorno esperado:** o fluxo refletir a marca atual do negócio Eletrovias e seu vínculo, com evidência da carga. Não editar a outra negociação nem aplicar reatribuição global. Não alterar manualmente a marca no DW para antecipar a carga.

### C2 — negociação já criada, ainda não coletada na prata/ouro

- Submissão de 27/10: `6b9da848-ab60-4c41-816b-acacecf96c72`.
- Contato RD Marketing: `198f4b51-5c41-467d-ba9f-b63a50f902fa`.
- Negócio CRM: `6ae0c8d63e139500234f2c0b`; contato CRM: `6ae0c8d63e139500234f2c0c`.
- Registro ouro da captação: `lead:8e4ec957db2ef326bb6a41c3838ad639`.
- **Evidência:** negócio criado em 27/10 às 12:52, Marca=Eletrovias confirmada no CRM; vínculo retornado na consulta do contato. O negócio ainda não estava na prata/ouro consultadas.
- **Retorno esperado:** confirmar a cobertura da coleta desse negócio e expor o vínculo real na ouro. A negociação criada já o qualifica como MQL; não criar outra regra ou outro negócio.

### C3 — submissão MQL de 23/10 diferente do evento RD de 06/10

- Submissão de 23/10: `823dd4b7-de09-4261-820a-6876c73fe841`, com `lead_type=MQL` e `is_mql=true`.
- Contato RD Marketing: `3a17feed-0c8b-46be-a299-21b4b94d3f67`.
- Registro ouro existente, de **06/10**: `lead:2deca67b7f2428772f070285d14891f4`.
- **Evidência:** no RD consultado, o evento Eletrovias disponível é de 06/10; os negócios encontrados pertencem a outras marcas. A classificação global do contato não comprova a classificação desse evento Eletrovias.
- **Retorno esperado:** rastrear a submissão real de 23/10 e disponibilizar sua classificação e proveniência na ouro. Preservar o evento de 06/10; não redatá-lo, mover negócio de outra marca ou copiar qualificação entre marcas.

C1–C3 **já estão incluídos nos 89 casos** do anexo. Não somar esses grupos para produzir um novo total de MQLs.

## 5. Datas já esclarecidas — nenhuma correção solicitada

Submissão `9e3000d4-abce-445a-bd17-cd675c4d3b44`, de 13/10, é uma recaptura. A negociação `6ac6e46d135f580001ec8a2a` foi criada em 07/10, data também comprovada pelo primeiro formulário condicional. Manter a data comercial de 07/10 para MQL e a captação de 13/10 como evento distinto. Não deslocar o negócio para fazer os calendários coincidirem.

## Retorno solicitado e limite de execução

Para cada ID/caso, informar:

1. Situação: já refletido na carga, lacuna confirmada ou identidade ainda não comprovada.
2. Evidência de origem e identificadores relacionados, sem dados pessoais em canal aberto.
3. Registro/view e data da carga na ouro, com data e classificação de origem preservadas.
4. Causa e proposta exata se ainda houver ajuste necessário; responsável e previsão, quando definidos.

O escopo é **somente Eletrovias**. Investimento está encerrado por Gabriel. Nenhum ajuste no RD, fatos do DW, Vendas ou demais marcas, reenvio ou publicação está autorizado por este encaminhamento. Após o retorno, conferir somente os casos delimitados e fazer uma única validação Marketing/PDF antes de qualquer aceite de ativação.

## Anexo — IDs dos 89 registros para rastrear a classificação

A classificação abaixo é a **referência gravada pela origem na base atual**, não uma instrução para atualizar linhas por email. Confirmar a submissão e o vínculo antes de propor exposição na ouro. `—` significa ausência de correspondência; não preencher por inferência.

| Registro ouro (`registro_key`) | Dia ouro | ID da submissão atual | Dia / classificação atual |
|---|---|---|---|
| `lead:2deca67b7f2428772f070285d14891f4` | 2026-10-06 | `823dd4b7-de09-4261-820a-6876c73fe841` | 2026-10-23 / MQL |
| `lead:085df2fdbb68fba2e5c62c78c76617c9` | 2026-10-23 | `1a253803-1f2b-424c-87c2-ba857dee56cf` | 2026-10-23 / Lead |
| `lead:2e6f9fc543121e589178e2105d9052fb` | 2026-10-23 | `8d18dea0-3770-4b10-92a9-4dff6d28700b` | 2026-10-23 / Lead |
| `lead:345db3254b7b09c7b8ac2c85acf24776` | 2026-10-23 | `21453c41-e48f-4a8f-a038-bcfa9dee5aa8` | 2026-10-23 / Lead |
| `lead:3d1c39b45f3779891b7d97b616f7861e` | 2026-10-23 | `19cc551e-d67a-4b14-88a5-cfb9b00e456e` | 2026-10-23 / Lead |
| `lead:573beeae25917e33bdab1e7d111ab700` | 2026-10-23 | `78138be8-2c74-43b6-be2b-ffcae5069446` | 2026-10-23 / MQL |
| `lead:d6dcb18d6a38d3820e18cb0e19c4ac72` | 2026-10-23 | `f5907c7f-9261-4dab-add1-193b71876fcd` | 2026-10-23 / Lead |
| `lead:e21c2881b5f96543fbf5b5ec56f5989c` | 2026-10-23 | `23c2d3c2-1d52-4102-a945-b0eab4a18194` | 2026-10-23 / Lead |
| `lead:e621184b753aab66a17e1c520e1171b0` | 2026-10-23 | `7c66be2f-b704-44d8-9090-7c249fc53d8b` | 2026-10-23 / Lead |
| `lead:001db6f76f3ad4d74417dd5ab08739f9` | 2026-10-24 | `9cd0e6ae-5936-4298-85a9-0bff5bd725c5` | 2026-10-24 / Lead |
| `lead:136e2ba41b36c8a778f6b69e5ce8c47a` | 2026-10-24 | `626979a4-fc70-4685-accb-9cfe2f7b8d8d` | 2026-10-24 / Lead |
| `lead:277d7bf5921d11474793e563c91d42ba` | 2026-10-24 | `fd391f88-f52f-4c6d-b2a9-c0784f4bf4bd` | 2026-10-24 / Lead |
| `lead:797458929067d801c02c439f3b7932d7` | 2026-10-24 | `df10ec4f-c8d8-47fc-bc16-b9ca7cae58c4` | 2026-10-24 / Lead |
| `lead:80393f8a86742221d220c66c0608dd43` | 2026-10-24 | `671e7a2e-0a7a-4290-9be8-e477a2581416` | 2026-10-24 / Lead |
| `lead:81b2a9a315ca474b14a7a49446723703` | 2026-10-24 | `66022af5-3d9e-486d-9f0e-1d9b59313d8f` | 2026-10-24 / Lead |
| `lead:99c18d106ec0b802e10f4c9676444372` | 2026-10-24 | `f9ca2ecd-f3b5-45ad-8ec7-76f2c4aca989` | 2026-10-24 / Lead |
| `lead:abe460fb70dfbe59459743e411314794` | 2026-10-24 | `e7a1e484-d9d1-483e-9395-1b9e87297ebe` | 2026-10-24 / Lead |
| `lead:b2d418f01bbb6c0d635f8bb06b05e156` | 2026-10-24 | `a7987562-dec8-4e29-acba-5bb887846fe0` | 2026-10-24 / Lead |
| `lead:bc9222e3f24f4a78e64b8a5ad7ee1366` | 2026-10-24 | `1472a337-ef65-4210-b2f9-cef33c5907bb` | 2026-10-24 / Lead |
| `lead:ca00074ef453a3e9c2d58f7397ef5fac` | 2026-10-24 | `06617d3d-ab39-4c44-9a96-d6ceb228bf2e` | 2026-10-24 / Lead |
| `lead:f4b75c2ccfacc6fcaf13d588eae06f4e` | 2026-10-24 | — | — |
| `lead:f887a5ebbcdb55b874d43522c6ba2c24` | 2026-10-24 | `7b8f3b95-e71a-4df9-a6a4-8ca6b175dcf7` | 2026-10-24 / Lead |
| `lead:006a31913cf609771a8be9dfaa4319cf` | 2026-10-25 | `7f3831c6-7046-40ba-b084-9d644fd9b65d` | 2026-10-25 / Lead |
| `lead:00bb6348af6a3ab2d88a4eec1490ccb4` | 2026-10-25 | `d6c0d344-4db2-4ba4-b210-1ddc302fc5de` | 2026-10-25 / Lead |
| `lead:06a655c49e0dca6275b3ea9f1251e64b` | 2026-10-25 | `37e4b4ee-dab6-47ba-bd34-9bef24534f13` | 2026-10-25 / Lead |
| `lead:1252f04b848be44bd24588b8ab351c94` | 2026-10-25 | `9ba59769-c90a-472f-b3c2-68713a6618ab` | 2026-10-25 / Lead |
| `lead:13cef5c6b2f0f373b3d57bbd59138f6d` | 2026-10-25 | `bae55540-7b8e-4dd3-acbf-59feba9ad34f` | 2026-10-25 / Lead |
| `lead:19a0f8719569123b9c9dfcdd44db7772` | 2026-10-25 | `72d0dfb3-4458-45e4-b914-5a631b9629be` | 2026-10-25 / Lead |
| `lead:22396696e30b0ae4dc1f36901f2eab2a` | 2026-10-25 | `7eb8f8e6-7940-467a-93af-7ea0326388d1` | 2026-10-25 / Lead |
| `lead:33de4cb06f4b77c5e68077a1f07ae309` | 2026-10-25 | — | — |
| `lead:341271f85d9469202b35360d528b8eaf` | 2026-10-25 | `eb5d0aea-03fb-4cb3-87b7-f1a8be81c205` | 2026-10-25 / Lead |
| `lead:3f89a13cfabc305497e553c5678c6ae7` | 2026-10-25 | `e5330e93-2cd1-4c6e-8336-4f20d7e59158` | 2026-10-25 / Lead |
| `lead:513b0c72449aa5587ae9e8195f2f6def` | 2026-10-25 | `44300ea5-dc17-489b-b018-7930d124a7e8` | 2026-10-25 / Lead |
| `lead:77f657b071e909fa0ae786f8c59be13c` | 2026-10-25 | `0585db9d-598e-47db-a3ec-dc7e06e74b4f` | 2026-10-25 / Lead |
| `lead:79f079d4fe03b86bb5ed6bbf184b1a1f` | 2026-10-25 | `2ebc69b6-9914-4d07-9731-f522a4dd2ef0` | 2026-10-25 / Lead |
| `lead:7bcca20a6b1d3f41a9487903c6bcea05` | 2026-10-25 | `98e999d0-c231-45f3-9c3f-2aa35ede175b` | 2026-10-25 / Lead |
| `lead:7bd6e1dd6c35e968cba444e156c5058d` | 2026-10-25 | `a9e76db6-9d18-4b93-ba38-74fe6ee81b35` | 2026-10-25 / Lead |
| `lead:8690c286ee37a0dc532bc72ddebec735` | 2026-10-25 | `ae5125f1-1633-4cf6-81fb-845eadf28084` | 2026-10-25 / Lead |
| `lead:9188393d241482de8776876029bc8ccb` | 2026-10-25 | `695226f6-a44d-430f-954f-db6f8608b890` | 2026-10-25 / Lead |
| `lead:a18402ce01c179fd7c7021d0512ece9b` | 2026-10-25 | `5fd197a8-c772-4811-b19c-ff59f389a4a0` | 2026-10-25 / Lead |
| `lead:b3beabd833f4cb8a47438f569368446f` | 2026-10-25 | `bd461989-8d11-42af-a609-b247cb735e18` | 2026-10-25 / Lead |
| `lead:b5707cba71fe62f0741eff0ff38c497c` | 2026-10-25 | `08066b72-1bd4-4776-845a-32e8f7b8059f` | 2026-10-25 / Lead |
| `lead:d333655d46505b1ea391fe4968d663ed` | 2026-10-25 | `6166e3f6-8012-42b7-8b43-5d52c9fee4ce` | 2026-10-25 / Lead |
| `lead:e1eb79e961b8b4508ea07d3b778b7ce1` | 2026-10-25 | `5f0ec9ca-5591-425c-b5fa-46ffe7872b37` | 2026-10-25 / Lead |
| `lead:e463c7acd9164724659ce1495a4dd2a6` | 2026-10-25 | `b2a637a4-7232-4472-be21-e28a71972a57` | 2026-10-25 / Lead |
| `lead:ec8f125d09dddaf1647b809637d61719` | 2026-10-25 | `844d83e1-5dc4-4695-b0a1-70dcc09523d4` | 2026-10-25 / Lead |
| `lead:005fe383380192f8194669a74a2cb4a9` | 2026-10-26 | `35fa7238-e92d-4ad6-9fb8-8ecbc9afa4bc` | 2026-10-26 / Lead |
| `lead:04349f848a2630f044bfcff0e368874b` | 2026-10-26 | `f0cd0a76-8621-418d-aa09-3e3b4b900cdb`<br>`26e5991f-bbea-456c-a4ca-098ade3d6130` | 2026-10-23 / Lead<br>2026-10-26 / Lead |
| `lead:081529619e19956474359e9bfe75ce22` | 2026-10-26 | `13097ae7-4983-47f5-81c7-2b8cc72f7ac0` | 2026-10-26 / Lead |
| `lead:0b7943eda501af548b0216f7ffeba7ce` | 2026-10-26 | `6305463b-7695-4036-9ce6-c02b9d98531d` | 2026-10-26 / Lead |
| `lead:1a3bbb06e9298b6a34166d0edd9d2d1e` | 2026-10-26 | `182afe92-215a-4875-bb8b-5a7d2f9e530e` | 2026-10-26 / Lead |
| `lead:263ac9d108d589ab299a7cb296e83770` | 2026-10-26 | `6ebb762c-2666-4ca7-957b-55be3bc02ef4`<br>`68ec1f26-eb52-4e28-aed5-cdd6c4e356c0` | 2026-10-24 / Lead<br>2026-10-26 / Lead |
| `lead:2cdb2bd40d4f9c973b934719bbba27e7` | 2026-10-26 | `c2481d62-08c8-45ee-a2fa-633aa8de4d08` | 2026-10-26 / Lead |
| `lead:2fc7b3cddbc70ad5284ed7b3ce089c55` | 2026-10-26 | `01392d19-026f-4683-944e-55e71ef190bc` | 2026-10-26 / Lead |
| `lead:31a40d6220ab3c688a725b13ba07a318` | 2026-10-26 | `bf89e17f-d5a5-44ce-abdd-73f949a434f7` | 2026-10-26 / Lead |
| `lead:36429ceb929fdeb08a5b012667d4d619` | 2026-10-26 | `fb15e645-4f7e-4afa-94b1-f4d814459b9a` | 2026-10-26 / Lead |
| `lead:392e93b4d3d2459a0a7f7952ad5703f2` | 2026-10-26 | `20512620-1ad4-4d79-b76c-62590dee5618`<br>`dae97653-8863-4f35-adda-ca61a9f26f96`<br>`781a6cdf-234a-4490-b74d-d8f240350dae` | 2026-10-13 / Lead<br>2026-10-26 / Lead<br>2026-10-06 / Lead |
| `lead:3c3d07a0fb08fb2f4fcd7415c5d5b678` | 2026-10-26 | `5a594f0e-473c-46ee-b419-4a9d60e027ee` | 2026-10-26 / Lead |
| `lead:3f2d710f82f73e22cf38a3e9d3de28be` | 2026-10-26 | `58c0b67d-c630-432e-bf4f-e64a3edc260d` | 2026-10-26 / Lead |
| `lead:47ed921c10ebf08461cf084159ed746b` | 2026-10-26 | `9d8b7844-53ea-4a9e-b6f8-99fb870e75e2` | 2026-10-26 / Lead |
| `lead:5a08a0ff6fb612278fdabae17a717dad` | 2026-10-26 | `404942ba-d06a-44aa-b020-876ac035a942` | 2026-10-26 / Lead |
| `lead:5f47e16f9ea3af2a2ff0054ed7704efe` | 2026-10-26 | `67b2bc88-fd0a-4d89-96b9-53ee8fea510d`<br>`5dbfafb8-78b9-4c02-9c3b-b36c10bd22d1` | 2026-10-10 / Lead<br>2026-10-26 / Lead |
| `lead:71b568e48550aa26ac5d927186cf5f5b` | 2026-10-26 | `fe4bf9dc-8343-4244-81c7-5f6a86842557` | 2026-10-26 / Lead |
| `lead:7f61fa86bcf0841bc5e917cac0c0a5b9` | 2026-10-26 | `62f50fb6-8149-4028-a5d1-6b10bc9028bc` | 2026-10-26 / Lead |
| `lead:84d60c387f13486fedf7077115a0e989` | 2026-10-26 | `06c63a70-cff9-44ea-88b5-a939b617683b` | 2026-10-26 / Lead |
| `lead:8d1de33eade5a36c0b732c7766437a5c` | 2026-10-26 | `5a54089f-f9a3-43df-94f2-a5b4e65eaca2` | 2026-10-26 / Lead |
| `lead:982f2df5b959a99d7c6c78c49dc36415` | 2026-10-26 | `d4e11347-73b1-4117-8057-824dd07ec231` | 2026-10-26 / Lead |
| `lead:a14817f90a0e09a0f54111d4c56c2eaf` | 2026-10-26 | `f0062741-327b-4276-9ac1-20dfd26819f6` | 2026-10-26 / Lead |
| `lead:a80da39427c42b037510362885aa8c5d` | 2026-10-26 | `6b5aae21-bfb3-48eb-954b-8566ced6d3e8` | 2026-10-26 / Lead |
| `lead:ab3c29f8a0984c3144faf07b09e473f9` | 2026-10-26 | `8387cbcc-e422-4a16-8055-1f34c4022ca6` | 2026-10-26 / Lead |
| `lead:b0ed7eab75e73007f78fbfee90fa637e` | 2026-10-26 | `ea8234d7-e993-4d5e-97c4-40188cb4e723` | 2026-10-26 / Lead |
| `lead:c3ba93948d741961021d8457ac09ee3c` | 2026-10-26 | `9cf2e6f1-5b89-41e9-bd14-47daa5cbb321` | 2026-10-26 / Lead |
| `lead:c492c74a874000a1da1b7febe912967d` | 2026-10-26 | `84577b3f-a704-4cbe-8509-a67d895a194a` | 2026-10-26 / Lead |
| `lead:cad5b9211cd04e06475876b3f17f9756` | 2026-10-26 | `8cb1f634-5fd8-4b8a-a0ed-cbc429a6127c` | 2026-10-26 / Lead |
| `lead:dde317aed89443e9b4606c311ad73962` | 2026-10-26 | `c8e12a1b-9693-49d9-a635-11ae4b2f3121` | 2026-10-26 / Lead |
| `lead:e19ba2aa15cc1e5fa775f56872f74838` | 2026-10-26 | `9c3dbe75-3496-438f-9494-ba38ae35a0e6` | 2026-10-26 / Lead |
| `lead:efa0a28d4b585270e0502b7e27ece59c` | 2026-10-26 | `79eca0fe-183e-4dfe-bb77-d23b7658b477` | 2026-10-26 / Lead |
| `lead:03a17e50bafe8ac0a4c17f9f406988c8` | 2026-10-27 | `b3130d06-0ad5-4002-adbc-94359483b0b6` | 2026-10-27 / Lead |
| `lead:49b674a579d91c8e2148e6580dd2e418` | 2026-10-27 | `c2c72681-6b90-46f7-a579-7139aa6d3900` | 2026-10-27 / Lead |
| `lead:5703fed85fa12dc8b38854275f05246d` | 2026-10-27 | `65f301d4-a71d-4130-916c-b8e48aa2c653` | 2026-10-27 / Lead |
| `lead:59152e9d2a98428139eeeba55f8166c1` | 2026-10-27 | `ebf9eb00-ea91-47cb-9b29-311a88712f01` | 2026-10-27 / Lead |
| `lead:60f60f75a58b1212cc84e44e44113354` | 2026-10-27 | `f5f65b63-9ec2-4321-af61-1a7bbe82ac57` | 2026-10-27 / Lead |
| `lead:6eb0d23eb920b043c0cc247b9d2eb2a4` | 2026-10-27 | `1570c21f-4697-4123-b70a-1c56b6bb4939` | 2026-10-27 / Lead |
| `lead:6f58dd2a87d325d7f461ecffb0c11763` | 2026-10-27 | `e177e58d-beef-4143-93a6-99020b0108c3` | 2026-10-27 / Lead |
| `lead:89520cb287ac9206ea956d8f2efba741` | 2026-10-27 | `b292119f-2c62-4d26-8607-e55ac1b353a6` | 2026-10-27 / Lead |
| `lead:8e4ec957db2ef326bb6a41c3838ad639` | 2026-10-27 | `6b9da848-ab60-4c41-816b-acacecf96c72` | 2026-10-27 / MQL |
| `lead:8f90a5908366dab4276bfb331eadbbab` | 2026-10-27 | `38b4795e-a4da-4a0d-907e-85689a9996b2` | 2026-10-27 / Lead |
| `lead:cb491a085eb59f29e6ef6733536a680c` | 2026-10-27 | `66136323-27a9-4b23-935a-47dca64a4c48` | 2026-10-27 / Lead |
| `lead:efe27bd2d778dd656db34a2928f3ee0d` | 2026-10-27 | `59d557e9-15b7-4802-9ef5-fadbd35e7aa0` | 2026-10-27 / Lead |

Evidência técnica: [auditoria de 27/10](../audits/2026-10-27-eletrovias-ouro.json), seção `investigation_2026_10_27`; [contexto da preparação](../../server/eletrovias_ouro/README.md). Documento preparado para Gabriel encaminhar; envio ao Maicon não realizado pelo assistente.
