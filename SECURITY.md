# Segurança & Operações Diárias

Este documento é a **fonte única** de regras de segurança e do procedimento diário de verificação
do dashboard We Scale. Vale pra qualquer pessoa com acesso ao repositório ou à VPS.

> **⚠️ Este documento é read-only pra equipe.**
> Se você descobrir um bug, erro, invasão ou anomalia, **abra uma issue** — não corrija na
> verificação e não altere o processo. Qualquer mudança neste arquivo precisa de PR revisado
> e aprovado pelo owner (Gabriel Limas). Isso garante que todos rodem exatamente o mesmo
> check e não surjam divergências silenciosas.

---

## 1. Regras de segurança — o que NUNCA fazer

### 1.1 Secrets
- **Nunca commitar** `.env`, `.env.local`, ou qualquer arquivo com token, senha, chave de API.
  Só existe `.env.example` no repo, com placeholders.
- **Nunca colar tokens no chat, Slack, GitHub Issues, ou README.** Se precisar compartilhar,
  use canal privado 1:1 com o owner e o token será rotado assim que a integração estiver ok.
- **Secrets vivem no Supabase Vault** (`vault.decrypted_secrets`), consultados via RPC
  `public.get_secret(name)` que é acessível apenas por `service_role`. Nenhum token de API
  externo (Meta, Google Ads) deve aparecer em código de app ou Edge Function.
- **Anon key do Supabase é publicável** (fica no bundle JS mesmo). O que protege os dados
  é o **RLS** habilitado nas tabelas. Não confie que o anon key é "secreto".
- **Service role key NUNCA vai pro cliente.** Só Edge Functions (que rodam server-side no
  Supabase) devem usar service role.

### 1.2 Acessos
- **SSH da VPS** (`root@89.117.32.70`): cada pessoa usa a própria chave. Nada de compartilhar
  chave privada. Chaves são adicionadas em `/root/.ssh/authorized_keys` pelo owner. Ao sair
  do time, chave é revogada no mesmo dia.
- **GitHub**: 2FA obrigatório na conta pessoal antes de ser adicionado como Collaborator.
- **Supabase Studio**: acesso concedido individualmente. Nunca compartilhe login.
- **Meta Business Manager / Google Ads MCC**: acesso via usuário nomeado, nunca via
  conta compartilhada.

### 1.3 Deploy
- Deploy em produção só pela pipeline (GitHub Actions em push pra `main`). Nada de rsync
  manual do laptop pra `/opt/dashboard/dist/` — quebra o histórico e pode subir código
  não-revisado.
- Toda mudança em produção passa por PR + review. Zero commit direto na `main`.

### 1.4 Se algo vazar
Se você suspeitar que um token/chave foi exposto (commit acidental, screenshot, log público, etc):
1. **Não delete o commit sozinho** — o histórico ainda é acessível. Contate o owner **imediatamente**.
2. Rote o token na origem (Supabase → regenera anon key; Meta → gera novo access token; etc).
3. Atualize o Vault e o `.env` de todo dev com o novo valor.
4. Investigue logs do Supabase / API pra ver se houve uso não-autorizado.

---

## 2. Verificação diária

Roda **todo dia útil pela manhã** (idealmente por 1 pessoa por vez, alternando).
Duração: ~5 minutos.

Passos abaixo são **read-only** — leituras de git, SSH, HTTP e SQL. Nenhum passo modifica
estado. Se você quiser ajustar um passo (ex: adicionar métrica nova), abra PR editando este
documento.

### 2.1 Git — commits recentes e branch state

```bash
git status
git log --oneline -5
```

**Esperado**: `main` limpa ou com apenas mudanças conhecidas. Se houver commits não
identificados, investigue quem fez e por quê.

### 2.2 VPS — deploy e containers

```bash
ssh root@89.117.32.70 "ls -la /opt/dashboard/dist/index.html && \
  docker ps --format 'table {{.Names}}\t{{.Status}}' | grep dashboard"
```

**Esperado**:
- `index.html` com timestamp recente (últimas 24h se houve deploy, ou última data conhecida)
- Container `dashboard-app-1` com status `Up ... hours/days`

Se `dashboard-app-1` estiver com status `Restarting` ou fora da lista, é incident — avise
o owner.

### 2.3 HTTP — produção respondendo

```bash
curl -s -o /dev/null -w "HTTP %{http_code} — %{time_total}s\n" https://dashboard.srv1816822.hstgr.cloud
```

**Esperado**: `HTTP 200 — <1s`.

### 2.4 Ingestão Supabase — dados fresh

