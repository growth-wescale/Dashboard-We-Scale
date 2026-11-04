# Marketing — prévia de outubro de 2026

Conferência de 04/11. Período de 01/10 a 31/10, por criação da negociação em Brasília. A prévia local parte da main 7387e84. Consultas de leitura em server/outubro_ouro. Nenhum deploy.

| Marca | Contatos LP distintos na prévia | Negócios | Inbound | Mídia ouro | Plataformas |
|---|---:|---:|---:|---:|---:|
| Inpot | 426 | 130 | 128 | 34.730,00 | 34.730,02 |
| B2Case | 273 | 113 | 113 | 4.781,23 | 4.781,23 |
| Viva | 69 | 57 | 57 | 6.045,21 | 6.045,25 |

RD CRM v2, leitura individual dos três IDs discrepantes. Empresa Inpot nos três. Criação em 14/10, Inbound, perdido. Criação em 16/10, Prospecção Ativa, perdido. Criação em 22/10, Inbound, aberto. Fonte Macro e datas confirmadas no retorno de cada negócio.

Meta Insights mensal por campanha e Google Ads Search por ID de campanha, moeda BRL. Google em micros, arredondado após soma. A lista de contas e IDs está em anuncios.sql. Dez campanhas coincidem ao centavo. No Meta, campanha 120244898185860609 (Inpot) retorna R$ 21.722,23 e a ouro R$ 21.722,21. Campanha 120248180487730565 (Viva) retorna R$ 1.874,07 e a ouro R$ 1.874,03.

Visão Geral, Saúde da Marca e S&OP verificadas com sessão autenticada e dados da ouro em prévia local. Os três totais de MQL e os custos exibidos coincidiram com o recorte. S&OP precisou terminar a leitura de mídia ao trocar a folha de Viva. Em Metas, Inpot exibiu 130/227 e 128/164 Inbound. B2Case e Viva aparecem na tabela, sem card próprio de MQL. Compilação e 1.082 testes aprovados.

Limite da primeira prévia: os 833 envios dos três formulários multistep têm capital preenchido e nenhum expõe negocio_id. Os cards comerciais contam a negociação mesmo sem identidade do contato. A primeira prévia ainda não incorporava o perfil oficial do negócio. Não usar proximidade de data, nome ou contagem como chave.


## Perfil comercial de outubro, 04/11

A ouro não expõe a ponte de contato dessas três marcas. A simulação local de sua projeção usa o recorte original de negocios.sql, a relação prata.crm_negocio_contatos e as definições oficiais de Capital Disponível e Estado da entidade negócio. Conta, chave da negociação e versão da API delimitam a leitura. Contatos múltiplos são agregados antes de atribuir o perfil. Uma linha ambígua não autoriza escolher um contato ou preencher um campo.

| Marca | Negócios com vínculo | Capital declarado | UF válida |
|---|---:|---:|---:|
| Inpot | 130 | 127 | 128 |
| B2Case | 113 | 113 | 113 |
| Viva | 57 | 57 | 57 |

Dois negócios de Inpot têm dois contatos cada. Três têm capital vazio e não possuem formulário anterior recuperável pelo e-mail exato do contato da mesma marca. Entre esses três, um tem Estado São Paulo (SP) e dois têm textos de teste em Estado (UF em branco). A resposta explícita “Ainda não tenho” de B2Case foi preservada.

QA autenticado: cada faixa de outubro nas folhas da S&OP e cada frequência de UF e capital no CSV gerado pela Visão Geral coincidiram com a projeção. O CSV foi verificado em memória. O conjunto de chaves e todos os campos anteriores de negocios.sql foram comparados antes e depois do enriquecimento. Consulta candidata em server/outubro_ouro/perfil.sql, montada por perfil.py. Nenhuma view instalada e nenhum dado alterado nas origens.
