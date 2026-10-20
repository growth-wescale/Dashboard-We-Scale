# S&OP Partner e Legacy - revisão de 20/10/2026

## Escopo aprovado

- Remover a seção Compradores da folha Partner (tela/exportação), mantendo
  vendas, receita e distribuição por evento. Retirada também a consulta
  complementar de identificação, agora sem consumidor.
- Metas de receita Legacy, somente na S&OP: outubro R$ 29.910, novembro
  R$ 41.874 e dezembro R$ 29.910. Valores anteriores de agosto/setembro
  preservados; metas de outras páginas e marcas não alteradas.
- Comunidade: 192 membros ativos, quantidade informada pelo usuário em
  20/10, independente do arquivo de cadastros.
- Lista fornecida usada exclusivamente no quadro qualitativo dentista x
  clínica. Sem importar contatos, alterar classificação, MQL, leads ou banco.

## Análise qualitativa

Fonte: TSV fornecido em 20/10. SHA-256:
`2655b8c6640ad8305e69eaac9f307bedd5aab25b3227bcea44a561a5c13bd42e`.
Nenhum contato ou linha bruta é incluído no repositório.

420 linhas de comunidade_multistep entre 04/08 e 20/10/2026. Sete linhas
explicitamente de teste excluídas somente da análise. Das 413 restantes,
29 repetições consolidadas, resultando em 384 contatos únicos, por e-mail
normalizado (telefone como alternativa). Quatro contatos tinham respostas
divergentes; o usuário aprovou usar a resposta mais recente de cada contato.
Todas as respostas finais têm ambos os campos sim/nao preenchidos.

| Perfil | Contatos | Percentual dos 384 contatos |
|---|---:|---:|
| Dentista com clínica | 74 | 19,27% |
| Dentista sem clínica | 90 | 23,44% |
| Não dentista com clínica | 19 | 4,95% |
| Não dentista sem clínica | 201 | 52,34% |
| Total | 384 | 100,00% |

Contagens conferidas por duas implementações independentes, csv e pandas.
Os 384 cadastros analisados não são os 192 membros ativos; não é possível
inferir pelo arquivo quem permanece na comunidade. Não extrapolar os
percentuais ao total ativo. A origem dos membros não foi recalculada.
Rodapé informa período, denominador, exclusão de testes e regra aprovada.

## Preservação e verificação

Snapshot de setembro, funil manual Legacy e séries existentes preservados.
O custo por membro conserva sua fórmula e passa a usar o total ativo
informado de 192; nenhum valor desse indicador é extraído da lista anexa.
Sem escrita no banco, nova dependência ou modificação de hooks compartilhados.

741 testes aprovados: metas e preservação histórica, regressões de vendas,
remoção da consulta de identificação e totais da qualidade. Build/lint sem
erros; revisão visual local a 1440/1024px. PDF de nove folhas exportado,
com Partner e Legacy revisados, usando dados comerciais fictícios e agregados
da lista. QA autenticado com dados vivos e publicação continuam separados.
