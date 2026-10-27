# Oral Unic — três casos de cobertura para Maicon

Maicon, estamos preparando a migração de Marketing para a ouro. Encontramos **três contatos, representados por cinco submissões reais** na base atual, que não aparecem na leitura candidata da ouro. Precisamos esclarecer a cobertura e disponibilizar a proveniência correta, sem ajustar totais manualmente.

**Referência:** investigação de27/10/2026; base atual Supabase Marketing, tabela `public.leads`, marca `Oral Unic`, formulário `oralunic_multistep`. Os IDs abaixo são dessa tabela; não são IDs de contato RD.

## 1. Lead de01/10 — uma submissão

- ID: `330e95a0-8bdf-41ee-a4c5-53aa8927f917`.
- Data do registro (`dia`): `2026-10-01`.
- Classificação gravada pela origem: `lead_type=Lead`, `is_mql=false`.
- Existe na base atual. Não localizado no DW por ID/email/telefone. Consultas nas contas conectadas: RD Marketing404 e CRM sem resultados por email/telefone.
- **Retorno esperado:** localizar o caminho da submissão e seus recibos de entrega; indicar como ela ficará disponível na ouro com o ID/dia e a classificação original preservados. Ausência na consulta não prova exclusão histórica no RD.

## 2. Lead de15/10 — três submissões da mesma pessoa

IDs:
- `0eaf16aa-7bb7-45fd-938d-108a34a3fc2e`
- `2669ade4-3a34-42e6-80f8-2aa8cb283a9a`
- `06a2af1d-d932-4e0c-b1d5-2a1bc83347e0`

Mesmo email/contato, três envios em aproximadamente23 segundos, `dia=2026-10-15`, `lead_type=Lead`. Estão na base atual, mas não foram localizados no DW ou nas consultas RD por email/telefone.

**Retorno esperado:** rastrear as três submissões e expor sua identidade/proveniência na ouro. Preservar os registros originais; a contagem de pessoas deve reconhecer um contato, sem converter três envios em três pessoas nem apagar linhas para fechar totais.

## 3. MQL de13/10 — identidade comercial a esclarecer

- ID da submissão: `34116817-65e7-4318-ab70-52c28bda1c81`.
- `dia=2026-10-13`; a própria landing page gravou `lead_type=MQL` e `is_mql=true`. O dashboard não deve recalcular essa qualificação.
- Email não localizado no DW nem nas consultas RD. No CRM, o telefone com prefixo55 coincide com três contatos anteriores, todos com nomes/emails diferentes:
  - `6a46635084cc30000118df86`
  - `6aa1a241a93ce8000170e54b`
  - `6a3ee6d11b17d60001cc23ae`
- Os vínculos conhecidos desses contatos são de negócios anteriores a outubro. Coincidência de telefone não comprova identidade única nem nova negociação em outubro.
- **Retorno esperado:** confirmar a identidade da submissão e, se existir, o ID real da negociação/contato correspondente; caso não haja negociação, documentar a qualificação da LP e o estado da entrega ao CRM. Não vincular automaticamente pelo telefone, criar negociação, mover datas ou alterar marcas.

## Evidência de cobertura e critério de retorno

A cópia `prata.wescale_marketing_leads` consultada contém16.070 linhas, com `max(dia)=2026-09-22` e última observação em23/09. Nenhum dos cinco IDs foi encontrado em `bronze.wescale_marketing_leads_current` ou nessa prata. A candidata lê captações de `ouro.vw_leads_candidatos` e negócios de `ouro.negocios_ciclos_dashboard`. Precisamos identificar o ponto de entrada correto das submissões de outubro; ainda não há evidência suficiente para afirmar por que não chegaram ao RD/DW.

Para cada caso, devolver: **ID de origem → identidade confirmada → recibo/status de entrega → registro/view na ouro → data de disponibilização e classificação de origem**. Se houver bloqueio, informar o ponto exato e a proposta antes de qualquer alteração.

**Limites:** esta solicitação não autoriza escrever no RD, alterar fatos do DW, apagar importações, criar contatos fictícios, mudar marcas ou páginas de Vendas. Toda negociação criada no CRM já é MQL; não há nova regra de qualificação a discutir. Qualquer necessidade de mudança operacional deve ser apresentada para aprovação específica.

Depois desse retorno, faremos uma única validação de Marketing/PDF antes de publicar. A conciliação de investimento e o recorte de campanhas já foram resolvidos separadamente; não é necessário reabri-los.
