# Legacy — integração ouro em revisão (27/10/2026)

PR276: publicação autorizada em27/10 enquanto Maicon resolve quatro exceções de origem. **As seções de conferência anteriores são históricas; não bloqueiam a migração autorizada.** Outubro é o recorte inicial; histórico anterior, comunidade, consultoria manual, RD, fatos do DW, Vendas e demais marcas permanecem preservados. Oral Unic será outra entrega.

## Publicação autorizada — preparação

- Correção da leitura recupera a qualificação comercial anterior ao mês, mantendo datas e população.
- Apenas os dois negócios sem contato já identificados são aceitos temporariamente: continuam no DW, classificados como negócios MQL, mas não viram contatos fictícios. O gateway devolve contagem técnica das exceções; outros casos inesperados ainda falham fechados. Quando a origem fornecer contato, a atualização normal passa a incluí-los sem novo de-para ou deploy.
- Captação ausente e conflito Oral Unic seguem na origem, sem apagar importações ou trocar marcas. O total pode mudar quando a ouro receber os ajustes; não há promessa de igualdade por simples soma.
- Investimento encerrado; não modificar coletores, campanhas, valores ou frequência.
- Gateway definitivo, QA de Marketing/PDF e publicação ainda serão conferidos nesta entrega.

## Implementado

- Duas views próprias instaladas em `ouro.vw_legacy_dashboard_leads` e `ouro.vw_legacy_dashboard_midia`, sem DML ou alteração de views compartilhadas. PUBLIC sem acesso. O vínculo de contato é exposto pela view ouro a partir dos relacionamentos normalizados existentes; o consumidor consulta somente ouro.
- Gateway separado, SQL fixo, autenticação/permissões, TLS/role restrita preparados. Gateway definitivo/role **não instalados**. Prévia local usa a API Metabase server-side e a mesma validação de escopo/identidade.
- `VITE_LEGACY_OURO_ENABLED` desativada por padrão e ausente do deploy. CI compila com flag ativa para testar. Rollback do consumidor: flag falsa.
- Substituição somente de leads Legacy e três campanhas identificadas de outubro. Marca interna de leads `Odonto Scale`; mídia conserva `Oral Unic` para os filtros existentes da conta compartilhada. Comunidade/franquia e outros meses não são substituídos.
- Saúde conserva campanhas/conjuntos/anúncios com atribuição por IDs exatos e categoria sem atribuição, sem distribuir MQL proporcionalmente ao gasto.
- Fontes de Vendas, snapshot manual da consultoria, comunidade/qualidade/ativos e metas não modificados.

## Conferência fechada desta rodada

Corte01–27/10/2026 BRT. Base atual tem151 linhas nos aliases Odonto Scale/Odonto Legacy e109 emails únicos. A projeção candidata tem165 linhas/152 emails únicos;132 emails com MQL. Estes são agregados de auditoria, **não KPIs homologados**: existem dois negócios sem contato, e a deduplicação/qualificação final das telas não foi aceita.

Dos109 contatos atuais,107 aparecem na projeção. Os dois ausentes foram rastreados:

1. Captação de13/10, formulário `odontoscale_multistep`: não localizada na captação ouro nem no vínculo CRM consultado. Não preencher com dado inventado nem apagar a importação.
2. Importação CRM de13/10, com aprovação manual de classificação de15/10: o negócio está hoje como Oral Unic/Closer na ouro. A aprovação de MQL não prova autorização para mudar a marca atual. Preservado, sem reatribuição automática.

Dois novos negócios Closer criados em26/10 estão na ouro sem relacionamento em `prata.crm_negocio_contatos`. A view expõe a ausência e o gateway rejeita com `commercial_identity_incomplete` (409); não cria contato sintético, não descarta silenciosamente negócio e não publica total parcial.

Há também20 linhas de captação sem classificação observada e sem deal vinculado no recorte da projeção. Não foram qualificadas por inferência. Todo deal confirmado é MQL; uma captação isolada não vira deal.

### Investimento

| Campanha | Conta | Base atual | Ouro |
|---|---|---:|---:|
| Meta120248355011530752 |24763396173316651|R$9.921,92|R$10.656,94|
| Google24054007136 |9733883995|R$2.282,36|R$2.643,82|
| Google24054143009 |9733883995|R$2.223,91|R$2.660,49|
| Total | |R$14.428,19|R$15.961,25|

Diferença R$1.533,06. Ambas as fontes têm registros até27/10; não atribuir tudo a um dia de atraso. Há34 combinações dia/canal/campanha em comum com diferença superior aR$0,011, eR$668,73 em combinações adicionais na ouro em22–23/10. Valores somados na precisão original. Esta rodada comparou base atual x ouro; **não reconfirmou as plataformas de anúncios**.

## Validação