Rodar no Supabase Studio (projeto `jmuluoksnlqrvzbcltim`, SQL Editor) ou via MCP:

```sql
SELECT 'media_daily_raw (meta)' AS tabela, MAX(criado_em) AS ultima_ingestao, MAX(dia) AS ultimo_dia,
       COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '2 hours') AS ultimas_2h
FROM media_daily_raw WHERE canal='meta'
UNION ALL
SELECT 'media_daily_raw (google)', MAX(criado_em), MAX(dia),
       COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '2 hours')
FROM media_daily_raw WHERE canal='google'
UNION ALL
SELECT 'leads', MAX(criado_em), MAX(dia)::date,
       COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '24 hours')
FROM leads;
```

**Esperado**:
- `media_daily_raw (meta)` e `(google)`: `ultimo_dia` = hoje (ou D-1 dependendo do horário),
  `ultimas_2h` > 0 (as Edge Functions rodam de hora em hora)
- `leads`: `ultimo_dia` = hoje, dezenas nas últimas 24h em dias úteis

Se `ultimas_2h` = 0 em ambos canais, algo travou. Ver passo 2.5.

### 2.5 Cron — jobs de ingestão

```sql
SELECT j.jobname, r.status, r.start_time, LEFT(r.return_message, 100) AS msg
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname LIKE 'ingest-%'
  AND r.start_time > NOW() - INTERVAL '2 hours'
ORDER BY r.start_time DESC;
```

**Esperado**: entradas com `status='succeeded'` nas últimas 2h para `ingest-meta-prod-hourly`
e `ingest-google-prod-hourly`. Jobs diários (`ingest-google-search-terms-daily`,
`ingest-facebook-pages-daily`) rodam entre 05:20-05:30 UTC — checar 1x/dia.

### 2.6 Tabelas que NÃO fazem parte da verificação

- `crm_funil_raw` e `crm_funil_historico` — descontinuadas 04/ago/2026 (funil migrou pra
  `vw_marketing_funil` no banco de vendas). Ignorar mesmo se pararem.
- `vendas_hotmart` — descontinuada 10/ago/2026 (sem mais vendas diretas Hotmart). Tabela
  vazia é esperado.

---

## 3. Como reportar achados

Se algo saiu do esperado em qualquer passo:

1. **Abra uma issue no GitHub** com o template abaixo. Não tente corrigir no ato (salvo
   incident crítico com produção fora, aí avise o owner primeiro).
2. Marque com label `security` se envolver credencial vazada / acesso indevido; `bug` se
   for erro de código; `data` se for divergência de ingestão.
3. Se for **alta severidade** (produção down, credencial vazada, dados incorretos afetando
   decisão), avise o owner **imediatamente** pelo canal privado antes mesmo de abrir a issue.

### Template de issue

```markdown
**Data / hora da verificação**: DD/MM HH:MM
**Passo do check onde apareceu**: 2.4 (Ingestão Supabase)
**O que foi observado**:
Output do comando / query, ou screenshot.

**O que era esperado**:
Referência ao SECURITY.md seção X.

**Impacto suposto**: (baixo/médio/alto)
**Ação sugerida**: (opcional — não obrigatório sugerir fix)
```

---

## 4. O que NÃO fazer nesta rotina

- ❌ **Não altere queries do check** — se você acha que precisa ajustar, abra PR.
- ❌ **Não corrija bugs "de leve" durante o check** — abra issue. Rotina é observação, não
  intervenção.
- ❌ **Não rode DDL** (ALTER, DROP, CREATE) nem UPDATE/DELETE durante o check.
- ❌ **Não compartilhe outputs contendo dados sensíveis** (emails de leads, valores de
  contrato) em canais públicos, mesmo em screenshots.

---

## 5. Contatos em incidente

- **Owner técnico**: Gabriel Limas (`administrativo@recconmarketing.com`)
- **Canal preferido pra incidente crítico**: contato direto (mensagem/ligação)
- **Não use email pra incidente urgente** — pode atrasar horas.

---

## 6. Referências

- Arquitetura de ingestão: [`CLAUDE.md`](CLAUDE.md)
- Mapping marca ↔ conta Meta/Google: internal (Supabase Vault + `MARCA_MAP` das Edge Functions)
- Advisor de segurança do Supabase: rodar mensalmente no Studio → Advisors. Zero ERROR
  esperado (WARNs cosméticos aceitáveis: `extension_in_public`, `auth_leaked_password_protection`)

---

_Última revisão: 2026-08-13. Alterações requerem PR + review do owner._
