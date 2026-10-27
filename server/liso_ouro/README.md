# Preparação de leitura Lisô / Beauty — 27/10/2026

Estado27/10: integração de transporte Marketing implementada localmente no PR275, com flag `VITE_LISO_OURO_ENABLED` desligada por padrão. Gateway e duas views de leitura preparados, **não instalados**. Sem novo deploy e sem homologação visual. A publicação Beauty existente (PR272) é preservada. Branch `codex/liso-ouro-preparacao`; arquivos anteriores preservados.

O cliente opt-in de Marketing compõe a leitura Lisô sobre o cliente Partner existente, sem mudar os clientes de Vendas. Somente leads/mídia, cinco rotas Marketing e outubro/2026 são substituídos. Outras marcas, períodos e consultas de escrita seguem nativos. Resposta ouro inválida falha explicitamente. A inscrição Beauty mantém o gateway publicado; seus negócios/mídia são segmentados como Beauty Connection, não somados ao núcleo Lisô. A apresentação completa do segmento nas telas ainda precisa de aceite na prévia.

`views.sql` expõe contato–negócio através de view ouro que lê os vínculos já existentes na prata (padrão usado em Partner); não altera fatos. O aplicativo consulta exclusivamente as duas views ouro. O SELECT do vínculo foi executado sem criar objetos:01–23/10,18 linhas Beauty/18 identidades de email e84 linhas Lisô/82 identidades de email, sem identidade ausente nem ID duplicado. São linhas de consumo incluindo captações sem deal, não novos totais de negócios. A classificação comercial59/18 permanece encerrada.

Testes desta integração:855 testes da suíte passaram, depois16 testes direcionados passaram com mais um caso de independência da flag Lisô. Seis testes do gateway passaram. Build com flags Partner e Lisô ativas aprovado; nenhuma flag de produção alterada. SQL do vínculo válido e contagens agregadas conferidas. Não equivale a dados renderizados em tela/PDF.

PR: https://github.com/growth-wescale/Dashboard-We-Scale/pull/275 (rascunho, sem merge). Restam instalação isolada para prévia, validação da apresentação Beauty e QA autenticado/PDF. O usuário moveu o chat para o projeto Dashboard, mas o cwd antigo persistiu. A worktree já anexada foi reanexada para atualizar o cwd; o runtime do navegador ainda recebeu o caminho antigo nesta execução, mesmo após reset. Não refazer auditorias de negócio por esse impedimento de ferramenta.

## Regra fechada em27/10

**Todo deal criado no CRM é MQL.** Perda, etapa atual, capital, formulário ou ausência de flag de captação não o desqualificam. CRM prevalece quando há vínculo confirmado; sem negócio vinculado, a LP/formulário conserva sua classificação. A existência do negócio encerra a qualificação dos17 casos já conciliados: falta apenas transportar seu vínculo, não provar MQL novamente.

Beauty tem seus próprios MQLs comerciais, separados dos de Lisô. Inscrição e presença continuam métricas distintas. Não somar negócios e pessoas: um negócio pode ter dois contatos, e um contato pode ter vários negócios. Reciclagem não cria novo negócio.

`crm.sql` lê um negócio por conta/ID, selecionando estado/ciclo atual, sem exigir passagem Novo MQL. Preserva data MQL existente e expõe a criação separadamente; se a data MQL faltar, usa criação com proveniência explícita. `marketing.sql` combina captação e CRM por ID exposto pela ouro; nenhum vínculo é inventado por nome/capital/data. A função local aceita evidência de deal resolvido pelo contrato e dá precedência ao CRM. O transporte está ligado aos hooks opt-in através da flag local desligada; ainda não há serviço instalado para uso real.

## Mapa fechado da transição

| Etapa | Entrega e critério de conclusão | Estado27/10 |
|---|---|---|
| 1. Regra e população | CRM criado=MQL;59 negócios Lisô e18 Beauty no corte01–23/10, sem dupla contagem de ciclos | Concluída; SELECT vivo confirmou59/59 e18/18 MQLs |
| 2. Integração Marketing | Expor vínculo contato–negócio na leitura ouro e ligar consumidor isolado; manter dedupe/datas de cada página, origem LP sem deal e Beauty separado | Código local preparado; instalar leitura de prévia e conferir apresentação, sem reabrir qualificação dos17 casos |
| 3. Aceite único antes da publicação | Conferir Visão Geral, Saúde/campanhas, S&OP/PDF e OKRs/Missão; mesmas identidades/datas, mídia por campanha, zero alterações em Vendas/outras marcas; apresentar resultado ao usuário | Pendente de integração e navegador funcional |

