# Backup — Fonte Macro antes da carga "Prospecção Ativa"

**Data:** 2026-08-14
**Escopo:** 423 deals que estão ou já estiveram no funil Prospecção Ativa
**Motivo:** preenchimento em massa de `Fonte Macro = "Prospecção Ativa"` via API do RD Station CRM

## Estado antes da alteração

| Valor de Fonte Macro | Deals |
|---|---|
| `Resgate` | 268 |
| *(vazio)* | 155 |
| **Total** | **423** |

## Como reverter

O valor anterior de cada deal fica registrado em duas fontes:

1. **Event Sourcing** — a partir de 2026-08-14 toda troca de Fonte Macro gera um evento
   `mudanca_fonte_macro` em `deal_eventos`, com `valor_anterior` e `valor_novo`:

   ```sql
   select id_deal, valor_anterior, valor_novo, data_evento
   from deal_eventos
   where tipo_evento = 'mudanca_fonte_macro'
   order by data_evento desc;
   ```

2. **Consulta de reconstrução** — para regerar a lista dos 268 que eram `Resgate`:

   ```sql
   select id_deal
   from deal_eventos
   where tipo_evento = 'mudanca_fonte_macro'
     and valor_anterior = 'Resgate'
     and data_evento::date = '2026-08-14';
   ```

A reversão em si é um novo PUT na API do RD com o valor antigo, deal a deal.

## Campos envolvidos no RD Station CRM

| Campo | ID | Ação |
|---|---|---|
| Fonte Macro | `6a5a3761eab0b60028990155` | recebe `"Prospecção Ativa"` |
| Sub-Fonte | `6a5a37694db19c002e602fb4` | **não tocar** — é gatilho da cadência #5 |

## Cadências verificadas antes da carga

| # | Nome | Ativa | Condição de gatilho |
|---|---|---|---|
| 4 | Resgate Leads Oral Unic HubSpot | sim | etapa + listas HubSpot + funil |
| 5 | Sub-Fonte Oral Unic HubSpot | sim | etapa + **Sub-Fonte** + funil |
| 7 | Contato Efetivo - Prospecção Ativa | sim | etapa + funil |

Nenhuma usa `Fonte Macro` como condição — por isso a carga é segura do ponto de vista das cadências.
