# Contrato de consumo Scale Partner na ouro — v1

Duas views de leitura compõem um único contrato `scale_partner_funil_v1`:

- `ouro.vw_scale_partner_ciclos`: negócios/ciclos, venda/receita, primeira passagem e estado atual. Deriva de `ouro.negocios_ciclos_dashboard`; usa `ouro.negocios_ciclos` apenas para a exclusão de teste já estabelecida. Normaliza a etapa atual SQL pelo ID Partner comprovado.
- `ouro.vw_scale_partner_passagens`: uma entrada distinta por etapa/funil/ciclo, com proveniência. Deriva de `ouro.crm_eventos_negocio` e da view anterior. `dia` é texto `YYYY-MM-DD` de Brasília, evitando a reinterpretacão do DATE como meia-noite UTC pelo Metabase.

Escopo fixo: conta wescale_principal_crm e marca atual Scale Partner/We Scale. Funis permitidos preservados, testes excluídos pelos motivos existentes na própria ouro. Filtrar pelo funil sozinho não define a marca. Nenhuma dependência de bronze, prata, réplica Supabase ou lista manual de negócios. Nomes de relações prata nas colunas de proveniência são valores do fato ouro, não joins de consumo.

## O que conta como passagem

1. Ordenar o histórico ouro por negócio e instante. Duas observações consecutivas do mesmo ID de etapa/funil/ciclo representam o mesmo estado; a troca para outra etapa e volta abre nova entrada.
2. Preferir a entrada do histórico com precisão de milissegundos. A observação de arquivo/webhook que cai no mesmo intervalo de etapa é evidência dessa entrada, não uma nova passagem.
3. O webhook tem precisão de segundos: se etapa/funil/ciclo coincidem no mesmo segundo de uma entrada do histórico, a entrada do histórico prevalece. Não arredondar o histórico nem criar janela arbitrária de minutos.
4. Preservar transições nativas verificadas sem intervalo correspondente. Uma transição para outra etapa interrompe o estado anterior, e uma volta posterior é preservada mesmo que o histórico ainda não a tenha incorporado.
5. Um primeiro update/baseline nativo não cria passagem por si só; fora de um intervalo conhecido, a inicialização só conta se coincidir com a criação do negócio.
6. Manter etapas não canônicas na sequência interna como separadores de estado. Elas não são emitidas como etapas contáveis. Venda continua ganho por status; não transformar o ID Venda em No-show.

As observações originais permanecem integralmente nos fatos de auditoria. Não há DELETE, UPDATE, remapeamento global, alteração de data/valor ou materialização de uma cópia de leads. O contrato é calculado na leitura e acompanha as atualizações regulares da ouro. As flags de cobertura histórica dos ciclos são preservadas; não há promoção de homologação global.

## Uso no dashboard

O provider Partner deve consultar somente estas duas interfaces para o funil. Os demais providers/marcas continuam com o contrato atual. A interface genérica `vw_passagens_crm` e a tabela de auditoria `crm_eventos_negocio` não devem ser conectadas diretamente ao contador Partner de passagens. Não substituí-las globalmente.

- Negócios únicos: deduplicar por negócio/ciclo/mês depois dos filtros, usando o seletor existente.
- Passagens: contar as entradas emitidas, incluindo reentradas reais.
- Data da etapa versus safra: manter a semântica de `countStageEvents` e `cohortKeys`.
- Fechamentos/receita/unidades: ciclos, ganho vigente e data da venda; ganho não é uma etapa do histórico.
- Aging/Atual: ciclos vivos atuais, mesma safra e cálculo de tempo do código existente.
- Períodos: dia/mês/trimestre/ano e união exata; não preencher lacunas entre meses selecionados.

A integração no frontend ainda não foi publicada por esta entrega. A chave administrativa utilizada na auditoria não é uma credencial de consumo do navegador. Provider/gateway com leitura restrita e QA autenticado continuam etapas da migração geral.

## Verificação e mudanças esperadas frente à referência bruta

216 cenários Performance, 3.024 comparações de métricas, 10 Aging/Atual e seis casos sintéticos SQL foram aprovados. Nove janelas, três perfis de origem, negócios únicos/passagens, data/safra, negócios/unidades, virada de mês e união não contígua. Não se declara que foram testadas todas as combinações de filtros de pessoa ou que a cobertura histórica global está certificada.

A referência de validação é a fonte atual corrigida em memória por evidência, sem escrita nela: sete eventos Venda falsamente rotulados No-show; uma observação duplicada de Tentando Contato em setembro; uma transição nativa real de Tentando Contato em outubro ausente na referência. Por isso, Passagens de Tentando Contato set/out01–20 ficam 49/18, contra 50/17 brutos. Não alterar a ouro para forçar esses dois números antigos. As reentradas efetivas continuam presentes.

O novo negócio/MQL de 21/10 já entrou na ouro na carga regular; a matriz passou com as mesmas 81 chaves de ciclo, sem recorte que o esconda.

Rollback: com nenhum consumidor ativo deste contrato, executar `DROP VIEW ouro.vw_scale_partner_passagens; DROP VIEW ouro.vw_scale_partner_ciclos;`. Se houver consumidor futuro, primeiro voltar o provider ao contrato anterior. Não restaurar/reescrever fatos para remover essas views.

SQL exato: `scale-partner-funil-ouro-v1.sql`. Evidência de aplicação e matriz: `../audits/2026-10-21-partner-contrato-ouro-evidencia.json` e `../audits/2026-10-21-partner-contrato-ouro-modos.json`.
