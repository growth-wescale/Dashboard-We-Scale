-- Alerta pós-LIVE (Supabase de Expansão, cygxmduuwlwfbodfrlkr) — 10/11/2026
--
-- Por quê: desde nov/26 a Eletrovias faz a R1 em grupo ("LIVE: Eletrovias"). No MeetRox a LIVE
-- vira call sem tipo, ligada a UM negócio só, e a automação R1 → Diagnóstico não roda para os
-- outros convidados. O Closer move à mão, dias depois, e até isso a reunião não conta para a SDR
-- na Corrida da Campanha de Metas (o SDR pontua por Diagnóstico, data_reuniao_realizada).
-- Em 10/11 havia 11 convidados de LIVE parados em Reunião Agendada SQL (Cassiana 3, Sarah 6,
-- Xayane 1, mais o Lenilton reagendado).
--
-- O que faz: todo dia, de segunda a sábado, às 09h (Brasília), manda no Teams (mesmo canal dos
-- alertas da distribuição e do No Show, `teams_alertas_url` no Vault) uma mensagem por LIVE com
-- os convidados que seguem em Reunião Agendada SQL do funil do Closer. Sem pendência, não manda
-- nada. Repete todo dia enquanto o negócio não for movido, por até 14 dias depois da LIVE.
--
-- Regras de quem entra:
--   * reunião do MeetRox dos últimos 14 dias, terminada há mais de 2 h, com "live" ou "coletiva"
--     como palavra no título;
--   * convidado = e-mail em `attendees` fora de @wescale.com.br, ligado ao negócio por
--     `deal_contatos.email` (attendees é a lista de CONVIDADOS, não de quem entrou);
--   * negócio aberto, parado na Reunião Agendada SQL do funil do Closer (69b1badfe1def700137f1b89);
--   * a MARCA do negócio aparece no título da LIVE (sem acento e sem caixa). Assim live de
--     marketing ("Live Tendências de investimentos 2027", 19/10) não dispara. LIVE sem a marca no
--     título não gera alerta;
--   * entrou na etapa atual ANTES do início da LIVE. Quem foi reagendado depois (Lenilton: No Show
--     na LIVE de 04/11, reagendado em 07/11) só conta para a LIVE seguinte.
--
-- Conferir:  select * from vw_alerta_pos_live;              -- pendências de agora
--            select * from alerta_pos_live_envio order by id desc;   -- envios
--            select r.id, r.status_code, r.content from net._http_response r
--              where r.id = any((select request_ids from alerta_pos_live_envio order by id desc limit 1));
-- Desligar:  select cron.unschedule('alerta_pos_live');

begin;

