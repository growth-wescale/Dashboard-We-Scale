# Leitura de Gastos de WhatsApp

`POST /api/whatsapp-ouro/v1/resumo` recebe um objeto vazio e a sessão de Marketing. O gateway revalida usuário, registro ativo e acesso total em cada leitura. O contrato versão 2 é o mesmo da prévia. As linhas de cobertura sem medição mantêm os campos nulos.

A cada hora o serviço lê, por mês desde setembro de 2026, as funções `ouro.dashboard_whatsapp_contas` e `ouro.dashboard_whatsapp_eventos` numa única transação somente leitura. A fotografia é substituída após a leitura completa. Uma falha provoca nova tentativa após um minuto. O serviço recusa fotografias com mais de duas horas. A data da consulta e a última observação válida de cada marca têm significados distintos.

`schema.py` gera a instalação inicial em transação usando os SELECTs versionados de `whatsapp_previa`. O proprietário das funções é uma role sem login. A credencial do serviço tem EXECUTE nas duas funções. O provisionamento do login e da senha é externo ao repositório. Guarde a configuração e o certificado em diretório privado do servidor. A conexão exige TLS com verificação do nome do servidor. A configuração usa as chaves `supabase_url`, `supabase_anon_key` e `postgres` seguindo o gateway mensal.

O compose usa a imagem Python/psycopg homologada, a rede interna do dashboard e o proxy HTTPS. A opção `VITE_WHATSAPP_OURO_ENABLED=true` habilita o menu e a rota no build de produção. O modo de prévia continua disponível em localhost. Para retirar a página, desative a opção de build e publique pelo fluxo do repositório.