**Limite:** esta entrega migra o período homologado de outubro. Histórico anterior continua na fonte atual, sem ampliar escopo para reconstituir meses antigos. Reutilizar as provas comerciais e das quatro campanhas já feitas; dados novos entram como atualização do lote, não como reinício da homologação. A alteração de valores de mídia anotada em26/10 fica em uma comparação de corte único na etapa3, sem reabrir qualificação ou ajustar fatos. Novas inconsistências só bloqueiam publicação se afetarem identidade, regra, período, atribuição ou integridade; ajustes de perfil/histórico ficam fora desta entrega. Não publicar enquanto houver diferença material sem explicação ou QA faltante. Não iniciar novas rodadas genéricas de auditoria.

## Consultas preparadas

- `crm.sql`: negócio criado=MQL, segmentos Lisô/Beauty, um negócio por ID, datas separadas.
- `marketing.sql`: composição de captação e CRM; precedência do deal confirmado.
- `captacoes.sql`: ocorrência, contato, data de captação, classificação e proveniência já expostas na ouro; sem classificação nova.
- `midia.sql`: quatro pares conta/campanha homologados, canal e nível anúncio; Beauty separado, sem incluir o restante da conta Holding. Preserva métricas ausentes, moeda e estado de elegibilidade; consumidor futuro deve rejeitar dados inválidos, sem converter em zero. Somar precisão original e arredondar apenas na apresentação.
- `beauty.sql`: reutiliza `ouro.vw_beauty_inscricoes_dia`. Mantém inscrição distinta de MQL e presença; consumidor publicado segue limitado a outubro/2026.

Nenhuma das consultas cria objetos ou escreve fatos. Datas de tipo DATE são dias civis; não reconverter meia-noite UTC devolvida pelo Metabase para BRT. Limitar as consultas ao período solicitado no servidor futuro, com parâmetros, autenticação e role somente leitura. Credencial Metabase nunca deve ir ao navegador.

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

Rotas /cadencias, /analise-termos e /esteira-oral-unic redirecionam para as páginas acima. Vendas, fontes Partner, metas e demais marcas não receberam alterações. Não houve mudança de páginas, hooks, flags ou clientes neste preparo.

Build aprovado;75 arquivos/842 testes aprovados em27/10, incluindo precedência CRM sobre false/null da captação, Beauty separado e rejeição de vínculo de outra conta; lint dos arquivos alterados aprovado. Lint global percorreu backups locais de bundles, gerando avisos sem relação com este preparo; não é declarado limpo. O navegador deste chat falha antes de abrir a sessão por configuração de acesso ao diretório, portanto **QA autenticado e novo PDF não foram executados**. A evidência Beauty da publicação anterior continua válida somente para aquele escopo.

## O que falta na ouro para ligar Lisô

Expor em contrato de leitura, preservando fatos: contato/ocorrência → negócio/ciclo; classificação explícita e sistema de origem (CRM ou LP/formulário/import aprovado); identificador da evidência; data de captação e data da decisão separadas; proveniência e cobertura. Não usar snapshot parcial de setembro `wescale_marketing_leads_observados` como fonte automática de outubro (registros Lisô consultados: elegivel_kpi=false).

Executar somente as etapas2–3 do mapa acima. A classificação dos17 casos está encerrada pela existência comprovada de negócio. Não reaproveitar a flag Partner nem alterar fatos/RD. A homologação visual anterior de Beauty não substitui o QA da futura integração Lisô.

## Instalação futura da prévia (não executada)

Aplicar `views.sql` transacionalmente após conferir catálogo; provisionar senha fora do Git. Gateway usa role `dashboard_liso_ro`, TLS verify-full e READ ONLY, consultas fixas, sessão/permissões vivas. Configuração privada: mode ouro/legacy, supabase_url/anon_key e conexão postgres. Nenhuma chave Metabase no frontend. Reversão do consumidor: flag Lisô false; não alterar Partner, Beauty publicado ou Vendas. Subir serviço de prévia isolado e proxy `/api/liso-ouro/v1/read`; não encaminhar produção enquanto o usuário não aprovar publicação. A instalação das views/role/serviço ainda não foi executada nesta entrega.
