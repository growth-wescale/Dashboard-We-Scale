# Leads por evento — S&OP Marketing

O painel Scale Partner mostra somente **Scale Partner Geral** e **Beauty
Connection**. A classificação é o funil do CRM, não a marca nem o adset.

## Contrato de dados

Fonte: `public.leads` no Supabase Marketing (`jmuluoksnlqrvzbcltim`), sob a
autenticação e RLS existentes. `dados_extras.eventos_marketing` é um array:

```json
[{"evento":"Scale Partner Geral","dia":"2026-09-10",
  "crm_deal_ids":["id-ficticio"],"empresa":"Empresa fictícia",
  "cidade":"Cidade fictícia","uf":"SP","fonte":"RD CRM CSV",
  "importado_em":"2026-10-05"}]
```

Cada participação mantém a data de criação no CRM, mesmo quando o cadastro
original é mais antigo. Uma pessoa aparece uma vez por evento no período,
mas pode participar dos dois. O total do quadro é participações, acompanhado
do número de pessoas distintas. O filtro de fonte usa `utm_source` do cadastro.
Sem vínculo explícito, o painel não infere evento a partir de UTMs ou marca.

O hook busca apenas registros com esse metadado, sem filtro de marca ou de
data de criação do cadastro. Aplica o período às participações no cliente,
com paginação estável, cache, cancelamento e estados de loading/erro.

## Conciliação autorizada de 05/10/2026 — banco vivo

Exports RD CRM de 05/10, horários 16:24 e 16:25, preservados na origem:

| Evento | Deals válidos | Contatos únicos |
|---|---:|---:|
| Scale Partner Geral | 71 | 59 |
| Beauty Connection | 9 | 9 |

Seis testes do export Scale Partner não foram mapeados; 12 deals duplicados
foram consolidados por email normalizado ou telefone (11 últimos dígitos).
Uma pessoa pertence aos dois eventos: 68 participações em 67 cadastros.
Foram vinculados 49 cadastros existentes e inseridos 18 faltantes como We Scale.
Identidades, marcas, datas e demais metadados dos 49 existentes foram
comparados antes/depois e preservados. Nenhum registro foi apagado.

Inserções têm `formulario=crm_event_import`, `import_source` e `row_hash`
`crm-event:<id-deal>`. IDs de todos os deals consolidados ficam na participação.
Antes de novo lote, reconciliar IDs, email e telefone novamente; nunca repetir
o insert cegamente. Não alterar `dados_extras.evento`: esse campo antigo muda
a deduplicação global. Manter `eventos_marketing` ao atualizar metadados desses
cadastros em futuras ingestões; esta conciliação não cria um sync automático.

Não há classificação MQL preenchida nos exports. Na importação inicial, os 18
novos cadastros ficaram sem classificação. Gabriel autorizou posteriormente,
em 05/10/2026, classificá-los como MQL: `lead_type=MQL` e origem explícita
`mql_classification_source=aprovacao_manual_gabriel_2026-10-05`. O SELECT após
gravação confirmou 18/18 MQLs nesse lote, sem alterar os 49 cadastros existentes.
O snapshot manual de 49 MQLs e os demais cards da S&OP
não foram alterados. Leads de eventos e snapshot comercial têm escopos/data
distintos e não devem ser tratados como totais intercambiáveis.

Verificação: consultas pós-gravação, build de produção, lint e testes locais.
Publicação da interface depende do merge do PR; validação visual por print.
