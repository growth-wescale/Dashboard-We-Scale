# Eletrovias — prévia Marketing validada, 27/10/2026

**Integração e QA concluídos na prévia; não publicada.** PR288 na branch `codex/eletrovias-ouro-preparacao`, atualizada com a main publicada `55a5125`. Gabriel autorizou avançar enquanto Maicon trata as exceções da origem. A flag `VITE_ELETROVIAS_OURO_ENABLED` está ativa somente na prévia e continua ausente/desligada no deploy. Nenhuma view, role ou gateway definitivo foi instalado; RD, fatos, importações e Vendas não foram alterados.

## Resultado da validação de27/10 — decisão posterior à investigação

- Prévia autenticada no Chrome: Visão Geral, Saúde da Marca (visão geral/campanhas/conjuntos/anúncios), Meta & OKRs/Missão e S&OP conferidas. PDF exportado pelo aplicativo, nove páginas renderizadas/revisadas; Eletrovias é a primeira folha. Fontes de Termos/Social/E-mail/Radar e Esteira continuam nativas.
- Corte01–27/10, carga observada14:39 BRT: **1.344 contatos,543 MQLs, R$23.820,823190**. MQL consistente nas quatro páginas; CP-MQL R$43,87. Semana19–25: **130 MQLs / R$6.702,168658 / CP-MQL R$51,56**. Investimento encerrado: valores novos são leitura da carga regular, sem nova conciliação ou ajuste.
- Campanhas/conjuntos/anúncios passam a usar atribuição exata por UTM/ID exclusivamente para Eletrovias no período migrado; removido o rateio de MQL por gasto/leads de mídia nesse recorte.543 conservados em cada nível;325 Fundo,111 Forms,33 Remarketing,74 sem campanha correspondente. Não associar `m_google`, placeholders ou UTMs de outras marcas por suposição.
- A exceção aceita é somente o deal `6ad18c51de18d10020db5411`: continua como negócio no DW, não vira pessoa fictícia, nem bloqueia os demais contatos. O gateway retorna o aviso técnico agregado `accepted_missing_contact:1`; quando a fonte fornecer contato real + email/telefone, ele entra automaticamente. Qualquer novo deal sem identidade continua bloqueando a resposta para revisão. Nenhuma importação é apagada ou usada como fallback para fechar total.
- Os casos de Maicon seguem no handoff; não reabertos nesta validação. Há91 contatos sem classificação explícita na fotografia atual; permanecem sem classificação, sem cálculo por capital e sem herdar MQL de outra marca. A lista histórica de89 do handoff mantém o corte e IDs da investigação.
- Prova autenticada de preservação: ao ligar Eletrovias sobre a mesma leitura de referência, todos os campos/linhas das outras oito marcas de leads e sete marcas de mídia ficaram idênticos. Histórico fora de outubro, consultas de Vendas, clientes e caches nativos cobertos pelos testes; arquivos/fontes comerciais sem diff contra main. Não é nova homologação de todas as telas de Vendas.
- SQL/SAL/fechamentos de Marketing conservam os critérios existentes: Visão Geral/Saúde/OKRs SQL58; S&OP SQL62 e etapa Fechado17. São medidas preexistentes distintas; não foram convertidas em vendas ganhas nem alteradas para coincidir. Páginas de Vendas intocadas.
- **935 testes frontend,13 gateway, build com flag de prévia e lint sem erros**. Uma resposta503 transitória no gateway existente de Lisô/Beauty interrompeu a primeira leitura consolidada; leitura posterior200 e QA/PDF final concluídos sem mudar serviço, consulta ou configuração dessa marca. Não é certificação de SLA.

Prévia usa um gateway temporário local autenticado e transações SELECT READ ONLY da projeção proposta. O consumidor final já aponta exclusivamente às duas views ouro; elas ainda não foram instaladas. **Próximo gate: apresentar o resultado; somente após autorização instalar/validar views/role/gateway definitivo e publicar pelo PR.** Não esperar Maicon para esta decisão, não reabrir investimento. PDF/evidências privados em `outputs/audits/eletrovias-qa-20261027.local/`; somente agregados versionados na auditoria.


## Histórico — investigação de origem e mídia,27/10

