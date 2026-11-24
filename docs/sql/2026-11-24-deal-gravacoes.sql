-- ============================================================================
-- Gravações do MeetRox por negócio — base da coluna "Gravações" dos pop-ups de
-- deal das abas de Vendas (menos a Análise de Perda). Supabase de EXPANSÃO.
--
-- Aplicado pela migration `vw_deal_gravacoes` em 24/11/2026.
--
-- Uma linha por (negócio, gravação). Só gravações de reunião de venda — o mesmo
-- conjunto do bloco "Reuniões no MeetRox" (`vw_closer_reunioes`: gravação com
-- tipo R1–R5 ou feita por Closer), com link.
--
-- Como a gravação chega ao negócio (qualquer um dos dois):
--   1. o vínculo do próprio MeetRox (`coalesce(id_deal, crm_deal_id)`), que é
--      1 negócio só por gravação;
--   2. o e-mail do negócio (`deal_contatos`) entre os convidados. É o que liga
--      a LIVE a todos os participantes, e a R1 que o MeetRox não vinculou.
--
-- `eh_live` = a gravação é uma sessão de LIVE em `vw_reuniao_live`.
--
-- Medido em 24/11/2026: ~1,4 mil linhas, ~0,35 s.
-- ============================================================================

create or replace view public.vw_deal_gravacoes as
with grav as materialized (
  select cr.call_id, cr.tipo, cr.call_timestamp, cr.closer, cr.titulo, cr.url,
         cr.id_deal as id_deal_meetrox, r.attendees
  from vw_closer_reunioes cr
  join "DB_Reunioes_MeetRox" r on r.id = cr.call_id
  where cr.url is not null
),
ligacoes as (
  select call_id, id_deal_meetrox as id_deal from grav where id_deal_meetrox is not null
  union
  select g.call_id, dc.id_deal
  from grav g
  cross join lateral unnest(g.attendees) a
  join deal_contatos dc on lower(dc.email) = lower(btrim(a))
  where lower(btrim(a)) not like '%@wescale.com.br'
    and lower(btrim(a)) not like '%@oralunic.com.br'
),
lives as (
  select distinct call_id from vw_reuniao_live where call_id is not null
)
select l.id_deal, g.call_id, g.tipo, (lv.call_id is not null) as eh_live,
       g.call_timestamp, g.closer, g.titulo, g.url
from ligacoes l
join grav g on g.call_id = l.call_id
left join lives lv on lv.call_id = g.call_id;

comment on view public.vw_deal_gravacoes is
  'Gravações do MeetRox (reunião de venda) de cada negócio, pelo vínculo do MeetRox ou pelo e-mail nos convidados. Coluna "Gravações" dos pop-ups de deal. Ver docs/sql/2026-11-24-deal-gravacoes.sql.';

grant select on public.vw_deal_gravacoes to anon, authenticated;

-- Conferência
-- select count(*), count(distinct id_deal), count(distinct call_id), count(*) filter (where eh_live) from vw_deal_gravacoes;
