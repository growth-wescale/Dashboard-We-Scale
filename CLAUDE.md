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

## ⚠️ TAREFA PENDENTE — Migração n8n Reccon → We Scale (interrompida 2026-07-21)

### Contexto
Os workflows de ingestão de dados rodavam no n8n da **Reccon** (`recconmarketing.app.n8n.cloud`).
A meta é migrá-los para o n8n da **We Scale** (`n8n.wescale.com.br`).

### O que foi feito
Os 3 workflows **ativos** foram criados via API no n8n da We Scale:

| Workflow | ID no We Scale n8n |
|---|---|
| Meta Ads → media_daily_raw | `44gfr8W9f0T61l1Q` |
| ~~RD CRM → crm_funil_raw~~ | ~~`jUYN5lv8pPp4pC6U`~~ (descontinuado 04/ago — funil agora vem do banco de vendas) |
| Google Ads → media_daily_raw | `jBRaeio8Vm6gIhuw` |

Todos criados como **inativos** (precisam de credenciais antes de ativar).

### Problema atual — visibilidade
Os workflows foram criados no **espaço pessoal do dono da API key** (projeto `FOVRZNljim1bDoy1`), não num projeto de equipe compartilhado. O Gabriel não conseguia vê-los na interface porque é outro usuário na conta.

**Pergunta pendente (para retomar amanhã):**
> Essa API key foi gerada por você (Gabriel) ou por outro usuário/admin? E no n8n tem seletor de projeto no topo da tela?

### Opções de solução
1. **Se a API key é do Gabriel**: os workflows estão no espaço pessoal dele — verificar se está olhando para o projeto certo na UI.
2. **Se a API key é de outro usuário**: precisamos de uma API key do próprio Gabriel para recriar os workflows no espaço dele, ou ele precisa mover via UI para um projeto de equipe.
3. **Projeto de equipe**: se existir um projeto compartilhado, mover os 3 workflows via UI (arrastar ou opção de mover) para lá.

### Credenciais a reconectar (após resolver visibilidade)
Antes de ativar os workflows, reconectar no painel:
- **Meta token** (`httpQueryAuth`) — nó "Buscar Insights Meta"
- **Google Ads OAuth2** (`googleAdsOAuth2Api`) — nó "Buscar Insights Google Ads"
- **RD CRM OAuth2** (`oAuth2Api`) — nó "Buscar Deals RD CRM"
- **Supabase** (`supabaseApi`) — nós de upsert que usam `predefinedCredentialType`
  - Exceção: `Upsert crm_funil_historico` já usa anon key hardcoded, não precisa

### Workflows originais na Reccon (manter até migração confirmada)
- `1CEMDCFbCV5w7YhE` — Meta Ads (ativo, roda 1x/hora)
- ~~`ZxQkRS17ZAEGWVxW`~~ — RD CRM → crm_funil_raw (**descontinuado 04/ago** — pode desativar; funil migrou para banco de vendas)
- `ZkujY5ZJpCTlvjam` — Google Ads (ativo, roda 1x/hora)

Não desativar Meta e Google na Reccon até os da We Scale estarem ativos e confirmados funcionando.
