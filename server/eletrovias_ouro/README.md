# Eletrovias — preparação Marketing, 27/10/2026

**Preparado, não publicado e não homologado para ativação.** Branch `codex/eletrovias-ouro-preparacao` sobre main `b5b2621`. A flag `VITE_ELETROVIAS_OURO_ENABLED` continua ausente/desligada no deploy. Nenhuma view, role ou gateway foi instalado; nenhum dado do RD, fato do DW, importação ou fonte de Vendas foi alterado.

## Contrato preparado

- Toda negociação criada no CRM é MQL. Sem qualificação por capital, etapa, funil ou status. Deduplicação por pessoa existente nas telas preservada; quantidade de negócios é um grão diferente.
- Data MQL do CRM, com criação original como fallback explícito. Captações `eletrovias_multistep` conservam classificação observada; ausência continua desconhecida. Não inventar perfil, contato ou formulário.
- Outubro/2026, marca Eletrovias. Histórico anterior, demais marcas, SQL/SAL/fechamentos e fontes/páginas de Vendas permanecem atuais.
- Consumidores preparados: Visão Geral, Saúde da Marca (inclusive campanhas/conjuntos/anúncios), Meta & OKRs e S&OP/PDF. A S&OP aguarda a leitura e impede exportação com erro/timeout; não transforma falha em zero. Fontes de termos/social/email e Esteira Oral não são migradas.
- Frontend consulta apenas `/api/eletrovias-ouro/v1/read`; gateway consulta exclusivamente duas views ouro propostas. O SQL **local** das views expõe os vínculos de contato normalizados já existentes na prata, como nas migrações anteriores. Não é alegação de que essas views já existam ou tenham sido criadas.
- Gateway proposto: `dashboard_eletrovias_ro`, TLS verify-full, transações READ ONLY, SQL fixo, sessão/permissões Marketing a cada pedido, cache limitado a cinco minutos. A carga horária existente não muda.

## Comparação final de 1–27/10 (BRT)

| Medida | Base atual | Candidata ouro identificada |
|---|---:|---:|
| Contatos, deduplicação atual |1.304|1.342|
| MQLs, deduplicação atual |480|543|
| Investimento, cinco campanhas |R$22.223,33|R$23.763,15|

A candidata identificada é **diagnóstica**, não liberada. Há ainda **um negócio sem vínculo de contato**, `6ad18c51de18d10020db5411`, de15/10, sem nenhuma linha em `prata.crm_negocio_contatos` na conta consultada. Ele não foi excluído da consulta nem transformado em uma pessoa fictícia: o gateway rejeita a resposta integral com `commercial_identity_incomplete`. O total técnico com essa linha seria544, que não deve ser apresentado como544 pessoas MQL.

São534 negócios CRM,536 linhas comerciais (negócio pode ter mais de um contato), mais captações. O total543 de pessoas MQL segue a ordenação/deduplicação existente, não534 negócios nem a contagem antes de deduplicar. A comparação foi paginada integralmente e usa identidades somente em memória; evidência versionada contém agregados e IDs técnicos.

## Pendências delimitadas antes do aceite

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

## Validação e próximo passo

Suíte frontend completa,22 testes direcionados,11 testes gateway e build com flag de prévia aprovados. Lint sem erros, com avisos existentes. Cobertura inclui preservação integral de outras marcas/histórico, rotas e clientes de Vendas nativos, paginação, precisão de mídia, autenticação, ausência de identidade e rejeição de contrato/escopo incorreto.

**Telas autenticadas e PDF não homologados nesta entrega.** O controlador perdeu a página da janela isolada e a reabertura não conseguiu controlá-la. Não foi solicitado novo login, pois a identidade incompleta já bloqueia a candidata. O gateway temporário foi encerrado e a prévia voltou às flags anteriores.

Mapa de conclusão: decidir/tratar os três blocos acima → uma validação final autenticada de Marketing/PDF → apresentar resultado e obter aceite de publicação → somente então instalar gateway/views restritos e ativar. Não reabrir auditorias de outras marcas. Rollback futuro do consumo: desabilitar somente a flag Eletrovias e publicar pelo fluxo normal, sem apagar importações/fatos.

Evidência: [auditoria agregada](../../docs/audits/2026-10-27-eletrovias-ouro.json). Nenhum envio ao TI/Maicon realizado.