**Investimento encerrado; identidade/cobertura e qualificação da origem permanecem para decisão.** Handoff com IDs e critérios de retorno preparado para Gabriel encaminhar ao Maicon: [casos de Eletrovias](../../docs/handoffs/2026-10-27-eletrovias-maicon.md). Investimento confirmado como encerrado por Gabriel; envio ainda não realizado. Somente SELECT e GET nas APIs. Nenhuma mudança no consumidor, SQL preparado, RD, fatos, outras marcas ou Vendas; nenhum gateway instalado, merge ou deploy. As consultas por email foram explicitamente autorizadas pelo usuário após bloqueio inicial da aprovação automática; só retornaram identificadores técnicos/status, sem atualização de registros.

### Cinco campanhas conciliadas por dia

| Campanha | Ouro01–26 | Plataforma01–26 | Diferença |
|---|---:|---:|---:|
| Google Search23778217190 |R$1.560,80|R$1.560,80|R$0,00|
| Meta Aquisição fria52585384013024 |R$719,83|R$719,83|R$0,00|
| Meta Fundo52671387111024 |R$17.349,86|R$17.349,86|R$0,00|
| Meta Remarketing52682815187224 |R$1.039,22|R$1.039,22|R$0,00|
| Meta Forms52683550378024 |R$2.623,43|R$2.623,43|R$0,00|
| Total |R$23.293,14|R$23.293,14|R$0,00|

Paridade em cada dia/ID, não somente no total:125 combinações campanha/dia com gasto, sem divergência. BRL, Meta America/Sao_Paulo e Google America/Manaus, mesmos dias de calendário da conta em plataforma/ouro. Não converter silenciosamente o dia Google para BRT. Base atual01–26R$21.761,47: estáR$1.531,66 abaixo das plataformas nesse recorte; não há valor ouro a corrigir.

Incluindo27/10, fotografia ouroR$23.763,15 versus plataformasR$23.822,70; residualR$59,55 exclusivamente do dia aberto. Leitura Meta14:29 BRT/Google14:31, ouro publicada13:51. A campanha fria está pausada desde22/10; última carga23/10 isoladamente não significa falha. Proposta: manter os cinco IDs/valores da ouro; não ajustar manualmente gasto nem repetir esta conciliação por diferenças intradiárias.

### Identidade e cobertura: os20 casos delimitados

- **17 contatos/19 submissões, seis MQLs atuais:**não localizados pelo email consultado no RD Marketing (404) nem na busca CRM (zero), além de ausentes na ouro/prata consultadas. Não afirmar exclusão histórica nem falha de envio sem logs. A cópia `prata.wescale_marketing_leads` termina22/09 e não oferece recuperação de outubro. Proposta à origem/TI: rastrear os IDs das submissões e disponibilizar os registros reais na fonte da ouro, preservando data, marca e classificação. Nenhum reenvio/importação foi feito.
- **Dois contatos Lead de27/10:**existem no RD Marketing com evento `eletrovias_multistep`, ainda ausentes na ouro na leitura. IDs atuais `bb1bfca4-9d41-496b-9bfe-88332be4a3a2` e `c2b04134-462d-4b51-9887-c3cc86a28926`. Tratar cobertura/defasagem da coleta; não inventar outro contato nem forçar carga nesta etapa.
- **Um negócio de15/10, ganho:**`6ad18c51de18d10020db5411`. O GET específico `/deals/{id}/contacts` retornou200 com lista vazia; a prata também tem zero vínculos. O GET principal do negócio omite contatos, portanto não foi usado sozinho como evidência. A linha atual `fd8a1d23-3f9d-4575-991d-3a485eeffa66` aponta para esse deal, mas não autoriza inventar vínculo. Origem/TI deve confirmar a identidade real. Qualquer eventual ajuste no RD continua exigindo autorização explícita da ação exata; não integra esta proposta de execução.

### Classificação:89 desconhecidos não são89 novos MQLs

Todos os89 vêm de eventos RD Marketing. O evento original recebido tem capital/momento/espaço, mas **não traz campo de qualificação MQL/Lead**; não é uma classificação calculada que o dashboard deva reproduzir. Na base atual,84 sãoLead e3 sãoMQL, todos no formulário `eletrovias_multistep`; dois não têm referência correspondente. Dos87 por email,86 têm também a mesma data. A proposta é expor a classificação original de cada submissão real na ouro, com proveniência, sem inferir por capital. Campo atual de contato `cf_lead_type=MQL`, encontrado em um contato com histórico de várias marcas, não substitui classificação do evento Eletrovias.

