# Prévia de gastos de WhatsApp

A página local fica em /gastos-whatsapp, com VITE_PREVIA_WHATSAPP=true no build. O servidor da prévia aceita apenas sessão ativa com acesso total. Os dados agregados ficam fora do repositório e da pasta pública. A fotografia contém datas, marcas/contas, modelos e volumes agregados, sem destinatários ou textos de mensagens.

Gere a fotografia antes de iniciar a prévia. Informe o intervalo desejado e use a mesma localização de arquivo no servidor e no preparo.

    python3 -B server/whatsapp_previa/prepare.py 2026-09-01 2026-11-09 --destino /caminho/privado/resumo.json
    WESCALE_WHATSAPP_SNAPSHOT=/caminho/privado/resumo.json python3 -B server/marketing_mensal_previa/preview.py

## Fontes e atribuição

Consumo e custo medidos na ouro.vw_whatsapp_custo_rd, com o mesmo critério do modelo 228 do Metabase: somente métrica coberta com recibo válido. Enviadas/entregues pertencem à família delivery; preço vem da família pricing. A página exibe o subtotal observado e a cobertura de cada conta. O custo fica indisponível se há volume positivo sem tarifa. Os dias de consumo são de Brasília.

Medições de templates usam o catálogo e os snapshots da Meta. Os produtos são séries de medição, e podem espelhar o mesmo template/dia. A chave canônica é conta, template e dia UTC: cada métrica só é aceita uma vez se as séries concordam. Se divergem, o valor daquela métrica fica desconhecido. Usar a última observação do intervalo, sem somar snapshots, máximos de leitura ou preços de conta com preços de evento. A consulta ampla da visão ouro.vw_whatsapp_template_dia excedeu o tempo disponível. A consulta da prévia restringe as medições da origem aos modelos identificados. O detalhamento do evento apresenta uma **projeção**: entregas × tarifa RD pós-paga Brasil para a categoria do modelo, assumindo que todas essas entregas são tarifáveis no Brasil. País, gratuidade e cobrança do disparo individual não são comprovados por esse cálculo.

A família live_btg identifica chamadas de outubro. Para a edição 03/11, o material operacional no ClickUp (tarefa 1dfdzjeamgx) e os nomes live0311 identificam a edição. O convite passou de BTG a Diretores; o nome do modelo sozinho não determina qual versão do texto recebeu cada destinatário. Modelos genéricos de cadência ou disparo não são classificados como ativações sem vínculo.

## Finalidade dos envios

O total é sempre a soma de envios observados na ouro por conta/dia BRT. A divisão considera modelos de evento explícitos e modelos da régua com o padrão documentado de passo, marca da própria conta e versão (m1, c1, c2, t04–t10). Atribuição pelo modelo não é confirmação de execução individual pelo catálogo de campanhas do RD. Ativações ambíguas continuam a classificar.

Em outubro de 2026, a conciliação aprovada acrescenta 127 vínculos de conta, modelo e dia UTC. A lista em eventos.sql restringe cada vínculo aos dias revisados. As quantidades são lidas dos mesmos recibos que os demais modelos. Inclui as chamadas da live BTG, os webinars B2Case e Lisô, os convites Beauty, os disparos de Partner e Legacy e a régua E1/E3 na conta We Scale.

Para cada filtro, só atribuímos volumes de modelos cuja janela UTC está inteiramente contida no intervalo BRT e cujos dois dias locais têm cobertura de entrega completa. Cada bloco de janelas consecutivas precisa caber no volume observado da mesma conta e marca, respeitando os dois dias de cada janela. Blocos incompatíveis ficam pendentes. O saldo é total observado menos rotina identificada menos eventos identificados. Reagrupar em intervalos separados pode mudar a parte identificada nas bordas, mantendo o mesmo total de envios. Uma conta sem observações apresenta traço. A origem é agregada e não expõe um ID por mensagem.

## Proposta de tabela para o Metabase

Criar futuramente uma leitura dedicada, por exemplo ouro.vw_whatsapp_disparo_campanha. Fonte: GET /v1/campaigns paginado e GET /v1/campaigns/{campaign_id} (detalhe com estatísticas agregadas). O conector atual da We Scale retornou 403 FORBIDDEN na listagem em 09/11. A réplica atual contém employees, reports_chatbots e reports_operators e não expõe a lista de campanhas. Habilitar leitura desse recurso com o TI ou importar uma exportação agregada da operação.

| Campo | Contrato proposto |
|---|---|
| conta_rd, campanha_id, nome_campanha | Chave original por conta + ID. Nomes podem se repetir ou mudar. |
| evento_id, evento_nome, regra_atribuicao | Relacionar o nome confirmado e/ou ID do disparo à edição da live ou ativação. Manter casos ambíguos pendentes. |
| waba_id, marca, template_id, produto | Vínculo comprovado com integração/modelo no detalhe. Preservar registros sem vínculo. |
| disparado_em, dia_brt, status | Data real de envio. Agendado, cancelado e enviado são situações distintas. |
| enviados, entregues, lidos, erros | Totais do detalhe daquela campanha. Campos ausentes ficam nulos. Guardar medição e cobertura. |
| observado_em, recibo_id, cobertura | Guardar histórico de recibos na bronze e última observação por ID na prata. Uma linha por campanha na ouro. |
| custo_projetado_brl, base_calculo, tarifa_id | Disponível com evidência da tarifa, categoria e quantidade aplicável. Receita de cobrança real/fatura separada. |

Indicadores por evento devem agregar campanhas únicas. A evolucão de contadores cumulativos da mesma campanha não é um novo disparo. Se a fonte só informar totais cumulativos, não distribuí-los em dias fictícios. Não multiplicar custo diário por um join de várias campanhas na mesma conta/dia. Validar a soma de campanhas, cobertura e saldo sem atribuição independentemente do custo total da conta.

Referências: https://developers.rdstation.com/reference/conversas-v2-list-v1-campaigns e https://developers.rdstation.com/reference/conversas-v2-get-v1-campaign-by-id.
