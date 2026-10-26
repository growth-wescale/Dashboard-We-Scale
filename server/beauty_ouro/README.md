# Inscrições Beauty na S&OP

Entrega local para o card **BC · INSCRIÇÕES** da folha We Scale, restrita a outubro de 2026 e sem alterar o snapshot histórico. Nesse mês, 18 inscrições de 01 a 23/10 foram vinculadas individualmente ao export de negócios Beauty criado no RD CRM no mesmo período. A contagem é por ocorrência do evento `beautyconnection_multistep`; não representa MQL, presença nem negócios únicos em outros períodos.

## Ativação controlada

1. Revisar `beauty_view.sql` no Oral Unic DW. Conferir que `ouro.vw_leads_candidatos` oferece os quatro campos usados e que a consulta agregada para 01–23/10 retorna 18. A criação da view e da role é uma escrita DDL **ainda não executada**. Provisionar a senha da role fora do Git; conceder somente `SELECT` na view agregada. Não usar a credencial administrativa do Metabase no aplicativo.
2. Subir `app.py` como serviço isolado, com conexão TLS `verify-full` ao banco `oralunic_dw` usando `dashboard_beauty_ro`. Configuração protegida fora do Git: `mode`, `supabase_url`, `supabase_anon_key`, `postgres` (`dbname`, `user`, `password`, `host`, `port`, `sslmode`, `sslrootcert`). Expor exclusivamente `/api/beauty-ouro/v1/read` pelo host autenticado do dashboard. O navegador não escolhe SQL nem recebe identidade de contato.
3. Confirmar `/health`, `401` sem sessão, `403` sem permissão S&OP, contrato `beauty_inscricoes_v1` com usuário autorizado e soma 18 no corte validado. Ativar `VITE_BEAUTY_OURO_ENABLED=true` no build e publicar via PR/deploy normal do Dashboard. Conferir tela e PDF autenticados. Uma falha da ouro exibe `—` e erro; não vira zero.

Para reverter, publicar build com `VITE_BEAUTY_OURO_ENABLED=false` e depois parar o serviço isolado. A view e a role podem ser removidas após confirmar ausência de consumidores; não apagar fatos. O snapshot de setembro, MQLs Lisô, Vendas, mídia e demais indicadores da S&OP não são alterados por este contrato.
