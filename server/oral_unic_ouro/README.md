# Oral Unic — candidata Marketing, 27/10/2026

**Integração desativada em produção.** PR283 incorporou o recorte em68aee37; o deploy automático anterior não habilitou a flag Oral. Views/role/gateway definitivos permanecem apenas preparados. Prévia local autenticada executa SELECTs fixos read-only.

## Correções de consumo validadas — 27/10

Branch `codex/oral-unic-esteira-sop-fix`, baseada na main68aee37. A Esteira troca somente as três campanhas aprovadas de Oral Unic pela ouro, por cliente exclusivo sobre a fonte nativa; consultoria, comunidade, V4, histórico e demais marcas permanecem nessa referência. Cache separado e erros explícitos impedem mistura ou zero silencioso. Não reutilizar a cadeia de todos os providers nesta página, pois migraria também a consultoria.

S&OP/PDF exclui somente as campanhas Google24054007136 e24054143009 do filtro Franquia, em outubro/com flag ativa. IDs/conta têm precedência; fallback de nome exato só na referência sem ID. Elas permanecem na fonte e no slide Legacy. Regras históricas/V4 e outras marcas não mudam.

Prévia autenticada: Esteira e Saúde/Franquia mostramR$4.131 no corte01–27. ConsultoriaR$14.622,48 e ComunidadeR$7.169,51 coincidem com sua fonte nativa no momento da leitura. S&OP/PDF19–25: investimentoR$2.175,51 (antesR$4.610,60), cinco MQLs eCP-MQLR$435,10 (antesR$922,12);19 MQLs no mês preservados. PDF novo de nove páginas renderizado/revisado; Legacy137 MQLs e192 membros mantidos.

911 testes/82 arquivos,29 direcionados, build com flags de prévia e lint sem erros aprovados. Nenhuma escrita RD/fatos/views, mudança em Vendas, serviço, flag de produção, merge ou deploy. Os três casos ficam com Maicon e não bloqueiam este QA. Restam aceite e validação/instalação do gateway definitivo antes da ativação; não reabrir qualificação ou conciliação comercial. Evidência agregada: `consumer_fix_validation` em `docs/audits/2026-10-27-oral-unic-ouro.json`.

## Histórico da preparação e da primeira validação

As seções abaixo registram os cortes e gates anteriores; os dois problemas de consumo foram encerrados na validação acima. Observações existentes fora do ajuste (NaN/Infinity com denominador zero em Comunidade/V4, Termos/Social nativos e E-mail sem integração) foram preservadas.

## Recorte aprovado e implementado localmente —27/10

