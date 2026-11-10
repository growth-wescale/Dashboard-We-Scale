# Leitura de Gastos de WhatsApp

`POST /api/whatsapp-ouro/v1/resumo` recebe um objeto vazio e a sessão de Marketing. O gateway revalida usuário, registro ativo e acesso total em cada leitura. O contrato versão 2 é o mesmo da prévia. As linhas de cobertura sem medição mantêm os campos nulos.

A cada hora o serviço lê, por mês desde setembro de 2026, as funções `ouro.dashboard_whatsapp_contas` e `ouro.dashboard_whatsapp_eventos` numa única transação somente leitura. A fotografia é substituída após a leitura completa. Uma falha provoca nova tentativa após um minuto. O serviço recusa fotografias com mais de duas horas. A data da consulta e a última observação válida de cada marca têm significados distintos.

`schema.py` gera a instalação inicial em transação usando os SELECTs versionados de `whatsapp_previa`. O proprietário das funções é uma role sem login. A credencial do serviço tem EXECUTE nas duas funções. O provisionamento do login e da senha é externo ao repositório. Guarde a configuração e o certificado em diretório privado do servidor. A conexão exige TLS com verificação do nome do servidor. A configuração usa as chaves `supabase_url`, `supabase_anon_key` e `postgres` seguindo o gateway mensal.

O compose usa a imagem Python/psycopg homologada, a rede interna do dashboard e o proxy HTTPS. A opção `VITE_WHATSAPP_OURO_ENABLED=true` habilita o menu e a rota no build de produção. O modo de prévia continua disponível em localhost. Para retirar a página, desative a opção de build e publique pelo fluxo do repositório.

## Aberturas e cliques por evento

Aberturas usam a última contagem de mensagens lidas da janela UTC. Cliques somam os contadores de botões de URL e resposta rápida. O contador de cliques únicos em URL sobrepõe o de URL e é excluído. A unidade de consolidação é conta, modelo e dia; produtos espelhados precisam concordar. Campo ausente, tipo desconhecido ou conflito fica indisponível. Quando apenas parte dos modelos tem medição, a linha do evento informa o subtotal observado e sua cobertura.

Na instalação existente, `python3 -B server/whatsapp_ouro/schema.py --atualizar-eventos` emite a substituição restrita à função de eventos, preservando seu proprietário e grants. O gateway deve usar o `whatsapp_previa/prepare.py` da mesma revisão. Clientes aceitam fotografias anteriores que ainda não tenham cliques.
