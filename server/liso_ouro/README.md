# Leitura Lisô / Beauty — prévia de 27/10/2026

Integração no PR275 em rascunho, sem merge/deploy. Flag `VITE_LISO_OURO_ENABLED` desligada por padrão, ativa somente na prévia local. Duas views próprias de leitura instaladas na ouro; fatos, RD, coletores e fontes de Vendas não foram alterados. Beauty continua separada de Lisô; o card de inscrições já publicado pelo PR272 permanece intacto.

## Resultado da prévia autenticada

- Visão Geral, Saúde (visão geral/campanhas/conjuntos/anúncios), Meta & OKRs/Missão e S&OP acessados no Chrome isolado autenticado. Exportação real de nove páginas; folha Lisô revisada visualmente, incluindo Beauty e capital.
- Corte 01–27/10: ouro e consumidor conferem **102 contatos Lisô / 85 MQLs / R$25.673,14**; Beauty **18 negócios MQL / 18 contatos / R$5.556,46**. Não comparar esses contatos com os 59 negócios do recorte comercial encerrado de 01–23/10.
- Campanhas Lisô conservam85 MQLs:79 Meta,2 Google por ID exato,4 sem correspondência na mídia do recorte. Conjuntos/anúncios conservam o total, mantendo ausências explícitas. Removido somente para Lisô opt-in o rateio de MQLs por leads/gasto da plataforma.
- UTMs de conjunto/anúncio e capital já existentes são transportados pelas novas views; capital não qualifica/desqualifica ninguém. Valores ausentes permanecem não informados. Nenhuma escrita nos fatos.
- Beauty informa o próprio período e todas as origens; o filtro de origem do funil principal não é aplicado ao bloco independente do evento.
- S&OP conserva as regras existentes: semana19–25/10 com31 MQLs; MTD85 MQLs/5 SQLs pela união de eventos. Saúde tem4 SQLs pela regra atual da página. Não alterar regras comerciais para forçar igualdade. Histórico setembro mantém fonte anterior.
- Meta & OKRs teve timeout transitório na primeira tentativa e carregou integralmente na repetição. Nenhum limite de tempo ou regra de consulta foi alterado. Não é teste de carga/SLA.
- Build e858 testes frontend aprovados; seis testes de gateway já aprovados. Testes de isolamento cobrem rotas comerciais, outras marcas, histórico e flag independente. Sem nova homologação integral das telas de Vendas ou das plataformas de anúncios.

## Limite técnico antes de publicar

A prévia usa servidor local autenticado com SELECTs fixos nas duas views ouro via Metabase, chave apenas no servidor. A role `dashboard_liso_ro`, TLS/READ ONLY e gateway definitivo em `app.py` ainda precisam de instalação e validação no ambiente de destino; não foram simulados como já instalados. Anônimo401 confirmado na prévia. A publicação exige autorização específica, implantação controlada do gateway, conferência de autenticação/permissões e ativação da flag pelo commit integrado. Não reabrir as auditorias comerciais encerradas.

PR: https://github.com/growth-wescale/Dashboard-We-Scale/pull/275. PDF privado gerado pela própria prévia: `~/.config/wescale/liso-preview-artifacts/sop-marketing.pdf`; não versionar PDF/contatos/sessão. Reversão do consumidor: flag Lisô false.

## Regra fechada em27/10

**Todo deal criado no CRM é MQL.** Perda, etapa atual, capital, formulário ou ausência de flag de captação não o desqualificam. CRM prevalece quando há vínculo confirmado; sem negócio vinculado, a LP/formulário conserva sua classificação. A existência do negócio encerra a qualificação dos17 casos já conciliados: falta apenas transportar seu vínculo, não provar MQL novamente.

Beauty tem seus próprios MQLs comerciais, separados dos de Lisô. Inscrição e presença continuam métricas distintas. Não somar negócios e pessoas: um negócio pode ter dois contatos, e um contato pode ter vários negócios. Reciclagem não cria novo negócio.

`crm.sql` lê um negócio por conta/ID, selecionando estado/ciclo atual, sem exigir passagem Novo MQL. Preserva data MQL existente e expõe a criação separadamente; se a data MQL faltar, usa criação com proveniência explícita. `marketing.sql` combina captação e CRM por ID exposto pela ouro; nenhum vínculo é inventado por nome/capital/data. A função local aceita evidência de deal resolvido pelo contrato e dá precedência ao CRM. O transporte está ligado aos hooks opt-in; a flag é ativa somente na prévia. Gateway definitivo ainda não instalado.

## Mapa fechado da transição

| Etapa | Entrega e critério de conclusão | Estado27/10 |
|---|---|---|
| 1. Regra e população | CRM criado=MQL;59 negócios Lisô e18 Beauty no corte01–23/10, sem dupla contagem de ciclos | Concluída; SELECT vivo confirmou59/59 e18/18 MQLs |
| 2. Integração Marketing | Expor vínculo contato–negócio na leitura ouro e ligar consumidor isolado; manter dedupe/datas de cada página, origem LP sem deal e Beauty separado | Concluída na prévia; duas views instaladas, consumidor e Beauty conferidos |
| 3. Aceite único antes da publicação | Conferir Visão Geral, Saúde/campanhas, S&OP/PDF e OKRs/Missão; mesmas identidades/datas, mídia por campanha, zero alterações em Vendas/outras marcas; apresentar resultado ao usuário | Prévia autenticada conferida; resultado apresentado antes da publicação |

