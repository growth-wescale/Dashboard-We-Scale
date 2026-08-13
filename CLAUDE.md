# Dashboard We Scale — Contexto para Claude Code

## Projeto
Dashboard de performance de marketing da We Scale (Reccon Marketing).
- **Stack**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Supabase + React Router 7
- **VPS**: root@89.117.32.70 — deploy via `rsync dist/ → /opt/dashboard/dist/`
- **URL produção**: https://dashboard.srv1816822.hstgr.cloud
- **Deploy**: `npm run build && rsync -az --delete dist/ root@89.117.32.70:/opt/dashboard/dist/`

## Memórias detalhadas
Ver `/Users/gablimas/.claude/projects/-Users-gablimas-Documents-We-Scale-Dashboard/memory/`

---

## ✅ Loading reload ao trocar período — IMPLEMENTADO (2026-07-21)

Padrão `loading ? <Spinner> : <Conteudo>` substituído por wrapper com `opacity: loading ? 0.5 : 1` em:
- `SaudeDaMarca.tsx`: wraps o `{body}` (linha ~1760)
- `VisaoGeral.tsx`: `opacity` direto no `<div {...rootProps}>` principal + wrapper no bloco de pacing

---

## O que foi feito nesta sessão (2026-07-21)

1. **Conta Meta Inpot substituída** nos workflows n8n:
   - Conta antiga: `1025593326315005` (restrita/perdida)
   - Conta nova: `987872747563639`
   - Alterados: workflow `1CEMDCFbCV5w7YhE` (ativo, 1x/hora) e `5o4BazIAFFjgGsWk` (histórico)
   - Dados históricos da conta antiga preservados na base

2. **BubbleMatrix adicionado à SaudeDaMarca (aba Visão Geral)**:
   - Arquivo: `src/components/ui/BubbleMatrix.tsx`
   - SVG puro, eixo X = faixas de aging, eixo Y = etapas abertas (MQL→SQL→Diagnóstico→SAL)
   - Deduplicação por deal_id, bolhas com escala √, tooltip completo
   - Filtros por canal e campanha
   - Layout: grid `1fr 1fr` ao lado do "Funil de aquisição"

3. **Filtros de período corrigidos** (liberados para meses anteriores):
   - `VisaoGeral.tsx`: removido `min={monthStart}` e `max={monthEnd}` do DateRange
   - `SaudeDaMarca.tsx`: presets expandidos para Mês -1, Mês -2, Mês -3, 90d

4. **Leads de teste deletados** (5 emails tipo gaasfsadfbriel... @wescale.com.br)

---

## ✅ Migração n8n → Supabase Edge Functions (2026-08-13)

A ingestão de mídia deixou de depender de n8n. Agora roda direto em Edge Functions do Supabase, agendadas via pg_cron.

### Edge Functions ativas (projeto `jmuluoksnlqrvzbcltim`)
| Function | Cron job | Escreve em | Schedule |
|---|---|---|---|
| `ingest-meta-ads` | `ingest-meta-prod-hourly` | `media_daily_raw` | minuto **5** de cada hora |
| `ingest-google-ads` | `ingest-google-prod-hourly` | `media_daily_raw` | minuto **10** de cada hora |
| `ingest-google-search-terms` | `ingest-google-search-terms-daily` | `keywords_daily` + `search_terms_daily` | **05:20 UTC** (02:20 BRT) — yesterday |
| `ingest-facebook-pages` | `ingest-facebook-pages-daily` | `fb_page_daily` + `fb_posts` | **05:30 UTC** (02:30 BRT) — janela 3d + posts 30d |

Ambas invocadas via `net.http_post` pelo helper `public.trigger_ingest(fn_slug, body)`.

**Cutover realizado 2026-08-13.** Workflows n8n Reccon `1CEMDCFbCV5w7YhE` (Meta) e `ZkujY5ZJpCTlvjam` (Google) foram **desativados** (não deletados — pode reativar em 1 clique se precisar). Tabela `media_daily_raw_shadow` ainda existe: dropar em ~2 semanas se tudo estiver estável.

### Secrets no Supabase Vault
`META_ACCESS_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_LOGIN_CUSTOMER_ID` (=8489211674), `SUPABASE_ANON_KEY`. Acesso via RPC `public.get_secret(name)` — SECURITY DEFINER, grant só a service_role.

### Estado das ingestões
- **Google Ads**: n8n Reccon (`ZkujY5ZJpCTlvjam`) estava chamando API v21 **deprecada** e falhava silenciosamente. Edge Function usa v22, cobre 10 contas (incluindo nova marca **"Scale Partners"** = evento presencial We Scale). Backfill de 30 dias feito em 2026-08-13.
- **Meta Ads**: n8n Reccon (`1CEMDCFbCV5w7YhE`) ainda ativo escrevendo em `media_daily_raw`. Edge Function roda em paralelo escrevendo em `media_daily_raw_shadow` para validação (5-7 dias). Cutover: apontar Edge Function pra `media_daily_raw` e desligar n8n.

### Como invocar manualmente
```bash
# Meta
curl -X POST https://jmuluoksnlqrvzbcltim.supabase.co/functions/v1/ingest-meta-ads \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -d '{"date_preset":"today","table":"media_daily_raw_shadow"}'

# Google (aceita: today, yesterday, last_7_days, last_14_days, last_30_days, this_month, last_month, ou {"time_range":{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}})
curl -X POST https://jmuluoksnlqrvzbcltim.supabase.co/functions/v1/ingest-google-ads \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -d '{"date_preset":"last_30_days","table":"media_daily_raw"}'
```

### Mapping detalhado marca ↔ conta
Ver `memory/project_media_ingestion.md`.