Os três MQLs atuais foram separados:

1. **23/10, linha78138be8…:**negócio`6adbe687c3de7d002414e087` tem contato válido e **Marca=Eletrovias no CRM vivo**, atualizado13:56. A ouro do corte13:51 ainda mostraB2Case; a prata consultada também conserva a observação anterior. A outra negociação do mesmo contato,24/10, continuaB2Case. Proposta: o fluxo refletir a marca atual daquele ID, sem reatribuir a outra negociação nem modificar fatos. Não afirmar quem alterou a origem.
2. **27/10, linha6b9da848…:**negócio`6ae0c8d63e139500234f2c0b`, criado12:52, confirmado no CRM com Marca=Eletrovias. A busca do contato retorna o vínculo; o negócio ainda não está na prata/ouro consultadas. Tratar a cobertura da coleta comercial; ele já éMQL pela regra do CRM, sem nova qualificação.
3. **23/10, linha823dd4b7…:**submissão atual registraMQL/is_mql=true. O RD consultado só mostra o evento Eletrovias de06/10, igualmente sem classificação no payload; os negócios encontrados pertencem a outras marcas. Não mudar a data do evento06/10 nem usar classificação global de outro negócio. Origem/TI deve expor a submissão real23/10 e sua classificação, preservando ambos os eventos.

A outra divergência de data está explicada: linha9e3000d4… registra nova captação13/10, mas a negociação`6ac6e46d135f580001ec8a2a` e o primeiro formulário condicional são de07/10. Manter data comercial07/10 paraMQL conforme contrato; recaptura13/10 permanece como evento distinto. Não é motivo para deslocar o negócio.

**Mapa histórico, superado pela autorização de avançar acima:**mídia encerrada → origem/TI trata os casos identificados e expõe classificação real da LP → conferir somente esses retornos → uma validação autenticada Marketing/PDF → apresentar resultado e obter aceite antes de ativar. Se houver intenção de publicar com exceções, decidir isso explicitamente; não descartar pessoas ou aplicar fallback silencioso. IDs completos/agregados em `investigation_2026_10_27` da auditoria. Nenhum material foi enviado ao Maicon.

## Contrato preparado

- Toda negociação criada no CRM é MQL. Sem qualificação por capital, etapa, funil ou status. Deduplicação por pessoa existente nas telas preservada; quantidade de negócios é um grão diferente.
- Data MQL do CRM, com criação original como fallback explícito. Captações `eletrovias_multistep` conservam classificação observada; ausência continua desconhecida. Não inventar perfil, contato ou formulário.
- Outubro/2026, marca Eletrovias. Histórico anterior, demais marcas, SQL/SAL/fechamentos e fontes/páginas de Vendas permanecem atuais.
- Consumidores preparados: Visão Geral, Saúde da Marca (inclusive campanhas/conjuntos/anúncios), Meta & OKRs e S&OP/PDF. A S&OP aguarda a leitura e impede exportação com erro/timeout; não transforma falha em zero. Fontes de termos/social/email e Esteira Oral não são migradas.
- Frontend consulta apenas `/api/eletrovias-ouro/v1/read`; gateway consulta exclusivamente duas views ouro propostas. O SQL **local** das views expõe os vínculos de contato normalizados já existentes na prata, como nas migrações anteriores. Não é alegação de que essas views já existam ou tenham sido criadas.
- Gateway proposto: `dashboard_eletrovias_ro`, TLS verify-full, transações READ ONLY, SQL fixo, sessão/permissões Marketing a cada pedido, cache limitado a cinco minutos. A carga horária existente não muda.

## Fotografia da preparação de 1–27/10 — histórico

| Medida | Base atual | Candidata ouro identificada |
|---|---:|---:|
| Contatos, deduplicação atual |1.304|1.342|
| MQLs, deduplicação atual |480|543|
| Investimento, cinco campanhas |R$22.223,33|R$23.763,15|

A candidata identificada é **diagnóstica**, não liberada. Há ainda **um negócio sem vínculo de contato**, `6ad18c51de18d10020db5411`, de15/10, sem nenhuma linha em `prata.crm_negocio_contatos` na conta consultada. Ele não foi excluído da consulta nem transformado em uma pessoa fictícia: o gateway rejeita a resposta integral com `commercial_identity_incomplete`. O total técnico com essa linha seria544, que não deve ser apresentado como544 pessoas MQL.

