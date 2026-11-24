-- ============================================================================
-- Reuniões de LIVE (R1 em grupo da Eletrovias) — base da linha
-- "em N reuniões · M de LIVE" ao lado do Diagnóstico (Visão Macro e
-- Performance). Supabase de EXPANSÃO (cygxmduuwlwfbodfrlkr).
--
-- Aplicado pela migration `vw_reuniao_live` em 24/11/2026; ajuste da R1 de
-- negócio LIVE pela migration `vw_reuniao_live_prefere_gravacao_em_grupo`
-- (mesmo dia).
-- Design: docs/superpowers/specs/2026-11-24-reunioes-live-design.md
--
-- O PROBLEMA
-- Desde nov/26 a Jéssica faz a R1 da Eletrovias em grupo ("LIVE"). Uma LIVE
-- gera vários Diagnósticos, mas é uma reunião só. O dashboard conta reuniões
-- pelo Diagnóstico, então precisa saber de qual LIVE veio cada Diagnóstico.
--
-- A REGRA (o título da gravação NÃO decide nada — só é exibido)
-- Para cada negócio/ciclo com Diagnóstico a partir de 01/11/2026 (piso: a LIVE
-- começou em novembro; `tipo_r1` é campo do negócio e vale para todos os
-- ciclos dele, então sem o piso um ciclo antigo entraria), a R1 dele é a
-- PRIMEIRA gravação de Closer (`vw_closer_reunioes`) em que o e-mail do negócio
-- (`deal_contatos`) está nos convidados (`attendees`), entre 14 dias antes do
-- Diagnóstico e o Diagnóstico. A primeira, e não a última: com a última, um
-- negócio movido para Diagnóstico depois da R2 caía na R2.
--
-- Exceção para negócio marcado LIVE: vale primeiro a gravação EM GRUPO
-- (convidados de 2+ negócios, `convidados_com_negocio`), e só sem ela a
-- primeira. Caso de origem (24/11): Rodrigo Cordova teve R1 individual com o
-- Douglas em 16/11 (ficou sem Diagnóstico), foi para a LIVE de 24/11 e virou
-- Diagnóstico depois dela; pela regra da primeira, a R1 individual do Douglas
-- aparecia como LIVE. Só esse negócio mudou.
--
-- Uma gravação é SESSÃO DE LIVE quando é a R1 de pelo menos um negócio com
-- `tipo_r1 = 'LIVE'`. Treinamento, live de marketing ou LIVE de R2 não somam
-- nada, porque ninguém nelas tem a gravação como R1.
--
-- O QUE SAI
-- Uma linha por negócio/ciclo que é LIVE ou cuja R1 é uma sessão de LIVE
-- (negócio marcado "Individual" que estava convidado na LIVE entra nela: foi a
-- mesma reunião). `call_id` nulo = negócio LIVE sem gravação encontrada (lead
-- que entrou por link sem convite, LIVE gravada sem convidados): o dashboard
-- trata como "LIVE estimada" (Closer + dia do Diagnóstico).
--
-- `convidados_externos` = convidados sem e-mail @wescale.com.br/@oralunic.com.br.
-- Convidado não é presente: o MeetRox guarda a lista do convite.
--
-- Medido em 24/11/2026: 45 negócios LIVE com Diagnóstico em novembro, 39 em
-- 8 gravações (as 8 "LIVE: ELETROVIAS"), 6 sem gravação. ~0,12 s.
-- ============================================================================

create or replace view public.vw_reuniao_live as
-- `materialized`: as gravações (com o nome do Closer, que vem de vw_closer_reunioes
-- e é caro) são calculadas UMA vez e só desde 15/10. Sem isso o Postgres embutia a
-- view dentro do LATERAL e refazia por Diagnóstico (427 ms contra 122 ms em 24/11).
with gravacoes as materialized (
  select cr.call_id, cr.call_timestamp, cr.closer, r.attendees, r.title, r.url,
         -- convidados (pessoas distintas) que são contato de algum negócio
         (select count(distinct lower(btrim(a)))
            from unnest(r.attendees) a
           where exists (select 1 from deal_contatos dc where lower(dc.email) = lower(btrim(a)))) as convidados_com_negocio
  from vw_closer_reunioes cr
  join "DB_Reunioes_MeetRox" r on r.id = cr.call_id
  where cr.call_timestamp >= timestamptz '2026-10-15 00:00-03'
),
diag as (
  select v.id_lead, v.ciclo, v.tipo_r1, v.data_reuniao_realizada
  from vw_funil_vendas v
  where v.data_reuniao_realizada >= timestamptz '2026-11-01 00:00-03'
),
r1 as (
  select d.id_lead, d.ciclo, d.tipo_r1, d.data_reuniao_realizada,
         g.call_id, g.call_timestamp, g.closer, g.title, g.url, g.attendees
  from diag d
  left join lateral (
    select g.*
    from gravacoes g
    where g.call_timestamp <= d.data_reuniao_realizada
      and g.call_timestamp >= d.data_reuniao_realizada - interval '14 days'
      and exists (
        select 1
        from unnest(g.attendees) a
        join deal_contatos dc on lower(dc.email) = lower(btrim(a)) and dc.id_deal = d.id_lead
      )
    order by (d.tipo_r1 = 'LIVE' and g.convidados_com_negocio >= 2) desc, g.call_timestamp, g.call_id
    limit 1
  ) g on true
),
sessoes as (
  select distinct call_id from r1 where tipo_r1 = 'LIVE' and call_id is not null
)
select
  r1.id_lead                 as id_deal,
  r1.ciclo,
  r1.tipo_r1,
  r1.data_reuniao_realizada  as data_diagnostico,
  s.call_id,
  case when s.call_id is not null then r1.call_timestamp end as call_timestamp,
  case when s.call_id is not null then r1.closer end         as closer,
  case when s.call_id is not null then r1.title end          as titulo,
  case when s.call_id is not null then r1.url end            as url,
  case when s.call_id is not null then (
    select count(*)::int
    from unnest(r1.attendees) a
    where lower(btrim(a)) not like '%@wescale.com.br'
      and lower(btrim(a)) not like '%@oralunic.com.br'
  ) end                                                      as convidados_externos
from r1
left join sessoes s on s.call_id = r1.call_id
where r1.tipo_r1 = 'LIVE' or s.call_id is not null;

comment on view public.vw_reuniao_live is
  'Negócio de LIVE (R1 em grupo) ligado à gravação do MeetRox que foi a R1 dele, por e-mail dos convidados. call_id nulo = sem gravação (LIVE estimada no dashboard). Ver docs/sql/2026-11-24-reuniao-live.sql.';

grant select on public.vw_reuniao_live to anon, authenticated;

-- Conferência (24/11/2026, depois do ajuste: 45 / 40 / 8)
-- select count(*), count(call_id), count(distinct call_id) from vw_reuniao_live where tipo_r1 = 'LIVE';
