# Oral Unic — candidata Marketing, 27/10/2026

**Preparada, não publicada.** Flag `VITE_ORAL_UNIC_OURO_ENABLED` desligada por padrão e ausente do deploy. Views/role/gateway definitivos não instalados. Prévia local autenticada executa SELECTs fixos read-only; produção segue inalterada. Base Git inicial83c5fc0; branch própria `codex/oral-unic-ouro-preparacao` alinhada à main publicadafc4ea45 (PR278). Preparação no [PR279](https://github.com/growth-wescale/Dashboard-We-Scale/pull/279), em rascunho; demais propostas ainda não publicadas de outro chat permanecem separadas.

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

## Investimento

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

Para publicar: decidir cobertura dos três contatos ausentes, conciliar as duas diferenças de mídia e confirmar escopo das campanhas; instalar/validar views e gateway restritos somente após aceite. Não reabrir qualificação MQL; negócio criado é MQL. Uma validação final após a decisão, sem rodada de ajustes nos fatos. Evidência: `docs/audits/2026-10-27-oral-unic-ouro.json`.
