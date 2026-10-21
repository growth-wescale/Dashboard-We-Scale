# Scale Partner — detalhes a disponibilizar na ouro

Solicitação para a equipe de dados, 21/10/2026. A publicação de Marketing foi autorizada com estes campos sem informação. Este documento não executa mudança no DW. Vendas permanece na fonte atual.

| Informação | Destino do contrato de Marketing | Uso |
|---|---|---|
| UF | `uf` (atualmente tenta `ouro.vw_leads_candidatos.lead_uf`) | Geografia e tabela de contatos |
| Cidade | `cidade` (atualmente tenta `lead_cidade_texto`) | Geografia e tabela de contatos |
| Formulário de origem | `formulario` (atualmente tenta `lead_formulario_origem`) | Identificar o formulário original |
| Empresa vinculada | Novo campo explícito, por exemplo `empresa_nome`, com ID de origem | Detalhe de contato na S&OP; hoje não exposto |
| Capital informado | `dados_extras.capital` (atualmente tenta `lead_capital_texto`) | Cobertura adicional a conferir para qualificação da S&OP |

UF/cidade estão ausentes nos 187 candidatos Partner consultados. Nas 80 ocorrências comerciais, UF/cidade/formulário estão vazios e empresa não é exposta. Capital deve ter sua cobertura medida separadamente antes de ser considerado resolvido; não foi comprovado como preenchido por esta verificação.

Contrato consumido: `ouro.vw_scale_partner_mql_comercial`. Os campos existentes tentam enriquecimento a partir de `ouro.vw_leads_candidatos`; a população continua definida pela qualificação comercial CRM. Não mudar o critério MQL para o do formulário.

Para cada informação, expor também chaves estáveis de contato/negócio/conta e a proveniência: relação/campo ou ID personalizado da origem, data do evento ou atualização e carga no DW. Confirmar o campo real no CRM/formulário; não deduzir cidade/UF por telefone, empresa pelo nome do contato ou formulário pela campanha. Empresa pode estar vinculada ao negócio ou à organização CRM, e essa relação precisa ser comprovada.

Grão a preservar: ocorrência por negócio/ciclo/contato, com a mesma identidade comercial. Enriquecimento não pode multiplicar linhas, deslocar dia MQL, alterar marca/UTMs, recuperar registros de outras marcas nem criar fatos para preencher ausências. Se houver múltiplas respostas, definir regra temporal explícita e manter proveniência. Valores ausentes continuam nulos.

Critérios de aceite: antes/depois com chaves e contagens de MQL, vendas/receita e mídia preservadas; nenhum efeito nas demais marcas; medir cobertura por campo e mês; conferir amostra contra a origem autorizada; validar tabela, geografia e PDF de Marketing. A disponibilização de empresa exigirá mapear o novo campo no consumidor antes de afirmar que o dashboard o exibe. Não acessar a prata diretamente no frontend nem ampliar a role de consumo para fatos.