- Build local com flag ativa aprovado;875 testes frontend e11 gateway aprovados.
- Testes cobrem rotas Vendas não interceptadas, outras marcas, meses anteriores, comunidade/franquia, cliente comercial nativo, paginação e erro de identidade sem fallback silencioso.
- Prévia autenticada acessada em Visão Geral, Saúde/Legacy (visão geral/campanhas/conjuntos/anúncios), Meta & OKRs e S&OP. Mídia retornou200; contatos incompletos retornaram409. A validação numérica está bloqueada; não declarar QA completo ou PDF válido.
- PDF deve falhar fechado quando Legacy não estiver íntegra; nenhum PDF parcial é entregável. O PDF de produção da entrega Lisô anterior não constitui evidência desta integração.

Evidência agregada: `docs/audits/2026-10-27-legacy-ouro.json`; sem nomes, emails, telefones ou segredos.

## Investigação complementar — 27/10, somente leitura

A referência do usuário é **135 MQLs de01–27/10**. Simulação SELECT corrigindo o filtro mensal antecipado do CRM produz **135 emails MQL**, contra132 da candidata instalada: três captações de outubro têm negócios Legacy qualificados em setembro. População165 linhas, IDs e datas permanecem idênticos; somente três qualificações recuperadas. A proposta remove o filtro mensal antes do vínculo e mantém os filtros finais do período. Não aplicada. Igualdade do agregado não homologa população completa nem UI/PDF.

Quatro casos encerrados quanto ao diagnóstico:

- Dois novos negócios Closer: GET do negócio e do endpoint de contatos confirma zero contatos vinculados no próprio RD. Ouro reproduz essa ausência. Não inventar contato, não eliminar negócio nem contar dois negócios como duas pessoas. Identidade precisa de decisão do responsável pela origem; qualquer escrita RD depende de autorização exata separada.
- Captação de13/10: registro original existe, com email/telefone preenchidos, mas ID ausente da cópia bronze/prata e identidade ausente na captação ouro. A cópia histórica `wescale_marketing_leads_current` cobre somente01/03–22/09, última carga23/09. Preservar registro atual; solicitar ao TI exposição/ingestão delimitada dessa origem para permitir migração integral. Não remendar fatos nem usar registros de comunidade que compartilhem um telefone.
- Importação Legacy de13/10: GET vivo confirma marca **Oral Unic** e um contato vinculado. Não alterar a marca para forçar paridade. Preservar fonte histórica e exigir decisão explícita de atribuição antes de substituir integralmente sua população.

Investimento conciliado diretamente pelas APIs Meta/Google em27/10 às07:14 BRT, moedaBRL/fusoAmerica/Sao_Paulo. A tabela anterior é um snapshot mais cedo; a coleta continuou automaticamente:

| Campanha | Base atual relida | Ouro | Plataforma |
|---|---:|---:|---:|
| Meta120248355011530752 |R$9.955,99|R$10.701,41|R$10.716,32|
| Google24054007136 |R$2.282,36|R$2.643,82|R$2.643,82|
| Google24054143009 |R$2.223,91|R$2.660,49|R$2.660,49|
| Total |R$14.462,26|R$16.005,72|R$16.020,63|

Google coincide na precisão original e por dia. Meta:01–26 ouroR$10.654,79/plataformaR$10.655,03; **residualR$0,24 aceito pelo usuário, sem nova conferência ou correção**. Em27/10, ouroR$46,62/plataformaR$61,29, observadas em horários distintos; diferença intradiáriaR$14,67. Não ajustar números para equalizar leituras de horários distintos. Proposta: consumir as três campanhas conciliadas na ouro, sem tocar campanhas nem os blocos manuais de consultoria/comunidade.

A revisão automática bloqueou a busca externa por email/telefone do caso de captação; ela não foi executada. O diagnóstico restante usou IDs/hashes nas bases existentes. Não houve alteração operacional nesta rodada; somente documentação e simulação SELECT. Código/PR276 continuam em `a771ab5`; este complemento documental ainda é local.

## Decisão anterior de aguardar a origem — superada pela autorização de migrar

Decisão posterior de27/10: investimento integralmente encerrado pelo usuário, inclusive a diferença de horário; nenhuma intervenção ou nova conciliação. Maicon é o responsável pela origem/TI, segundo Gabriel; Gabriel encaminhará os quatro casos pelo Teams. Envio e resposta ainda não comprovados. Solicitar identificação dos contatos reais, cobertura da captação por ID e confirmação da atribuição atual/histórica; nenhuma autorização de escrita RD/fatos. Após resolução, uma única validação Marketing/PDF, sem publicar.

Aprovar a correção delimitada da leitura e definir com a origem o tratamento dos dois negócios sem identidade e das duas exceções da base atual. Não publicar migração integral incompleta nem remover o bloqueio para ocultar ausência. Depois da cobertura aprovada, executar uma única matriz Marketing/PDF e apresentar antes de instalar gateway definitivo/ativar/deploy. Não reabrir qualificação comercial, conciliação de mídia ou auditorias encerradas de Partner/Lisô/Beauty. Oral Unic permanece entrega separada.
