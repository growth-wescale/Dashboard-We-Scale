# Scale Partner: migração somente de Marketing

Decisão de Gabriel em 21/10/2026: **manter Vendas inteiramente como está; migrar só Marketing**. Substitui o escopo anterior de 11 superfícies. Este documento separa implementação, prévia autenticada e publicação.

## Fronteira de consumo

| Consumidor | Partner após ativação | Demais marcas |
|---|---|---|
| Visão Geral | Leads/MQL comercial, mídia e complemento CRM da ouro | Fontes/regras atuais |
| Saúde da Marca: visão, campanhas, conjuntos, anúncios | Mesmos registros da ouro; atribuição comercial por UTMs exatas, ausentes explícitos | Cálculos atuais, inclusive estimativas anteriores de campanhas |
| S&OP, inclusive PDF e Kanban de Marketing | Contratos ouro; snapshots manuais fechados continuam identificados como históricos | Fontes/regras atuais |
| Meta & OKRs | Leads e mídia de Marketing na ouro | Fontes/regras atuais |
| Receita, realizados e placares comerciais de Meta & OKRs | Fonte atual de Expansão | Fonte atual |
| Visão Macro, Performance, Perdas, Linha do Tempo/detalhe, Objeções | **Tudo preservado**, inclusive Partner, mídia, CAC/ROAS, eventos e tarefas | Tudo preservado |
| Campanha de Metas/TV, metas, distribuição, acessos | Tudo preservado | Tudo preservado |
| Criativos, termos, social, e-mail, configurações e serviços operacionais | Complementos existentes, fora dos domínios migrados | Preservados |

Os clientes originais `supabase.ts`/`supabaseVendas.ts`, hooks/caches principais do funil e páginas comerciais não são modificados. `partnerMarketingSources.ts` cria clientes privados apenas para consumidores de Marketing que optam. A mídia compartilhada mantém opt-in desligado em Vendas e cache original separado. O cliente de Marketing reutiliza o bearer do usuário para preservar RLS; o projeto de Expansão continua com seu próprio anon, sem receber esse JWT de outro projeto.

Além dessa separação, o adaptador rejeita a ativação fora das rotas `/`, `/marca`, `/sop-marketing`, `/okrs`, `/copa-b2b`. O gateway devolve modo legado nas rotas comerciais. Uma navegação Marketing → Vendas não reaproveita dados ouro em caches comerciais. A flag de frontend, isoladamente, não migra Vendas.

## Origem, grão e diferenças aceitas no contrato

- MQL significa **qualificação comercial do CRM**, não classificação do formulário nem lead informado pelo anúncio. Contrato `ouro.vw_scale_partner_mql_comercial`, uma ocorrência por negócio/ciclo/contato; dedupe existente por contato dentro da janela. Dias CRM em Brasília, como texto `YYYY-MM-DD`.
- A view de MQL expõe na ouro o vínculo negócio–contato da prata, **expressamente autorizado**, sem alterar fatos. Enriquecimento opcional de perfil é da ouro e não muda população, qualificação ou dia. O consumidor não possui acesso direto à prata.
- Outubro 01–21: 22 contatos comerciais nas duas populações, duas diferenças de dia. Em 01–20: 22 importados versus 21 ouro; novo MQL é dia **21** no CRM, dia **20** na importação. Não deslocar a origem para forçar igualdade.
- Setembro: 53 atuais versus 43 ouro, 42 contatos comuns. Dos 11 exclusivos da atual, nove estão atualmente vinculados a outras marcas no CRM, um não tem negócio correspondente e um não pertence à população elegível. Não atribuí-los a Partner por conveniência. Cobertura histórica limitada fica explícita; snapshots manuais identificados da S&OP permanecem históricos.
- Investimento: somente anúncio/dia da ouro, conta `655039566905092`, marca Partner/We Scale e BRL, desde 14/07/2026. Não somar campanha com anúncio. No corte 01–20, R$ 6.150,92 em anúncios versus R$ 5.860,36 atual. Campanha no mesmo DW tem R$ 6.150,89: diferença de R$ 0,03 entre cortes, sem ratear/editar valor. Outubro em curso varia com coleta regular.
- Marketing usa ciclos/estado e passagens Partner em contratos próprios da ouro. Ganho exige status Ganho; vendas outubro 3/R$ 7.494, acumulado cinco ganhos. Um perdido em Venda não vira sexta venda. Isso **não substitui** a fonte das páginas comerciais.
- Campanhas de Partner deixam de estimar MQL/SQL por gasto ou lead da mídia. Só UTMs com correspondência exata atribuem campanha/conjunto/anúncio; ambiguidades e ausências ficam em linhas sem atribuição. Totais conservados em cada nível; nenhuma reclassificação no DW. Leads da mídia e MQLs comerciais têm critérios e datas diferentes.

## Gateway e acesso

`server/partner_ouro/app.py` oferece somente POST `/api/partner-ouro/v1/read`, com nomes fixos de conjuntos e SQL fixo. Não aceita SQL/filtro/tabela do navegador. Valida sessão no Auth e permissões vivas em `minhas_permissoes`, incluindo ativo, rota e marca. Sem sessão: 401; erro de origem/contrato: falha explícita, sem zero/fallback automático.