São534 negócios CRM,536 linhas comerciais (negócio pode ter mais de um contato), mais captações. O total543 de pessoas MQL segue a ordenação/deduplicação existente, não534 negócios nem a contagem antes de deduplicar. A comparação foi paginada integralmente e usa identidades somente em memória; evidência versionada contém agregados e IDs técnicos.

## Pendências iniciais — superadas em parte pela investigação acima

1. **Cobertura/identidade:**20 contatos atuais sem correspondência na candidata,22 linhas, incluindo7 MQLs. Um deles é a importação vinculada ao negócio sem contato acima. Os emails consultados não foram encontrados na view de candidatos da ouro, mesmo fora de outubro/marca. Isso não prova ausência no RD, que não foi consultado. IDs e datas constam da auditoria. Há duas diferenças de data: uma data CRM07/10 versus referência13/10; uma captação ouro06/10 versus referência23/10. Preservar proveniência e pedir confirmação da origem, sem alterar datas para fechar totais.
2. **Classificação da origem:**89 contatos deduplicados sem classificação na candidata. Três já eram MQL na referência: IDs `78138be8-2c74-43b6-be2b-ffcae5069446`, `823dd4b7-de09-4261-820a-6876c73fe841` (23/10) e `6b9da848-ab60-4c41-816b-acacecf96c72` (27/10). Não requalificar no dashboard: a origem deve expor a classificação da LP ou o vínculo real com negociação. Na leitura de cobertura, os eventos com qualificação explícita terminam23/10; os eventos sem classificação chegam27/10. Isso identifica uma lacuna de exposição, não comprova falha integral da carga.
3. **Investimento:**diferença deR$1.539,82 no total; R$1.531,66 em01–26, dias encerrados. Mesmas cinco campanhas, nível anúncio, BRL. Não atribuir toda a diferença ao horário. Conciliação com Meta/Google ainda não executada nesta entrega; propor conferir os IDs/dias antes do aceite, sem alterar campanhas ou valores manualmente.

A carga automática publicou durante a auditoria:16 das36 ausências iniciais passaram a ter correspondência. A fotografia acima substitui a primeira (537 MQLs identificados). Nenhuma intervenção na carga; atualização não prova completude da origem.

## Campanhas preparadas

| Plataforma / conta | ID | Campanha |
|---|---|---|
| Google2319926905 |23778217190|01 - [Eletrovias] [Ongoing] [MQL] [Search] [Fundo Funil] [Genéricos]|
| Meta2424035941347251 |52585384013024|Aquisição fria — WSL/PERPETUO/ELETRO|
| Meta2424035941347251 |52671387111024|ELETROVIAS_FUNDO_LEADS_AON - MQL|
| Meta2424035941347251 |52682815187224|ELETROVIAS_REMARKETING - MQL|
| Meta2424035941347251 |52683550378024|ELETROVIAS_FORMS_AON - MQL|

Nomes exatos da referência são usados somente para substituir as linhas dessas campanhas; IDs/contas/plataforma são validados no gateway. Outras campanhas não são absorvidas por semelhança de nome.

## Histórico — validação anterior ao aceite das exceções

Suíte frontend completa,22 testes direcionados,11 testes gateway e build com flag de prévia aprovados. Lint sem erros, com avisos existentes. Cobertura inclui preservação integral de outras marcas/histórico, rotas e clientes de Vendas nativos, paginação, precisão de mídia, autenticação, ausência de identidade e rejeição de contrato/escopo incorreto.

**Na preparação inicial, telas e PDF ainda não estavam homologados. Esse gate foi concluído na validação registrada no topo.** O controlador perdeu a página da janela isolada e a reabertura não conseguiu controlá-la. Não foi solicitado novo login, pois a identidade incompleta já bloqueia a candidata. O gateway temporário foi encerrado e a prévia voltou às flags anteriores.

Mapa inicial histórico, superado pela decisão/QA no topo: mídia encerrada; resolver origem/identidade/classificação antes da validação final e aceite. Não reabrir auditorias de outras marcas. Rollback futuro do consumo: desabilitar somente a flag Eletrovias e publicar pelo fluxo normal, sem apagar importações/fatos.

Evidência: [auditoria agregada](../../docs/audits/2026-10-27-eletrovias-ouro.json). Nenhum envio ao TI/Maicon realizado.
