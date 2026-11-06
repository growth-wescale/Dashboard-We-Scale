# Prévia mensal de Marketing

Uso exclusivo no loopback da máquina, por administrador autenticado. O servidor executa SELECTs fixos via Metabase no Oral Unic DW. A chave de leitura fica no arquivo protegido do operador. Não há instalação de views ou configuração de produção.

Na raiz do dashboard, compile com as flags de outubro que constam no workflow de deploy e acrescente `VITE_PREVIA_MENSAL=true`. Execute `python3 -B server/marketing_mensal_previa/preview.py` e abra `http://127.0.0.1:4173`. Chamadas históricas continuam nos gateways publicados. A sobreposição local começa em 01/11/2026. Cada consulta recebe os limites do período e lê apenas até o dia do último snapshot validado em ouro._refresh_receipts. Intervalos inteiros posteriores a ele devolvem 409. Data do snapshot e horário da publicação não certificam a completude individual das fontes.

Negociações são atribuídas após selecionar a versão atual, com criação em Brasília, fonte do CRM e os funis da franquia e do evento separados. A projeção de perfil reutiliza os campos oficiais e os vínculos da camada prata. Escopos de mídia em contas dedicadas exigem concordância com a marca da ouro. Novas campanhas de contas compartilhadas ficam fora da seleção automática até a atribuição ser confirmada. Outubro, dados de comunidade e consultoria fora do recorte migrado e Vendas mantêm os caminhos atuais.

A validação de um mês completo depende da recuperação da carga do CRM. A simulação de dezembro sem publicação testa o limite de cobertura, não dados reais futuros.