Role própria `dashboard_scale_partner_ro`: NOINHERIT, sem privilégios administrativos ou escrita; SELECT em sete views Partner, sem USAGE prata. Conexão TLS `verify-full`, transação repeatable-read/read-only, timeout 20s. Segredos só no servidor. API administrativa de auditoria do Metabase não integra o frontend/gateway. Contêiner próprio, filesystem readonly, uid sem root, sem porta host externa (verificação somente no loopback) e sem logs de payload/bearer. Nenhum worker/agendamento de ingestão foi alterado.

`observed_at` é o registro de ciclo mais recentemente atualizado, **não prova um corte completo da ingestão**; a interface rotula isso literalmente. Respostas/cache somente em memória; troca de sessão e refresh invalidam as parcelas pertinentes. Falhas do Partner são mostradas na S&OP; PDF não certifica uma consulta Partner que falhou ou expirou.

## Ativação e retorno

O frontend usa `VITE_PARTNER_OURO_ENABLED=true`; false mantém fontes originais. Prévia também usa `VITE_APP_BASENAME=/__partner_preview`. Segredos não são VITE.

O gateway já possui uma publicação isolada na VPS. Atualizar somente seu serviço exige conferir hash do `app.py`, container/config/CA e a rota pública; o deploy normal do dashboard publica apenas o frontend. Não reiniciar o contêiner atual do dashboard ou os coletores para instalar este serviço. Instruções em `server/partner_ouro/README.md`.

Rollback imediato: mudar **somente** `mode` do config protegido do gateway para `legacy` e reiniciar somente seu contêiner. Após autenticação, o adaptador volta à consulta Supabase original. Não é necessário desfazer views nem tocar fatos. Rollback definitivo: flag false em PR/deploy. Testes cobrem o modo legado e consultas comerciais passadas intactas.

## Evidências e limites de verificação

Instalação inicial 21/10 15:59 BRT: seis novas views de leitura e role restrita. R2 16:17 BRT alterou apenas duas views recém-criadas: apresentação da origem comercial (mesmo fallback Inbound existente) e prazo efetivo das tarefas. **Zero DML em fatos**, oito fatos/sete dimensões e catálogo compartilhado preservados; comprovantes em `docs/audits/2026-10-21-partner-views-*.json`. Views de tarefas/timeline não são consumidas por esta migração limitada a Marketing.

Matriz sobre extratos sanitizados: 648 cenários de outras marcas preservados, 72 cenários Partner Performance e dez Aging/Atual; análise de contrato não ativa Vendas. Dedupe consolidado: 34 comparações marca/janela sem diferenças nas demais marcas. Evidências em `docs/audits/2026-10-21-partner-*.json`. Comparação da prévia com a produção confirmou, no mesmo filtro de sete marcas/outubro/unidades, receita R$578,4 mil, 20 fechamentos, 671 MQL, 79 SQL, 33 No-show, CAC R$4.445 e ROAS6,5x. Novas entradas regulares podem alterar contagens após esse instante.

Conferência autenticada, PDF, CI/PR/merge/deploy e ativação final devem constar separadamente no relatório de entrega; build/teste não comprovam publicação.

## Conferência de perfil e PDF — 21/10

A ouro consultada ainda não preenche UF ou cidade nos 187 candidatos Partner, nem UF/cidade/formulário nas 80 ocorrências do contrato comercial. Empresa também não é exposta nesse contrato. O provider não usa a base manual para completar esses campos: a tabela de contatos de Marketing/PDF passa a mostrá-los sem informação. Isso é uma limitação real da cobertura, não um pedido para editar fatos. Gabriel autorizou em 21/10 publicar as métricas com esses campos sem informação. O aceite permite ativar somente Marketing; não autoriza nova alteração de fatos. Enriquecimento posterior deve seguir o contrato de cobertura adjacente.

PDF autenticado de nove páginas conferido: Partner 22 MQLs, três vendas e receita R$7.494; origem/limite histórico presentes. As outras sete folhas de marcas e Kanban renderizam. O formato existente de quadros roláveis permanece: o PDF captura a parte visível dos contatos/colunas e não constitui uma exportação integral de todas as linhas. Não foi feita reestruturação de paginação.

PR #263 criado em rascunho pela interface autenticada do GitHub após as integrações negarem a criação. Base local principal/main remota e9cb48f; primeiro commit local/remoto/PR 36fd295 idênticos, CI de branch e PR aprovados. Alinhamento realizado sem incorporar outros PRs nem publicar.

## Ativação aprovada — 21/10

Gabriel autorizou publicar somente Marketing, aceitando temporariamente os detalhes de perfil sem informação. CI e deploy passam a construir com `VITE_PARTNER_OURO_ENABLED=true`; a flag continua false quando omitida para permitir rollback. `VITE_APP_BASENAME` não é definido em produção. Merge/deploy/QA vivo devem ser confirmados separadamente. Lista de cobertura: [campos a disponibilizar na ouro](scale-partner-ouro-campos-pendentes.md).

## Apresentação e conferência do export — 21/10

O aviso técnico global e o rodapé de migração da S&OP são retirados por causarem interpretação de erro mesmo com consulta bem-sucedida. O timestamp de registro mais recente não é exibido como estado de sincronização. Contratos/limites continuam nesta documentação; falhas reais seguem explícitas. Saúde Partner diferencia carregamento de indicadores vazios. Conciliação somente leitura com o export RD das 20:08: mesmos24 negócios,22 contatos,24 IDs/contatos/emails/dias/estados correspondentes; três linhas de outras marcas fora do recorte. Detalhes no relatório `docs/audits/2026-10-21-partner-export-rd-conciliacao.md`. A remoção do aviso não altera população ou resolve a cobertura de perfil.
