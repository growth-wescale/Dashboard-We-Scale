# Fonte comercial Legacy exclusiva da S&OP

Correção de 19/10/2026: o funil atual usa o nome `Odonto Legacy`, enquanto
o histórico conserva `Odonto Scale`. A folha Legacy da S&OP consulta os
dois nomes por `useSopVendasFunil`, com chave de cache própria.

- Só a entrada interna `marca: Odonto Scale` usa a consulta nova.
- Outras folhas delegam ao hook anterior, com os mesmos filtros/chave.
- `useVendasFunil` compartilhado permanece inalterado; seus outros
  consumidores não recebem o alias novo.
- Paginação, cancelamento, tratamento de erros e filtros de data preservados.
- Não inclui Beauty Connection, Scale Partner ou Closer na seleção Legacy.
- Não muda fórmulas, classificações, snapshots manuais ou esquema do banco.

Validação: testes do contrato de consulta e roteamento isolado, build,
lint e suíte completa. Consulta nova também conferida em leitura no sistema
vivo. Sessão autenticada/PDF e publicação são gates separados do teste local.
