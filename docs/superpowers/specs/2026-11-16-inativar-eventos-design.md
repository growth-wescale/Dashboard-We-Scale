# Inativar eventos de `deal_eventos` em vez de apagar

Data: 16/11/2026 · Pedido do Junior · Supabase de Expansão

## Por quê

Até aqui, para tirar do dashboard um evento que não aconteceu de verdade (eco de
automação, retomada por engano, perda refeita para desfazer um erro), o caminho era
apagar a linha de `deal_eventos` e registrar em `deal_eventos_excluidos_manualmente`.
Apagar perde a história e não tem volta simples. O Junior quer **inativar**: o evento
fica guardado (com quem, quando e por quê) e some de todas as contas.

Caso de origem: o negócio do Omar Darwiche Moussa (`6a82529e436a55000173f296`),
retomado por engano em 27/10 e perdido de novo em 16/11 para voltar ao estado real.
Sem tirar os 6 eventos dessa ida e volta, o dashboard mostra 1 perda a mais em 16/11.

## Metas

- Coluna `ativo` em `deal_eventos` (+ `inativado_em`, `inativado_por`, `inativado_motivo`).
- Toda leitura do banco (views, matview e funções) passa a ignorar evento inativo.
- A sincronização com o RD nunca recria nem altera um evento inativo.
- Inativar e reativar por função, com motivo obrigatório.
- **Com todos os eventos ativos, nenhum número muda** (conferido linha a linha).

## Fora do escopo

- Tela para inativar pelo dashboard (por enquanto é pela função, via SQL).
- Trazer de volta como inativos os eventos já apagados (`deal_eventos_excluidos_manualmente`).
- A função do TI `jornada-resultados`, que lê a tabela crua pela API: continua vendo
  inativos até eles filtrarem `ativo=eq.true`.

## Abordagens

1. **Coluna + leituras pela view de ativos (escolhida).** A tabela e as gravações não
   mudam de lugar. Cria-se `eventos_ativos.deal_eventos` (só ativos) e todo objeto que
   lia a tabela passa a ler essa view.
2. Tabela renomeada atrás de uma view `deal_eventos`. Pega leitores externos sem mudar
   nada neles, mas todas as gravações passam por view: muda o núcleo do banco sem
   como testar à parte. Descartada.

O Junior deixou a escolha comigo, pedindo que nada quebre, nenhum dado seja estragado
e que seja rápido.

## Como (decisões)

- **Mesmo nome, outro schema.** A view de ativos se chama `deal_eventos` e mora no
  schema `eventos_ativos`. Cada view leitora é recriada com a própria definição, sem
  mexer no texto, só com `search_path = eventos_ativos, public`: o nome `deal_eventos`
  passa a apontar para os ativos e todo o resto continua em `public`. Assim não há
  edição de SQL à mão em 13 views.
- A view de ativos é `security_invoker`: quem não via a tabela (anon, por RLS)
  continua sem ver; as views do dashboard (dono `postgres`) enxergam tudo, como hoje.
- A matview `mv_deal_ciclo_enriquecido` (lê a tabela para o motivo de perda do deal) é
  recriada junto com as 8 views que dependem dela, com índices, permissões e
  comentários iguais aos de antes.
- **Gravação:**
  - índice `ux_deal_eventos_perda_por_dia` passa a valer só para perdas ativas;
  - `processar_deal_evento`: a substituição da perda do mesmo dia só mexe na ativa;
  - `registrar_fechamento` / `registrar_anotacao_perda`: se o fechamento mais recente
    estiver inativo, não mexem em nada (nunca escrevem em perda antiga de outro ciclo);
  - `registrar_stage_history` já não recria etapa que exista (ativa ou não) a ±2 s;
  - `consolidar_eventos_mesma_etapa` (sem agendamento) só considera ativos.
- Funções `inativar_eventos(ids, motivo, por)` e `reativar_eventos(ids, por)`:
  `security definer`, só `service_role`/`postgres`, travam o deal como a sincronização.

## Segurança da troca

- Tudo num único bloco: se qualquer conferência falhar, nada é aplicado.
- Conferências dentro do bloco: cada definição recriada é igual à antiga trocando só
  a origem dos eventos; nenhuma view de `public` lê mais a tabela direto; permissões
  iguais às de antes; contagem da view de ativos igual à da tabela.
- Depois: cada view comparada com a definição antiga na mesma leitura (md5 linha a linha).
- Definições antigas guardadas em `_backup_viewdefs` (`*_pre_inativar_20261116`).

## Passos

1. Script `docs/sql/2026-11-16-inativar-eventos.sql` (um bloco `DO`).
2. Aplicar; conferir md5 das views contra as definições antigas.
3. Inativar os 6 eventos do Omar; conferir que só o ciclo 2 dele sumiu.
4. Registrar no CLAUDE.md.
