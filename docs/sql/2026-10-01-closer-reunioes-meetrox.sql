-- ============================================================================
-- Reuniões dos Closers por tipo (R1–R5) — base do bloco "Reuniões no MeetRox"
-- da aba Performance › Closer. Supabase de EXPANSÃO (cygxmduuwlwfbodfrlkr).
--
-- Aplicado pela migration `vw_closer_reunioes` em 01/10/2026.
--
-- POR QUE UMA VIEW
-- O dashboard lê o projeto de Expansão como role `anon` (ver
-- 2026-09-16-linha-do-tempo-views.sql) e `DB_Reunioes_MeetRox` tem RLS só pra
-- `authenticated` — lida direto, volta vazia. A view roda com os direitos do
-- dono e expõe só metadado: tipo, data, duração, nota, título e link da
-- gravação. Nada de transcrição, resumo ou scorecard.
--
-- TIPO DA REUNIÃO
-- Vem do tipo de call escolhido no MeetRox (call_type_id), com o scorecard
-- como reserva:
--   4554 R1 Diagnóstico                      4557 R4 Alinhamento COF
--   4555 R2 Apresentação Técnica e Financeira 4558 R5 Devolutiva do Comitê + Fechamento
--   4556 R3 Geomarketing + Explicação Comitê
-- `tipo` nulo = gravada sem tipo ("Undefined"): reunião interna OU reunião de
-- venda que o closer não classificou. Só entra para quem é Closer.
--
-- MARCA / ORIGEM / FONTE / SDR
-- Vêm do negócio do RD ligado à reunião (`coalesce(id_deal, crm_deal_id)` —
-- `id_deal` quase nunca vem preenchido), lido de `vw_funil_vendas`: mesma
-- marca, origem e SDR das outras abas. Deal reciclado: usa o ciclo em vigor
-- na data da reunião. Reunião sem negócio (ou com negócio fora do funil:
-- teste, sem marca) chega com `marca` nula.
--
-- NOME DO CLOSER
-- O MeetRox grava o nome completo ("Jessica Alves Santos"); o resto do
-- dashboard usa o nome do RD ("Jéssica"). A tradução é por e-mail: primeiro a
-- lista abaixo, depois `nome_cargo_foto.email`, por fim o nome do MeetRox.
-- Closer novo sem e-mail em nenhum dos dois aparece com o nome do MeetRox —
-- basta acrescentar uma linha em `pessoa`.
-- ============================================================================

create or replace view public.vw_closer_reunioes as
with pessoa(email, nome) as (
  values
    ('douglas.silva@wescale.com.br',      'Douglas'),
    ('jessica.santos@wescale.com.br',     'Jéssica'),
    ('romulo.machado@wescale.com.br',     'Rômulo'),
    ('giullia.pinotti@wescale.com.br',    'Giullia'),
    ('aurelio.briano@oralunic.com.br',    'Aurélio Briano'),
    ('danilo.machado@oralunic.com.br',    'Danilo'),
    ('cristhian.stefanes@wescale.com.br', 'Cristhian Stefanes'),
    ('bruna.silva@wescale.com.br',        'Bruna'),
    ('paula.marinheiro@wescale.com.br',   'Paula Marinheiro')
),
calls as (
  select
    r.id,
    case r.call_type_id
      when 4554 then 'R1' when 4555 then 'R2' when 4556 then 'R3'
      when 4557 then 'R4' when 4558 then 'R5'
      else case when r.scorecard_name in ('R1','R2','R3','R4','R5') then r.scorecard_name end
    end as tipo,
    r.call_timestamp,
    r.duration_seconds,
    r.ai_score,
    lower(r.user_email) as email,
    r.user_name,
    coalesce(r.id_deal, r.crm_deal_id) as id_deal,
    r.crm_deal_label,
    r.lead_name,
    r.title,
    r.url
  from "DB_Reunioes_MeetRox" r
  where r.call_timestamp is not null
)
select
  c.id                                         as call_id,
  c.tipo,
  c.call_timestamp,
  round((c.duration_seconds / 60.0)::numeric, 1) as duracao_min,
  c.ai_score,
  coalesce(p.nome, ncf.nome, c.user_name)      as closer,
  c.id_deal,
  (v.id_lead is not null)                      as deal_no_funil,
  coalesce(v.nome_negociacao, nullif(c.crm_deal_label, ''), nullif(c.lead_name, '')) as negociacao,
  c.title                                      as titulo,
  c.url,
  v.marca,
  v.origem_comercial,
  v.fonte_macro,
  v.utm_source,
  v.sub_fonte_crm,
  v.nome_sdr,
  v.status_atual
from calls c
left join pessoa p on p.email = c.email
left join lateral (
  select n.nome, n.cargo
  from nome_cargo_foto n
  where lower(n.email) = c.email
  limit 1
) ncf on true
left join lateral (
  select v.id_lead, v.nome_negociacao, v.marca, v.origem_comercial, v.fonte_macro,
         v.utm_source, v.sub_fonte_crm, v.nome_sdr, v.status_atual
  from vw_funil_vendas v
  where v.id_lead = c.id_deal
  order by (v.data_criacao_negociacao <= c.call_timestamp) desc, v.ciclo desc
  limit 1
) v on true
-- Reunião tipada entra sempre; sem tipo, só de quem é Closer (SDR grava
-- conversa com lead sem tipo e não é reunião de venda).
where c.tipo is not null
   or p.email is not null
   or ncf.cargo in ('Closer', 'SDR/Closer');

comment on view public.vw_closer_reunioes is
  'Reuniões gravadas no MeetRox por closer e tipo (R1–R5), com marca/origem/fonte/SDR do negócio vinculado. Base de Performance › Closer › Reuniões no MeetRox. Ver docs/sql/2026-10-01-closer-reunioes-meetrox.sql.';

grant select on public.vw_closer_reunioes to anon, authenticated;
