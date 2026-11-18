# Nutrição — leitura em produção

`POST /api/nutricao-ouro/v1/resumo`, corpo `{}`, autenticação de Marketing. Revalida usuário e `minhas_permissoes` a cada pedido, antes de devolver o cache. Administrador tem acesso; demais papéis precisam de `aba.nutricao` e todas as marcas. O catálogo de Usuários & Acessos inclui a nova permissão. Não modifica papéis ou concede permissão automaticamente.

Somente um SELECT fixo via Metabase (DB3), nas três views da ouro usadas pela prévia; mesmos filtros de contas, IDs exatos e normalização. Sem endpoint para SQL, parâmetros de conta ou operações RD. O catálogo de 96 nutrições é a referência datada fornecida pelo usuário; novos fluxos exigem revisão desse catálogo. Os períodos disponíveis avançam com a cobertura da ouro, sem datas finais fixas.

Renovação ao iniciar e a cada hora. Só troca a fotografia após validação integral; falha retenta após 60 segundos e preserva a última por no máximo duas horas. Expirada/ausente retorna 503. A data efetiva da coleta na ouro é exibida separadamente da leitura do gateway. Essa renovação não aciona coleta RD nem muda sua cadência. Não disponibiliza entradas, espera, conclusões ou conversões comerciais ainda sem fonte homologada.

Instalação separada da pipeline do frontend, somente após PR/revisão: diretórios `app/nutricao_ouro`, `app/nutricao_previa` e `config` sob `/opt/dashboard-nutricao-ouro`; não reinicia serviços existentes. Compose usa a imagem Python homologada, usuário sem privilégios, volumes somente leitura, rede interna do dashboard e TLS no Traefik. Nenhuma porta publicada no host. Configuração externa `config.json` com `metabase_key` e `supabase_anon_key`, sem segredo no Git/cliente/logs. Diretório 0700 e arquivo 0600, proprietário UID10001. Chave Metabase permanente já autorizada para a leitura; não cria credencial no RD ou papel DW.

Ativação do frontend: `VITE_NUTRICAO_OURO_ENABLED=true`, via PR/merge e GitHub Actions. Prévia continua disponível com `VITE_PREVIA_NUTRICAO=true` em localhost. Reversão: desativar a flag por PR e parar somente `dashboard-nutricao-ouro`; preserva todos os demais serviços e dados. Arquivos/versionamento e configuração anteriores devem ser preservados antes de atualizar instalação existente.

Testes: `python3 -B -m unittest discover -s server/nutricao_ouro`; contrato fonte em `server/nutricao_previa`. Validar 401 anônimo, 403 restrito, recarga/expiração, dados idênticos à ouro e filtros em produção. Não considerar apenas HTTP200 como QA.
