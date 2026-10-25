# Migração dos funis de marca — relatório por lote e liberação

Fonte: `_migracao_funis_plano`, `dashboard_deal_oculto` e `deal_snapshot` em 25/10/2026 00h. Desenho em
`2026-10-21-migracao-funis-legados-design.md`; execução no CLAUDE.md (histórico de 24/10/2026).

## O que aconteceu com cada funil

| Funil de origem | Deals | Abertos → perdidos | Já perdidos | Ganhos | Visível no dashboard hoje? |
|---|---|---|---|---|---|
| Odonto Legacy (+ nome antigo "Odonto Scale") | 985 | 0 (106 abertos seguiram abertos) | 865 | 12 | **Sim** (Legacy sempre ficou visível) |
| Inpot | 855 | 3 | 834 | 18 | Não (oculto, lote `Inpot`) |
| Rota´s | 498 | 469 | 28 | 1 | Não (oculto, lote `Rota´s`) |
| Lisô Laser | 267 | 60 | 204 | 3 | Não (oculto, lote `Lisô Laser`) |
| Get it | 140 | 131 | 9 | 0 | Não (oculto, lote `Get it`) |
| Oral Unic (funil de marca) | 47 | 0 | 45 | 2 | Não (oculto, lote `Oral Unic`) |

Os 663 abertos dos 5 funis de marca viraram perdidos com o motivo **"Funil descontinuado"** (criado
no RD para isso) antes de mover, por decisão do Junior. Fonte Macro: 1.421 dos 1.807 da onda 2 não
tinham Fonte Macro e receberam **"Não identificado"** (regra: fonte não se inventa). Marca veio do
funil só quando estava vazia; Cidade/Estado vazios viraram "Não identificado"; Closer responsável =
dono quando o dono é Closer, senão "Não identificado" (29 deals, etapas do Closer exigem o campo).

`dashboard_deal_oculto` tem 1.838 ids (1.807 migrados + 31 deals de teste que ficaram nos funis de
origem). Enquanto `liberado_em` é nulo, o deal fica fora de `vw_funil_vendas`, `vw_funil_etapas_v2`,
`vw_marketing_funil` e do relatório diário.

## Para onde cada deal foi (etapa de destino)

Onda 2, por status de origem (etapa do SDR salvo onde indicado Closer):

- **Perdidos** (1.120 + 663 novos): Novo MQL 838 (incl. 660 que estavam em "Novos Leads"/MQL), Tentando
  Contato 51, Contato Efetivo 32 (16 vieram do No Show da Inpot: a etapa No Show do SDR tem questionário
  obrigatório e a API não aceita), No Show 8, Closer › Reunião Agendada SQL 46, Diagnóstico 66,
  Negociação SAL 57, Oportunidade COF 27, Comitê 8, Pré-Contrato 3.
- **Ganhos** (24): Closer › Pré-Contrato 24.

Onda 1 (Legacy): Tentando Contato 647, Novo MQL 108, Contato Efetivo 124, Conexão 28, Interesse Reunião 3,
No Show 21, Closer › Reunião Agendada SQL 15, Diagnóstico 10, Negociação SAL 13, Oportunidade COF 1,
Pré-Contrato 15.

## Como liberar um lote

1. Olhar o que entra antes: `select marca, status_atual, count(*) from vw_deal_ciclo_enriquecido d
   join dashboard_deal_oculto o on o.id_deal = d.id_lead where o.lote = 'Inpot' group by 1,2`.
2. Tirar o checksum: `select migracao_funis_checksum('antes_lote_inpot')`.
3. Liberar: `update dashboard_deal_oculto set liberado_em = now() where lote = 'Inpot' and liberado_em is null`.
4. Esperar o refresh da matview (2 min) e comparar: `select migracao_funis_checksum('depois_lote_inpot');
   select * from migracao_funis_diff('antes_lote_inpot','depois_lote_inpot')`. Tudo que aparecer é o
   histórico daquele lote entrando nas abas de Vendas, nas páginas de Marketing (o `funil` deles aparece
   como o funil de origem, então o hook de Marketing continua ignorando-os até alguém mudar a view) e no
   relatório diário (passagens históricas com `nome_funil` do funil de origem **não** entram no relatório,
   que filtra `SDR/Closer/Odonto Scale` pelo nome).
5. Voltar atrás = `update dashboard_deal_oculto set liberado_em = null where lote = 'Inpot'`.

Os lotes são os nomes dos funis de origem. Para liberar parte de um funil (ex.: só ganhos), filtrar
pelo `status_origem` em `_migracao_funis_plano`.

## Pendências no RD (manuais, do Junior)

- Apagar os 31 deals de teste (Inpot 6, Lisô 25) e depois os 6 funis vazios.
- Reapontar ou desativar a automação "OdontoScale > CRM (Limpo)" do RD Marketing (ainda cria no funil Legacy).
- Depois de liberar os lotes: tirar de "Closer responsável" as opções antigas reincluídas pela migração
  (Vanessa Daniel, Aurélio Briano, Giullia, Rômulo, Raissa) e "Não identificado"; idem "Não identificado"
  em Fonte Macro, se quiser.
- Avisar o TI: ~2.800 webhooks `crm_deal_updated` chegaram ao receptor do DW nas duas noites.
