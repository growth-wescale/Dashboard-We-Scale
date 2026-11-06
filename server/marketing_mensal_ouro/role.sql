-- Proposta, não executar antes da autorização de instalação.
-- Habilitar LOGIN e provisionar senha fora do repositório após conferir grants.
BEGIN;
CREATE ROLE dashboard_marketing_mensal_ro NOLOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
ALTER ROLE dashboard_marketing_mensal_ro SET default_transaction_read_only = on;
ALTER ROLE dashboard_marketing_mensal_ro SET statement_timeout = '45s';
ALTER ROLE dashboard_marketing_mensal_ro SET lock_timeout = '1s';
GRANT CONNECT ON DATABASE oralunic_dw TO dashboard_marketing_mensal_ro;
GRANT USAGE ON SCHEMA ouro TO dashboard_marketing_mensal_ro;
COMMIT;