Após autorização de Gabriel, o recorte analítico de Marketing foi ajustado em branch própria `codex/oral-unic-marketing-recorte`, sobre a maine48a4f2. PR279 havia sido incorporado externamente; este ajuste está no [PR283](https://github.com/growth-wescale/Dashboard-We-Scale/pull/283), em rascunho e sem publicação. O consumo permanece com flag Oral Unic desligada no deploy.

- Mesma regra por linha/mês em Visão Geral e gráfico CP-MQL, Saúde/Franquia e comparação, S&OP/PDF e Comunidade. Mapeamento exato dos cinco IDs auditados; nomes exatos são fallback somente para linhas antigas sem IDs. Restrito à marca Oral Unic e outubro, com histórico e flag desligada preservados.
- OUF+Google ficam em Franquia. GS/Avaliadores sai do numerador de aquisição/CP-MQL e ganha frente própria na Esteira. As duas CMD ficam em Comunidade; valores continuam presentes no total da marca. Esteira e demais consumidores conservam suas fontes atuais; este ajuste não migra novos conjuntos de dados.
- Nenhuma alteração de qualificação MQL, contatos, importações, views, gateway, RD, fatos ou Vendas. A main incorporada já continha alterações de Vendas de outro PR; elas não integram o diff deste ajuste.
- Testes de conservação: na fotografia já auditada, R$4.077,42 Franquia +R$1.781,76 Avaliadores +R$111,57 Comunidade =R$5.970,75, sem perda/duplicação entre os cinco IDs. O total geral da marca inclui também suas outras campanhas preservadas.
- 905 testes/build aprovados; lint sem erros (avisos existentes). Validação visual autenticada de Marketing e exportação real do PDF ficam para a próxima etapa solicitada; não foram repetidas nesta entrega.
- [Handoff para Maicon](../../docs/handoffs/2026-10-27-oral-unic-maicon.md): três casos/cinco IDs, evidências, limites e critério de retorno. Preparado para Gabriel encaminhar; não enviado ao Maicon.

Próximo: retorno de origem/TI sobre os três casos; depois uma única validação Marketing/PDF e aceite antes de publicar. Recorte e conciliação de mídia encerrados, regra CRM criado=MQL preservada.

## Contrato de origem

- Toda negociação criada no CRM é MQL, conforme confirmação explícita do usuário. A view de leitura expõe essa classificação e a proveniência. Frontend só lê a classificação e agrega; não qualifica por capital, formulário, etapa ou funil.
- Sem corte por funil na qualificação:19 negócios de outubro,19 contatos vinculados;11 SDR,5 Closer,2 Repasse,1 Funil de teste. O negócio do funil de teste está incluído, não desqualificado por inferência. Sua existência/origem fica explícita nesta proposta.
- Data de referência: data MQL fornecida pelo CRM; ausência usa criação original, com proveniência explícita. Os19 também têm criação em outubro. Reciclagem não cria outro negócio. Deduplicação de pessoas existente preservada; negócio e pessoa são grãos distintos, coincidentes neste recorte.
- Captações `oralunic_multistep` mantêm classificação observada da origem. Vínculo comercial confirma MQL; nenhuma faixa de capital é reinterpretada. Perfil/formulário ausente não é inventado.
- Leitura do dashboard exclusivamente nas duas views ouro propostas. Definição local da view expõe o vínculo de contato normalizado existente na prata; nenhum fato é alterado. SQL em `leads-source.sql`, `media-source.sql` e `views.sql` (não executado).
- Outubro é a janela preparada. Histórico anterior, comunidade, V4, Legacy, outras marcas, SQL/SAL/receita e todas as páginas/fontes de Vendas permanecem atuais. Nenhuma autorização de publicação ou exclusão de importações.

## Comparação no corte01–27/10

| Indicador no escopo substituído | Base atual | Candidata ouro |
|---|---:|---:|
| Linhas de contatos/captação |34|29|
| Pessoas por email |24|29|
| MQLs |8|19|

21/24 pessoas atuais encontradas na candidata; três ausentes, incluindo um MQL. Os19 MQLs são7 já classificados,4 pessoas antes como leads e8 contatos adicionais com negociação. Nenhum negócio sem vínculo de contato. Para as identidades em comum, a data candidata coincide com uma data da base atual. A auditoria usa hashes em memória e registra apenas IDs técnicos/agregados.

Cinco linhas atuais correspondem aos três contatos ausentes, todas do formulário `oralunic_multistep`:01/10 Lead,13/10 MQL e três ocorrências15/10 Lead. Não encontrados em `ouro.vw_leads_candidatos` por email em nenhum período/marca consultado. Não afirma ausência no RD; RD não foi acessado. IDs estão na auditoria JSON. Cobertura deve ser tratada na origem/TI antes de homologar migração integral, ou explicitamente aceita pelo usuário. Importações originais permanecem intactas.

130 linhas atuais de comunidade são preservadas. Contagens gerais Oral Unic incluem a comunidade e dedupe existente; não comparar153 pessoas da tela geral com29 pessoas do recorte de franquia como se fossem a mesma população.

## Investimento — fotografia da preparação, superada pela conciliação abaixo

| Campanha | Base atual | Ouro | Diferença |
|---|---:|---:|---:|
| OUF FUNDO_MQL_FRANQUIA_NOVA,120249498633040752 |R$3.896,29|R$4.059,40|R$163,11|
| GS Avaliadores,120246002967810752 |R$1.690,99|R$1.775,88|R$84,89|
| Google LEGACY Franchise marca,23324303426 |R$3,35|R$3,35|R$0,00|
| Total substituído |R$5.590,63|R$5.838,63|R$248,00|

Meta conta24763396173316651; Google9733883995. Nível exclusivo anúncio, BRL, sem filtro genérico `elegivel_kpi`. Diferença nos dias01–26:OUF R$169,72 eGS R$88,90; não explicar tudo por horário. **Não conciliado com APIs das plataformas nesta entrega.** Valores e segmentação dependem dessa conferência antes de aceite da publicação.

A interface Franquia já inclui duas campanhas `CMD Aquisição...Engajamento Whats` sem colchetes (R$111,57) por sua regra atual de nomes; preservadas na fonte atual. Por isso a prévia exibeR$5.950,20 (=R$5.838,63+R$111,57). Campanha ScalePartner com gasto0 também permanece atual. Nenhuma regra global de marca foi alterada. A campanha GS chama-se Avaliadores e a Google tem LEGACY no nome: IDs/valores estão conferidos entre bases, mas não se deve inferir finalidade de franquia ou alterar atribuição só pelo nome. Esta migração mantém os recortes existentes e explicita a questão para decisão.

## Validação e próxima decisão

896 testes frontend,11 gateway e build com flag candidata aprovados. Testes cobrem Vendas não interceptada, histórico, comunidade/COF/V4, outras marcas, paginação, autenticação, rejeição de escopo/identidade incorreta e precisão dos valores. Nenhuma exceção de identidade Legacy copiada para Oral Unic.

Prévia autenticada: Visão Geral e Saúde Oral Unic/Franquia (visão geral, campanhas, conjuntos e anúncios) mostraram19 MQLs, R$5.950,20 na frente Franquia e153 contatos gerais (inclui comunidade). A atribuição mantém5 MQLs na campanha OUF e14 sem correspondência exata, sem rateio proporcional. Meta & OKRs exibiu timeout de20s. Exportação PDF conjunto foi impedida por respostas503 do gateway Lisô já existente, sem novo PDF válido; S&OP Oral Unic/PDF completos permanecem não homologados. Não foi alterado/reiniciado esse serviço, nem reaberta auditoria de dados de Lisô. Nenhuma afirmação de gateway definitivo ou completude do RD. Falhas de leitura nas páginas e no PDF não devem virar zero/fallback silencioso. Termos/social/radar/email e fontes comerciais nativas não são migrados.

Próximos gates atualizados pela investigação abaixo: cobertura/identidade da origem, aceite do recorte de mídia e validação final. Valores de mídia já conciliados nas plataformas; instalar/validar views e gateway restritos somente após aceite. Não reabrir qualificação MQL; negócio criado é MQL. Uma validação final após a decisão, sem rodada de ajustes nos fatos. Evidência: `docs/audits/2026-10-27-oral-unic-ouro.json`.


## Histórico: investigação de27/10 — proposta apresentada antes do ajuste acima

Somente leitura: base atual, bronze/prata/ouro, GET nas contas RD Marketing/CRM existentes e APIs Meta/Google. Nenhuma escrita RD/fatos, alteração de serviços/campanhas, implementação adicional ou publicação. A versão de consumo do PR continua sendo a preparação anterior; as mudanças de recorte abaixo **não foram aplicadas**. Não repetir auditoria comercial ou QA nesta etapa documental.

### Três contatos: lacuna de cobertura e uma identidade ambígua

- **01/10, Lead** — linha330e95a0-8bdf-41ee-a4c5-53aa8927f917: presente na captação atual, ausente no DW por ID/email/telefone; RD Marketing404 e CRM sem resultados por email/telefone.
- **15/10, Lead** — três envios em23 segundos, mesmo email/contato (IDs completos na auditoria): presentes na base atual, ausentes no DW e nas consultas RD por email/telefone. Não são três pessoas, nem justificam apagar as submissões originais.
- **13/10, MQL** — linha34116817-65e7-4318-ab70-52c28bda1c81: a própria LP gravou `lead_type=MQL` e `is_mql=true`; não foi recalculado no dashboard. Email ausente no DW e nas consultas RD. Telefone com país55 encontra três contatos CRM anteriores, todos com nomes/emails diferentes; vínculos conhecidos têm negócios de junho a setembro. Isso **não prova** identidade única nem uma negociação nova de outubro. Não unir nem mover esses negócios de data/marca.

A cópia `prata.wescale_marketing_leads` contém16.070 linhas e termina em22/09 (última observação23/09), com nenhum dos cinco IDs. A leitura ouro não consegue recuperar registros que não chegaram a suas fontes. O404 limita-se à conta e identificadores consultados; não prova exclusão histórica nem causa da falha de entrega. Sem logs de envio vinculados aos IDs, não afirmar que a LP enviou ao RD ou por que não chegou.

**Proposta de origem/TI:** disponibilizar na ouro as submissões reais da LP com IDs/datas/classificação original; para o MQL13/10, confirmar a identidade e o vínculo comercial ou documentar a qualificação da LP com a proveniência correta. Preserve os cinco registros originais, sem criar contatos/negócios RD, apagar importações, mesclar por telefone ou alterar marcas. Isso depende de correção de cobertura na origem, não de ajuste manual nos fatos. A migração integral continua sem aceite; não acrescentar automaticamente um20º MQL.

### Valores conciliados: dias fechados idênticos

BRL, America/Sao_Paulo, mesmos IDs e dias. Leitura das plataformas iniciada10:56 BRT; ouro Meta carregada10:38 BRT.

| Campanha | Ouro01–26 | Plataforma01–26 | Diferença |
|---|---:|---:|---:|
| OUF120249498633040752 |R$4.013,91|R$4.013,91|R$0,00|
| GS/Avaliadores120246002967810752 |R$1.751,45|R$1.751,45|R$0,00|
| Google23324303426 |R$3,35|R$3,35|R$0,00|
| Total |R$5.768,71|R$5.768,71|R$0,00|

Paridade em cada dia, não apenas no total. Base atual01–26 somaR$5.510,07, R$258,64 abaixo; a divergência anterior é da referência atual versus plataforma, não erro no gasto ouro desses IDs. Incluindo27/10: base atualR$5.590,63; ouroR$5.859,18; plataformaR$5.882,38. Os R$23,20 residuais concentram-se exclusivamente no dia em andamento (OUF20,01/GS3,19); não propor ajuste manual por essa diferença de cortes. Estas são novas fotografias: osR$248 anteriores não eram um saldo fixo.

### Proposta de recorte em Marketing, sem mudar as marcas/fatos

- **Franquia:** OUF120249498633040752 → formulário nativo1476782897649731, `FRQ_OralUnic_Franquia_Condicional_v1_out26-copy`; Google23324303426 → anúncio786626548441 com osR$3,35 e destino [franquia Oral Unic](https://legacy.oralunic.com.br/franquia). A página viva confirma franquia; “LEGACY” no nome da campanha/domínio não justifica mover o gasto para consultoria.
- **Avaliadores, separado da franquia:** GS120246002967810752 usa formulário1777211366826702, `Form - Avaliadores-copy`, com perguntas de profissão/especialidade e experiência como dentista avaliador. Propor retirar esse gasto do CP-MQL de franquia, mantendo-o identificado na própria Oral Unic.
- **Comunidade:** CMD120249277805770752 e120249260819990752 somamR$111,57, idênticos na base atual/ouro/Meta. Anúncios de live/WhatsApp e objetivo engajamento confirmados. Entram em Franquia hoje porque a regra reconhece `[CMD]`, mas esses nomes usam `CMD` sem colchetes. Propor associação explícita pelos IDs no consumo Marketing; não renomear campanhas nem mudar fatos/marcas.

Com o recorte proposto, franquia01–27 teriaR$4.077,42 na fotografia ouro (OUF+Google), versusR$4.097,43 na leitura posterior das plataformas. GS e CMD continuam existentes, separados da franquia; o total investido da marca não é apagado. Os19 MQLs CRM da preparação não são recalculados por esta proposta.

**Mapa finito:** (1) aceite do recorte de mídia acima; (2) cobertura dos três contatos pela origem/TI e decisão da identidade ambígua; (3) após esses pontos, uma única validação Marketing/PDF, gateway e aceite de publicação. Valores de mídia e regra de MQL encerrados; sem repetir conferências já resolvidas. Evidência agregada na chave `investigation_2026_10_27` da auditoria JSON.
