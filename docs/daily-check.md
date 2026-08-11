# Verificação Diária — Template

Rotina rápida (5-10 min) para confirmar que o projeto está saudável em produção. Adapte os placeholders `<...>` ao seu projeto antes de usar.

Objetivo: detectar rápido se algo quebrou entre ontem e hoje — código, deploy, servidor, ingestão de dados. Não substitui monitoramento contínuo; é um "quick sanity check" humano.

---

## Checklist

Rode tudo em paralelo quando possível.

### 1. Código (Git)

```bash
git status              # arquivos modificados ou não commitados
git log --oneline -5    # últimos 5 commits
git status -sb | head -1  # confere se está à frente/atrás do remoto
```

O que observar:
- **Commits locais não pushados** — risco de perda se algo der errado na máquina
- **Arquivos modificados esquecidos** — trabalho em andamento não protegido
- **Divergência remota** — alguém pushou coisa nova?

### 2. Servidor / VPS

```bash
ssh <USER>@<HOST> "ls -la <PATH_DO_DEPLOY>/index.html && docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

O que observar:
- **Data do último deploy** (`ls -la`) — bate com o que você lembra?
- **Containers UP** — todos os serviços críticos rodando? Algum reiniciando?
- **Uptime longo** de container crítico = bom sinal (não precisou restart)

### 3. Site em produção

```bash
curl -s -o /dev/null -w "HTTP %{http_code} — %{time_total}s\n" https://<SEU_DOMINIO>
```

O que observar:
- **HTTP 200** — servindo normalmente
- **Tempo < 1s** — sem regressão grave de performance
- **HTTP 5xx** — servidor caiu; investigar
- **HTTP 4xx** — rota/config quebrou

### 4. Ingestão de dados (se aplicável)

Se o projeto depende de pipelines que gravam num banco, valide se **os dados de hoje já chegaram**:

```sql
SELECT '<TABELA>' AS tabela,
       MAX(<COLUNA_TIMESTAMP>) AS ultima_ingestao,
       MAX(<COLUNA_DATA>)      AS ultimo_dia,
       COUNT(*) FILTER (WHERE <COLUNA_TIMESTAMP> > NOW() - INTERVAL '2 hours') AS ultimas_2h
FROM <TABELA>;
```

O que observar:
- **`ultima_ingestao` recente** (dentro do intervalo esperado do seu cron)
- **`ultimo_dia` = hoje** (ou D-1 dependendo do pipeline)
- **`ultimas_2h > 0`** — pipeline vivo, não travou

Repita para cada tabela crítica. Consolide num `UNION ALL` para ver tudo de uma vez.

---

## Como escalar quando quebra

| Sinal | Ação imediata |
|---|---|
| HTTP != 200 | Ver logs do container/CDN, checar se foi deploy quebrado (reverter?) |
| Container down | `docker start <nome>` ou `docker compose up -d`. Depois investigar por quê caiu. |
| Deploy antigo demais | Verificar CI/CD; talvez o pipeline pare silenciosamente |
| Ingestão parada | Ver logs do orquestrador (n8n/Airflow/cron), status das credenciais externas (tokens expirados são a causa #1) |
| Commits locais não pushados por dias | Push ou stash — proteger o trabalho |

---

## Fora do escopo deste check

Estas coisas **não** são checadas aqui — se importam pro seu projeto, coloque em monitoramento contínuo (Grafana, Datadog, uptime robot, alertas):

- Latência média p95/p99
- Erros de aplicação (500s em rotas específicas)
- Métricas de negócio (conversão, receita)
- Custo de infra
- Backups (existência + integridade)
- Certificados SSL prestes a expirar

Este check é o **piso mínimo diário**. Alerta contínuo é outro assunto.

---

## Adaptações comuns por stack

- **Sem Docker (bare metal ou serverless)** — troque `docker ps` por `systemctl status <serviço>` ou pelo painel do provider (Vercel, Netlify, Cloud Run)
- **Sem VPS (100% serverless)** — pule item 2. Confie no painel do provider + item 3 (curl)
- **Múltiplos ambientes (staging + prod)** — rode itens 3 e 4 pra cada
- **Múltiplos bancos** — rode item 4 uma vez por banco crítico
- **Mobile app** — troque item 3 por check da store (rating, crashes recentes no console)

---

## Automação (opcional)

Você pode automatizar tudo isso num script shell + cron que reporta por email/Slack em caso de falha. Mas atenção: **automatizar demais te faz perder o hábito de olhar**. Um check manual de 5 min por dia mantém você conectado ao projeto de um jeito que alerta automático não substitui.

Recomendação: **automatize a coleta**, mas **leia o resultado à mão**. Ex: cron roda os 4 blocos e joga num Slack privado seu; você bate o olho no primeiro café da manhã.
