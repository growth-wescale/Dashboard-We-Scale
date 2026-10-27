# Legacy — integração ouro em revisão (27/10/2026)

PR276 em rascunho. **Não publicar: a conferência encontrou pendências de origem e a homologação dos números/PDF está bloqueada.** Outubro é o recorte inicial; histórico anterior, comunidade, consultoria manual, RD, fatos do DW, Vendas e demais marcas permanecem preservados. Oral Unic será outra entrega.

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

## Próximo passo único

Resolver o conjunto delimitado de origem: expor vínculo dos dois novos negócios, localizar a captação ausente, decidir o conflito de marca da importação e conciliar as três campanhas. Nenhuma correção de RD/fatos está autorizada ou foi feita nesta entrega. Depois, uma única repetição da matriz Marketing/PDF; apresentar para aceite antes de instalar gateway definitivo/ativar/deploy. Não reabrir auditorias de Partner/Lisô/Beauty.
