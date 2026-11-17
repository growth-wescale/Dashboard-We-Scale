-- 2026-11-17 — Linha do Tempo: cadência do negócio (entrada, saída e WhatsApp automático).
--
-- O navegador lê o Supabase de Expansão como `anon`. cadencia_execucoes e
-- cadencia.disparos não são legíveis por ele (RLS / sem grant), então, no mesmo
-- padrão de vw_deal_timeline_eventos/_tarefas/_reunioes, esta view roda com os
-- direitos do dono e devolve só metadado, só de negócio que aparece no dashboard
-- (existe em vw_funil_vendas). Nada de telefone, nome do lead ou texto do template.
--
--   tipo = 'entrada'  → entrou na cadência (entrou_em)
--   tipo = 'saida'    → saiu da cadência (encerrada_em, motivo_encerramento)
--   tipo = 'disparo'  → WhatsApp automático da cadência (enviado_em/agendado_para, status)

create or replace view public.vw_deal_timeline_cadencias as
select c.* from (
  select 'exec:' || x.id || ':entrada' as id, x.deal_id as id_deal, 'entrada'::text as tipo,
         x.entrou_em as instante, x.cadencia_nome, x.origem as detalhe, x.status, x.ciclo
    from public.cadencia_execucoes x
   where x.entrou_em is not null
  union all
  select 'exec:' || x.id || ':saida', x.deal_id, 'saida',
         x.encerrada_em, x.cadencia_nome, x.motivo_encerramento, x.status, x.ciclo
    from public.cadencia_execucoes x
   where x.encerrada_em is not null
  union all
  select 'disparo:' || d.id, d.deal_id, 'disparo',
         coalesce(d.enviado_em, d.agendado_para), x.cadencia_nome, d.template_codigo, d.status, x.ciclo
    from cadencia.disparos d
    left join public.cadencia_execucoes x on x.id = d.execucao_id
   where coalesce(d.enviado_em, d.agendado_para) is not null
) c
where exists (select 1 from public.vw_funil_vendas v where v.id_lead = c.id_deal);

grant select on public.vw_deal_timeline_cadencias to anon, authenticated, service_role;

comment on view public.vw_deal_timeline_cadencias is
  'Linha do Tempo: entrada/saída de cadência e WhatsApp automático por negócio (só metadado). Ver docs/sql/2026-11-17-linha-do-tempo-cadencia.sql';
