-- ============================================================================
-- Linha do Tempo do Deal — acesso de leitura (Supabase de EXPANSÃO)
--
-- POR QUE ISSO EXISTE
-- O dashboard fala com o projeto de Expansão SEMPRE como role `anon`:
-- `src/lib/supabaseVendas.ts` cria o cliente com `persistSession: false` e
-- nunca autentica (o login vive no projeto de Marketing). Medido em 16/09:
--
--   deal_eventos          RLS ligado, 0 políticas              -> anon lê VAZIO
--   db_tarefas_sdr        RLS ligado, 1 política (authenticated) -> anon lê VAZIO
--   DB_Reunioes_MeetRox   RLS ligado, 1 política (authenticated) -> anon lê VAZIO
--
-- Sem isto a Linha do Tempo carrega o cabeçalho (que vem de `vw_funil_vendas`,
-- uma view com SELECT pro anon) e mostra a pista VAZIA pra todo mundo.
--
-- Os 7 hooks de Vendas que já existem leem VIEW, nunca tabela crua — é assim
-- que o dash contorna o RLS hoje. Estas 3 views seguem o mesmo padrão e
-- expõem só as colunas que a tela usa.
--
-- >>> DECISÃO DE EXPOSIÇÃO (Junior): a anon key deste projeto é pública.
-- >>> O bloco A expõe metadado (etapas, tipos de tarefa, duração e nota de
-- >>> reunião). O bloco B, comentado, acrescenta CONTEÚDO (notas de tarefa e
-- >>> resumo de reunião: nome de cliente, objeções, valores discutidos).
-- >>> Rodar o bloco A sozinho já faz a tela funcionar. Só descomente o B se
-- >>> estiver confortável com esse conteúdo legível por quem tiver a chave.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- BLOCO A — o necessário pra tela funcionar (metadado, sem conteúdo de call)
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Eventos do deal (etapas, perda, ganho, reciclagem, trocas)
create or replace view public.vw_deal_timeline_eventos as
select
  e.id_evento,
  e.id_deal,
  e.tipo_evento,
  e.nome_funil,
  e.id_etapa,
  e.nome_etapa,
  e.nome_etapa_anterior,
  e.responsavel,
  e.valor_anterior,
  e.valor_novo,
  e.data_evento,
  e.motivo_perda,
  e.anotacao_perda
from public.deal_eventos e
-- só deals que o dashboard já mostra (mesma fronteira de visibilidade da
-- vw_funil_vendas: sem teste, sem Excluído, sem funil fora do escopo)
where exists (select 1 from public.vw_funil_vendas v where v.id_lead = e.id_deal);

-- 2) Tarefas do SDR (ligação, WhatsApp, e-mail) — SEM as notas
create or replace view public.vw_deal_timeline_tarefas as
select
  t.task_id,
  t.subject,
  null::text as notes,          -- bloco B troca por t.notes
  t.type,
  t.done,
  t.status_calc,
  t.prazo,
  t.done_date,
  t.user_name,
  t.deal_id
from public.db_tarefas_sdr t
where exists (select 1 from public.vw_funil_vendas v where v.id_lead = t.deal_id);

-- 3) Reuniões do MeetRox — SEM resumo e SEM scorecard.
--    Nunca expor transcription / api_payload / associations_raw / phrase_trackers.
create or replace view public.vw_deal_timeline_reunioes as
select
  r.id,
  r.title,
  r.url,
  r.call_timestamp,
  r.call_type_name,
  r.user_name,
  r.duration_minutes,
  r.ai_score,
  r.scorecard_name,
  null::jsonb as summary,            -- bloco B troca por r.summary
  null::jsonb as scorecard_answers,  -- bloco B troca por r.scorecard_answers
  r.attendees,
  r.id_deal,
  r.crm_deal_id,
  r.has_summary,
  r.has_scorecard
from public."DB_Reunioes_MeetRox" r
where exists (
  select 1 from public.vw_funil_vendas v
   where v.id_lead = coalesce(r.id_deal, r.crm_deal_id)
);

grant select on public.vw_deal_timeline_eventos  to anon, authenticated;
grant select on public.vw_deal_timeline_tarefas  to anon, authenticated;
grant select on public.vw_deal_timeline_reunioes to anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- BLOCO B — conteúdo de call (OPCIONAL, decisão do Junior)
-- Descomente e rode só se aceitar que notas de tarefa e resumo de reunião
-- fiquem legíveis por quem tiver a anon key (que é pública hoje).
-- ─────────────────────────────────────────────────────────────────────────
-- begin;
-- create or replace view public.vw_deal_timeline_tarefas as
-- select t.task_id, t.subject, t.notes, t.type, t.done, t.status_calc,
--        t.prazo, t.done_date, t.user_name, t.deal_id
--   from public.db_tarefas_sdr t
--  where exists (select 1 from public.vw_funil_vendas v where v.id_lead = t.deal_id);
--
-- create or replace view public.vw_deal_timeline_reunioes as
-- select r.id, r.title, r.url, r.call_timestamp, r.call_type_name, r.user_name,
--        r.duration_minutes, r.ai_score, r.scorecard_name,
--        r.summary, r.scorecard_answers, r.attendees,
--        r.id_deal, r.crm_deal_id, r.has_summary, r.has_scorecard
--   from public."DB_Reunioes_MeetRox" r
--  where exists (select 1 from public.vw_funil_vendas v
--                 where v.id_lead = coalesce(r.id_deal, r.crm_deal_id));
--
-- grant select on public.vw_deal_timeline_tarefas  to anon, authenticated;
-- grant select on public.vw_deal_timeline_reunioes to anon, authenticated;
-- commit;

-- ─────────────────────────────────────────────────────────────────────────
-- CONFERIR DEPOIS DE RODAR (deve voltar 3 linhas com contagem > 0)
-- ─────────────────────────────────────────────────────────────────────────
-- select 'eventos' t, count(*) from public.vw_deal_timeline_eventos
--  where id_deal = '6a602d9af6ddd200016926fb'
-- union all
-- select 'tarefas', count(*) from public.vw_deal_timeline_tarefas
--  where deal_id = '6a47912521e2480001654a89'
-- union all
-- select 'reunioes', count(*) from public.vw_deal_timeline_reunioes
--  where coalesce(id_deal, crm_deal_id) = '6a47912521e2480001654a89';
