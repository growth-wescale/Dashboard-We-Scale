# Gateway de Marketing Partner

Fonte e limites: [contrato](../../docs/scale-partner-marketing-ouro.md). Apenas a parcela Partner dos consumidores de Marketing opt-in. As páginas de Vendas continuam nativas.

Runtime observado: imagem já existente com Python/psycopg, fixada por digest no provisionamento, em contêiner separado `dashboard-partner-ouro`. Configuração protegida em `/opt/wescale-partner-migration-20261021/config/config.json` (640, root:10001; diretório750), CA confiável `postgres-ca.pem`; não versionar conteúdo. O arquivo contém `mode` (`ouro`/`legacy`), `supabase_url`, `supabase_anon_key` pública e conexão `postgres` da role `dashboard_scale_partner_ro` ao `oralunic_dw`, `sslmode=verify-full`, `sslrootcert` montado. Nunca reutilizar a credencial administrativa da auditoria.

Montagens somente leitura: diretório próprio contendo `app.py` em `/app`, config e CA em `/run/partner/`. Executar `python -B /app/app.py`, usuário10001:10001, read-only rootfs, sem capabilities, no-new-privileges, limite512MiB/1CPU/64PIDs, log-driver none. Rede externa `dashboard_default`. Porta de verificação apenas no loopback `127.0.0.1:18082`; Traefik encaminha só host do dashboard e prefixo `/api/partner-ouro/` para8080. Não modificar o serviço `dashboard-app-1`.

Validar `/health` internamente; público POST sem bearer deve responder401. Validar autenticação/permissões com a sessão normal no dashboard, sem extrair tokens do navegador. SQL apenas nos contratos versionados; instalação exige execução administrativa separada e prova de preservação. O gateway nunca cria views, altera grants ou atualiza dados.

Atualizar o serviço existente: transferir `app.py` ao diretório próprio, conferir seu SHA-256, reiniciar **apenas** `dashboard-partner-ouro`, verificar estado/health e401. Arquivos de segredo permanecem no local. Não substituir config por exemplos nem refazer provisionamento cegamente. Sem mudanças no arquivo, não reiniciar.

Retorno imediato à fonte original: editar somente `mode` para `legacy` no config protegido sem imprimir o arquivo, preservar proprietário/permissões, reiniciar apenas esse contêiner e recarregar o dashboard. Testes unitários comprovam que legacy não conecta ao DW e devolve a consulta original. Vendas independe desse modo.

Testes locais sem banco: `python3 -m unittest discover -s server/partner_ouro -p 'test_*.py'`. Testes frontend cobrem sessão, marca, rotas comerciais intactas, rollback, filtros, projeção e paginação. Não há endpoint para receber SQL nem para gravar.

## Cache e consultas simultâneas

O cache fica somente na memória deste processo, separado por dataset e rota: a
projeção de leads da Visão Geral difere da projeção usada pelas outras páginas.
Sessão, permissão da página e acesso a Partner são conferidos em **cada** pedido,
antes de consultar o cache. Tokens e respostas de autorização não são armazenados.

Pedidos simultâneos da mesma chave compartilham uma única leitura do banco.
A primeira leitura continua síncrona; somente respostas bem-sucedidas entram no
cache. Uma rotina verifica as chaves já consultadas a cada 15 segundos e tenta
renová-las a partir de 180 segundos. A cópia anterior pode ser usada por até 300
segundos desde a conclusão da leitura; falhas não estendem esse prazo. Após uma
falha, há intervalo de 15 segundos antes de nova tentativa. Dados vencidos não são
devolvidos: o pedido aguarda a consulta compartilhada (até 55 segundos para quem
está aguardando outra leitura) ou recebe indisponibilidade. `observed_at` continua
sendo a data da carga na ouro, nunca a data de atualização do cache.

As três vagas de banco, os contratos SQL e as regras de Marketing são preservados.
O candidato parte dos parâmetros observados no serviço instalado em 16/11/2026:
20 segundos por comando, sem ajuste local de JIT. O trecho de 45 segundos/JIT off
para leads da S&OP que existia no repositório não estava instalado; foi removido
para que esta correção mantenha os parâmetros efetivamente publicados.

O merge não instala este serviço. A instalação e a conferência após uma renovação
em produção são etapas separadas. O cache não elimina a dependência da origem na
primeira consulta nem em caso de indisponibilidade prolongada.