create or replace function public.sem_acento(t text)
returns text language sql immutable parallel safe as $$
  select lower(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'))
$$;

create table if not exists public.alerta_pos_live_envio (
  id          bigserial primary key,
  enviado_em  timestamptz not null default now(),
  lives       int not null,
  negocios    int not null,
  request_ids bigint[] not null default '{}',
  pendencias  jsonb not null
);
alter table public.alerta_pos_live_envio enable row level security;
revoke all on public.alerta_pos_live_envio from anon, authenticated;

create or replace view public.vw_alerta_pos_live as
with live as (
  select r.id                 as id_reuniao,
         btrim(r.title)       as titulo,
         r.url                as url_gravacao,
         r.user_name          as anfitriao,
         r.call_timestamp     as inicio,
         r.call_timestamp + make_interval(secs => coalesce(r.duration_seconds, 0)) as fim,
         lower(btrim(a.email)) as email
  from public."DB_Reunioes_MeetRox" r
  cross join lateral unnest(r.attendees) as a(email)
  where r.call_timestamp >= now() - interval '14 days'
    and r.title ~* '\m(live|coletiva)\M'
    and lower(btrim(a.email)) not like '%@wescale.com.br'
),
cand as (
  select distinct l.id_reuniao, l.titulo, l.url_gravacao, l.anfitriao, l.inicio, l.fim,
         s.id_deal, s.marca, s.responsavel
  from live l
  join public.deal_contatos c on lower(btrim(c.email)) = l.email
  join public.deal_snapshot s on s.id_deal = c.id_deal
  where l.fim < now() - interval '2 hours'
    and s.deleted_at is null
    and s.status in ('open', 'ongoing')
    and s.id_etapa = '69b1badfe1def700137f1b89'
    and s.marca is not null
    and position(public.sem_acento(s.marca) in public.sem_acento(l.titulo)) > 0
)
select c.id_reuniao, c.titulo, c.url_gravacao, c.anfitriao, c.inicio, c.fim,
       c.id_deal, c.marca, c.responsavel,
       f.nome_negociacao, f.nome_sdr,
       e.entrou_na_etapa,
       'https://crm.rdstation.com/app/deals/' || c.id_deal as url_rd
from cand c
cross join lateral (
  select max(ev.data_evento) as entrou_na_etapa
  from public.deal_eventos ev
  where ev.id_deal = c.id_deal
    and ev.tipo_evento = 'mudanca_etapa'
    and ev.id_etapa = '69b1badfe1def700137f1b89'
) e
left join lateral (
  select fv.nome_negociacao, fv.nome_sdr
  from public.vw_funil_vendas fv
  where fv.id_lead = c.id_deal and fv.eh_ciclo_atual
  limit 1
) f on true
where e.entrou_na_etapa is null or e.entrou_na_etapa <= c.inicio;

revoke all on public.vw_alerta_pos_live from anon, authenticated;

-- Texto de cada LIVE. Separado do envio para dar para conferir sem mandar nada.
create or replace function public.alerta_pos_live_mensagens()
returns table (id_reuniao bigint, inicio timestamptz, negocios int, titulo text, texto text, link text)
language sql stable security definer set search_path = public as $$
  with p as (select * from public.vw_alerta_pos_live),
  grp as (
    select p.id_reuniao, p.titulo, p.anfitriao, p.inicio, p.url_gravacao,
           count(*)::int as n,
           string_agg(
             coalesce(p.nome_negociacao, p.id_deal)
               || ' (SDR ' || coalesce(p.nome_sdr, 'sem SDR')
               || case when public.sem_acento(split_part(p.responsavel, ' ', 1))
                            <> public.sem_acento(split_part(p.anfitriao, ' ', 1))
                       then ', dono no RD: ' || coalesce(p.responsavel, '—') else '' end
               || ') ' || p.url_rd,
             ' · ' order by p.nome_sdr nulls last, p.nome_negociacao) as itens
    from p
    group by p.id_reuniao, p.titulo, p.anfitriao, p.inicio, p.url_gravacao
  )
  select g.id_reuniao, g.inicio, g.n,
         'Pós-LIVE · ' || g.n || case when g.n = 1 then ' negócio' else ' negócios' end || ' para atualizar',
         g.titulo || ' de ' || to_char(g.inicio at time zone 'America/Sao_Paulo', 'DD/MM')
           || ' às ' || to_char(g.inicio at time zone 'America/Sao_Paulo', 'HH24"h"')
           || coalesce(nullif(to_char(g.inicio at time zone 'America/Sao_Paulo', 'MI'), '00'), '')
           || ' (' || g.anfitriao || '). '
           || case when g.n = 1 then 'Este convidado segue' else 'Estes convidados seguem' end
           || ' em Reunião Agendada SQL: mover para Diagnóstico quem participou e para No Show quem faltou.'
           || ' Até isso, a reunião não conta para a SDR na Campanha de Metas. '
           || g.itens,
         coalesce(g.url_gravacao, 'https://dashboard.srv1816822.hstgr.cloud/gp-setembro')
  from grp g
  order by g.inicio
$$;
revoke all on function public.alerta_pos_live_mensagens() from public, anon, authenticated;

create or replace function public.alertar_pos_live()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_url  text;
  v_ids  bigint[] := '{}';
  v_req  bigint;
  v_n    int := 0;
  v_lv   int := 0;
  v_pend jsonb;
  m      record;
begin
  select coalesce(jsonb_agg(to_jsonb(p) order by p.inicio, p.nome_sdr, p.nome_negociacao), '[]'::jsonb)
    into v_pend from public.vw_alerta_pos_live p;
  if jsonb_array_length(v_pend) = 0 then return 0; end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'teams_alertas_url';

  for m in select * from public.alerta_pos_live_mensagens() loop
    v_lv := v_lv + 1;
    v_n  := v_n + m.negocios;
    if v_url is not null then
      select net.http_post(
        url     := v_url,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body    := jsonb_build_object('titulo', m.titulo, 'texto', m.texto, 'link', m.link)
      ) into v_req;
      v_ids := v_ids || v_req;
    end if;
  end loop;

  insert into public.alerta_pos_live_envio (lives, negocios, request_ids, pendencias)
  values (v_lv, v_n, v_ids, v_pend);
  return v_n;
end $$;
revoke all on function public.alertar_pos_live() from public, anon, authenticated;

commit;

-- Agendamento (fora da transação): 12:00 UTC = 09:00 em Brasília, segunda a sábado.
select cron.schedule('alerta_pos_live', '0 12 * * 1-6', 'select public.alertar_pos_live()');
