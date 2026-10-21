# Scale Partner — conciliação do export RD e aviso da tela

Conferência somente leitura em 21/10/2026, após export manual RD das 20:08. Origem local preservada. SHA-256 do CSV: `76ca880df6395bb8bfeb3cb678341cc5a12da758cf30e95596fb125853e2eeaf`.

O arquivo possui uma linha `sep=,`, cabeçalho com 164 colunas e 27 registros. Estado de negócio é a coluna 5; UF é a coluna 93. Leitura posicional preserva os cabeçalhos duplicados. Marca vem da coluna 89; IDs negócio/contato das colunas 159/163.

| Recorte | Export RD | Ouro |
|---|---:|---:|
| Linhas totais do export | 27 | não se aplica |
| Negócios Scale Partner, criação outubro | 24 | 24 |
| Contatos únicos de Partner | 22 | 22 |
| Outras marcas no export | 1 Inpot + 2 Odonto Legacy | fora do contrato Partner |

Todos os 24 IDs de negócio Partner coincidem, sem ausências nem extras no período 01–21/10. Para os mesmos negócios: IDs de contato 24/24, emails normalizados 24/24, dia criação RD versus dia MQL ouro 24/24 e estado atual 24/24 coincidem. Dois contatos possuem dois negócios cada; dedupe comercial por contato resulta em 22. O conjunto de contatos da base Marketing anterior também é exatamente o mesmo, 22; não é apenas igualdade de contagens. Isso homologa este recorte do export, não o histórico inteiro nem todas as colunas.

Há diferença de cobertura de detalhes: UF/cidade preenchidas no RD em 24/24 contra zero no contrato ouro; empresa em 19/24 no RD, não exposta no contrato. Formulário está vazio nos 24 registros do export e no contrato. Catálogo de todas as relações ouro inspecionado: perfis de captação são expostos em fato_captacao/vw_leads_candidatos; não foi localizado contrato CRM de empresa/UF/cidade para estes registros. Não se afirma ausência na prata/origem nem perda causada pelas correções anteriores. Nenhuma nova escrita em fatos, views, ingestão ou Supabase nesta auditoria.

O aviso global era renderizado incondicionalmente em rotas Marketing com a ativação ligada. A data vinha do registro de ciclo mais recentemente atualizado, não de uma falha nem da última sincronização completa. Gateway saudável e UI autenticada confirmaram consulta concluída com 22 MQLs, dois SQLs e R$6.355 de mídia arredondada no instante lido.

Ajuste de apresentação: retirar aviso global e rodapé técnico S&OP/PDF; preservar documentação de contratos/limites e rótulos de snapshots históricos. Saúde de Partner passa a exibir Carregando dados durante consultas e não renderiza indicadores zerados quando uma consulta principal falha. Erros reais continuam no QueryErrorBanner. Regras/contatos/fontes e Vendas permanecem intactos.

Conciliação individual entregue em CSV privado local, fora do Git e do vault, sem emails/telefones. IDs e dados pessoais não entram neste relatório agregado. Publicação da correção de interface deve ser comprovada separadamente por PR/CI/deploy/QA.