**Limite:** esta entrega migra o período homologado de outubro. Histórico anterior continua na fonte atual, sem ampliar escopo para reconstituir meses antigos. Reutilizar as provas comerciais e das quatro campanhas já feitas; dados novos entram como atualização do lote, não como reinício da homologação. A alteração de valores de mídia anotada em26/10 fica em uma comparação de corte único na etapa3, sem reabrir qualificação ou ajustar fatos. Novas inconsistências só bloqueiam publicação se afetarem identidade, regra, período, atribuição ou integridade; ajustes de perfil/histórico ficam fora desta entrega. Não publicar enquanto houver diferença material sem explicação ou QA faltante. Não iniciar novas rodadas genéricas de auditoria.

## Consultas preparadas

- `crm.sql`: negócio criado=MQL, segmentos Lisô/Beauty, um negócio por ID, datas separadas.
- `marketing.sql`: composição de captação e CRM; precedência do deal confirmado.
- `captacoes.sql`: ocorrência, contato, data de captação, classificação e proveniência já expostas na ouro; sem classificação nova.
- `midia.sql`: quatro pares conta/campanha homologados, canal e nível anúncio; Beauty separado, sem incluir o restante da conta Holding. Preserva métricas ausentes, moeda e estado de elegibilidade; consumidor futuro deve rejeitar dados inválidos, sem converter em zero. Somar precisão original e arredondar apenas na apresentação.
- `beauty.sql`: reutiliza `ouro.vw_beauty_inscricoes_dia`. Mantém inscrição distinta de MQL e presença; consumidor publicado segue limitado a outubro/2026.

`crm.sql`, `marketing.sql`, `captacoes.sql` e `midia.sql` são SELECTs. `views.sql` cria/substitui somente as duas views próprias e contém provisionamento separado da role; a seção da role não foi executada. Nenhum script escreve fatos. Datas de tipo DATE são dias civis; não reconverter meia-noite UTC devolvida pelo Metabase para BRT. Limitar as consultas ao período solicitado no servidor futuro, com parâmetros, autenticação e role somente leitura. Credencial Metabase nunca deve ir ao navegador.

## Evidência e limites da leitura

Em27/10, SELECT final executado na ouro para criação01–23/10 BRT: Lisô59 negócios únicos/59 MQLs (30 atualmente perdidos); Beauty18 negócios únicos/18 MQLs (5 atualmente perdidos). Todos têm data MQL exposta. Perda não retirou ninguém do MQL. Esses são negócios, não o total de contatos deduplicados das páginas. Inscrições Beauty publicadas permanecem separadas.

Os números abaixo são a fotografia anterior de captação/mídia; não substituem o novo contrato comercial:

No recorte captação Lisô de01–23/10, consulta agregada da ouro retornou49 ocorrências com MQL observado true (47 contatos nesse grupo),17 false e22 sem classificação. **As22 permanecem sem classificação**, mesmo contendo faixas de capital. Esses grupos não são o KPI final deduplicado de Marketing nem equivalem aos17 casos da auditoria anterior. Não somar contatos dos grupos sem verificar sobreposição.

Nova leitura de mídia da ouro para01–22/10, por conta/campanha, retornou:

| Campanha | Ouro, precisão original | Referência plataforma da conciliação anterior |
|---|---:|---:|
| Meta Lisô120249196601180044 | 18498.25 | 18498.20 |
| Meta Beauty120250473527040783 | 4756.45 | 4756.13 |
| Google institucional23604680552 | 1485.378634 | 1485.38 |
| Google YouTube24118318500 | 1301.486846 | 1301.55 |

As plataformas não foram relidas nesta rodada. A ouro mudou desde a conciliação anterior; o aceite específico deR$0,05 não certifica automaticamente este novo estado. Os totais acima são uma nova referência para confrontar, não valores corrigidos nem divergência atual confirmada contra plataformas. A rodada adicional de consultas detalhadas expirou; não se afirma nova prova de unicidade ou comparação simultânea com a base atual.

## Conferência dos consumidores

| Superfície | Caminho atual conferido no código | Gate para a troca |
|---|---|---|
| Visão Geral | useMarketingLeads/useMarketingMediaData, comparativos mensais | Mesmas pessoas, classificação da origem, datas e histórico |
| Saúde da Marca | Mesmos hooks; canais/campanhas/conjuntos/anúncios | Atribuição por IDs e métricas ausentes; perfis e filtros |
| S&OP e PDF | useSopLeads, mídia Marketing, funil Marketing e useBeautyInscricoes | Preservar união de eventos, dados comerciais e card Beauty publicado; conferir tela/PDF |
| Meta & OKRs / Missão Impossível | useMissaoResumo → consultarMissao; consultas próprias de leads/mídia | Não esquecer esse consumidor nem mudar metas/receita/fontes de Vendas |
| MetaCopaB2B | Hooks Marketing; rota antiga redireciona para OKRs | Manter compatibilidade se componente voltar a ser montado |
| GP Setembro e TV | Histórico e hooks comerciais próprios | Não migrar história nem fontes comerciais implicitamente |
| Distribuição de Leads | Operação própria de distribuição | Fora da troca analítica; sem ações operacionais |

Rotas /cadencias, /analise-termos e /esteira-oral-unic redirecionam para as páginas acima. Vendas, fontes Partner, metas e demais marcas permanecem nas implementações atuais. O bloqueio anterior da ferramenta de navegador foi contornado com Chrome isolado; a evidência atual é a prévia autenticada, não produção.

## Publicação posterior

As duas views de vínculo/mídia já existem e foram confirmadas no catálogo. Não executar novamente o arquivo completo: a role precisa de provisionamento próprio e credencial fora do Git. O gateway definitivo deve usar `dashboard_liso_ro`, TLS verify-full e transações READ ONLY, consultas fixas e permissões vivas. Preservar a cadência atual da ouro. Não ativar proxy/flag de produção sem autorização.
