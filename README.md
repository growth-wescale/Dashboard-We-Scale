# Dashboard We Scale

Dashboard de performance de marketing e vendas da We Scale (Reccon Marketing).

- **Produção**: <https://dashboard.srv1816822.hstgr.cloud>
- **Stack**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Supabase + React Router 7
- **Deploy**: automático via GitHub Actions em push pra `main` (build + rsync pra VPS)

## Como rodar localmente

```bash
git clone git@github.com:gabriellimas-afk/Dashboard.git
cd Dashboard
cp .env.example .env
# preencher .env com as chaves do Supabase (peça pro owner)
npm install
npm run dev
# abre em http://localhost:5173
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Dev server com HMR (Vite) |
| `npm run build` | Build de produção pra `dist/` |
| `npm run preview` | Preview do build local |
| `npx tsc --noEmit` | Type-check sem gerar arquivos |

## Estrutura

```
src/
├── pages/          # Rotas do dashboard (VisaoGeral, SaudeDaMarca, ...)
├── components/     # Componentes reutilizáveis (Sidebar, MetricCard, ...)
│   └── ui/         # Primitivos + widgets (Badge, TermosPanel, SocialPanel)
├── hooks/          # Data hooks (useMediaData, useVendasFunil, ...)
├── lib/            # Utilitários (format, dateUtils, csv, supabase clients)
└── constants/      # Config estática (BRAND_DEFS, metas, etc)

.github/workflows/  # CI/CD (deploy automático)
```

## Fontes de dados

O dashboard consome 2 projetos Supabase:
- **Marketing** (`jmuluoksnlqrvzbcltim`): media_daily_raw (Meta+Google Ads), leads, keywords_daily, search_terms_daily, fb_page_daily, fb_posts
- **Vendas** (`cygxmduuwlwfbodfrlkr`): vw_marketing_funil (read-only)

Ingestão roda em Edge Functions no Supabase (Meta Ads hourly, Google Ads hourly, Search Terms daily, Facebook Pages daily). Ver `CLAUDE.md` pra arquitetura detalhada.

## Documentos importantes

| Doc | O que tem |
|---|---|
| [`SECURITY.md`](SECURITY.md) | **Leitura obrigatória**. Regras de segurança + rotina de verificação diária. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Como abrir PR, convenções de commit, review. |
| [`CLAUDE.md`](CLAUDE.md) | Contexto de arquitetura pra IA (útil pra humanos também). |

## Deploy

Não faz deploy manual. É feito automaticamente pelo GitHub Actions:

1. Você abre PR → Actions roda type-check + build no CI
2. Merge na `main` → Actions builda + faz rsync pra `/opt/dashboard/dist/` na VPS
3. Nginx (dashboard-app-1) serve o build atualizado

Deploy manual (rsync do laptop) está desativado — todo deploy passa pela pipeline pra manter histórico.

## Suporte

- Bugs / features → GitHub Issues
- Segurança / incidentes → contato direto com owner (ver `SECURITY.md`)
