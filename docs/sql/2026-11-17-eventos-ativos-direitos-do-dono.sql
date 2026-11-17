-- 2026-11-17 — eventos_ativos.deal_eventos volta a rodar com os direitos do dono.
--
-- Em 16/11 (docs/sql/2026-11-16-inativar-eventos.sql) a view foi criada com
-- security_invoker = true e as views públicas passaram a ler eventos por ela. Com
-- isso, quando o dashboard consulta uma view pública como `anon` (o Supabase de
-- Expansão nunca autentica), a RLS de public.deal_eventos (ligada, sem política)
-- é checada como anon e a leitura de eventos volta VAZIA, sem erro. Efeitos
-- medidos em 17/11, só nas leituras diretas do navegador (as abas de Vendas leem
-- dash_vendas/dash_etapas, montadas pelo banco, e não foram afetadas):
--   - Linha do Tempo: vw_deal_timeline_eventos = 0 linhas → pista só com "MQL";
--   - vw_funil_vendas.origem_comercial: os 1.572 de Prospecção Ativa viravam Inbound;
--   - vw_funil_etapas_v2: 0 linhas.
-- Antes de 16/11 essas views liam public.deal_eventos com os direitos do dono
-- (postgres), que é o comportamento devolvido aqui. O schema eventos_ativos NÃO é
-- exposto na API (pgrst.db_schemas = public, graphql_public, cadencia), então anon
-- continua sem ler a view direto. Eventos inativados seguem fora (where ativo).

alter view eventos_ativos.deal_eventos set (security_invoker = false);

-- Conferência (como anon):
-- begin; set local role anon;
-- select count(*) from vw_deal_timeline_eventos where id_deal = '6ad353df18e4e30001c9677d';  -- 12
-- select count(*) from vw_funil_vendas where origem_comercial = 'Prospecção Ativa';          -- 1.572
-- select count(*) from eventos_ativos.deal_eventos where not ativo;                          -- 0
-- rollback;
