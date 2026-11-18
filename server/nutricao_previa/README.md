# Nutrição — prévia local

Não habilitada em produção. `VITE_PREVIA_NUTRICAO=true` exige também hostname localhost/127.0.0.1. A página e o menu só aparecem na prévia; acesso total de Marketing é exigido no cliente e revalidado no servidor a cada leitura. Sem alterações RD, fatos DW, Vendas, permissões ou gateways publicados.

## Fonte e contrato

- `catalogo.json`: 96 nutrições (84 ativas e 12 reservas) do inventário fornecido, conferido em 18/11/2026 às 10h42 BRT; hash do XLSX e IDs preservados. Não inclui os 148 rastreios. Status é do inventário, não status vivo. Marca vem do vínculo exato por workflow_id, nunca inferida do título.
- `prepare.py`: um SELECT via Metabase (Oral Unic DW, database 3), somente `ouro.rdm_email_automacoes_diario`, `ouro.rdm_email_catalogo` e `ouro.rdm_email_cobertura`. Restringe conta de credencial 1056777, source de automações 175571351342144930 e IDs de fluxo do catálogo; confirma os 148 modelos na ouro.
- Granularidade: conta/fluxo/ação/dia UTC. Duplicatas, cobertura inválida e métricas negativas recusadas. Não mistura série mensal com diária. Processados, entregues e interações conservam a semântica da fonte. Aberturas/cliques são a soma de únicos por e-mail/dia, não pessoas únicas no período. Não calcula conversão comercial ou contagem de entradas a partir de contacts_selected, tags ou entregas.
- Ausência de linha/campo é desconhecida, não zero. Dia sem medição não entra como zero no gráfico. Intervalos fora da publicação ou com lacunas não exibem totais. Métricas não presumem entrega por subtração de bounces: esses campos podem ter janelas diferentes na fonte.
- Foto agregada privada em `outputs/audits/nutricao-previa-20261118.local/resumo.json`, fora de Git e dist, modo 0600. Sem dados de contatos. Nenhuma credencial no frontend; chave local existente usada apenas pelo coletor.

## Uso

Na raiz: `python3 server/nutricao_previa/prepare.py` atualiza a fotografia por leitura. Compile com `VITE_PREVIA_NUTRICAO=true npm run build -- --outDir /private/tmp/ws-nutricao-build`. Execute `WESCALE_NUTRICAO_DIST=/private/tmp/ws-nutricao-build python3 server/nutricao_previa/preview.py` e abra `http://127.0.0.1:4175/nutricao`. Login normal, acesso total. Servidor escuta apenas loopback, confere Host/Origin e não serve a fotografia como arquivo público. Demais endpoints seguem o proxy de prévia existente.

Recarregar a página relê a fotografia; não aciona coleta no RD nem promete atualização automática. Antes de publicação: atualizar o inventário, aprovar permissão específica, preparar serviço de leitura restrito à ouro, definir renovação e revisar PR. Essa etapa não instala serviços, cria views/roles ou publica.

Validação: `python3 -B -m unittest discover -s server/nutricao_previa -p 'test_*.py'` e `npx vitest run src/lib/nutricao.test.ts`. Conferir filtros no navegador e somas independentes no Metabase, especialmente ausência de métricas, zero real e limites de cobertura.

## Conferência de 18/11/2026

Recorte 01–17/11 UTC, coleta da ouro às 11h35 BRT: 34 processados, 33 entregues, 4 aberturas e 0 cliques. Eletrovias: 25/24/3/0; Lisô: 7/7/0/0; Viva: 2/2/1/0. Oral Unic: sem medição. Quatro registros distintos por fluxo/ação/dia, iguais a uma consulta independente agrupada no Metabase. Dois soft bounces mantidos como fornecidos, sem reconciliar artificialmente por subtração.

Build aprovado; suíte geral 1.236 testes e sete testes Python aprovados. Prévia autenticada conferida nos quatro filtros de marca, fluxo No Show, limites de período, inventário completo, detalhe por e-mail, recarga e falha de leitura (sem totais falsos ou antigos). Desktop e celular 390px conferidos, sem extravasamento do seletor; nenhum erro JavaScript. Evidências agregadas privadas no mesmo diretório do snapshot. Não comprova envio em tempo real, atualização automática ou publicação.
