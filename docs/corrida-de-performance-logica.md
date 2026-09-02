# Corrida de Performance — Lógica de Pontuação

**WeScale Expansão · SDR & Closer · Setembro/2026**

---

## 1. Princípio central

```
PONTOS FINAIS = PONTOS DE VOLUME × MULTIPLICADOR DE VELOCIDADE
```

- **Pontos de Volume**: quanto a pessoa gerou (RR para SDR, vendas para Closer).
- **Multiplicador de Velocidade**: quão rápido, em relação ao ritmo real do time.
- A velocidade **multiplica** o volume — ela dá vantagem, não substitui produção. Quem é rápido mas gera pouco não ultrapassa quem tem volume real.

### Cálculo por-venda / por-RR, não por média do período

O multiplicador é aplicado **em cada venda (ou RR) individualmente**, e o total do ciclo é a soma:

```
Pontos_da_venda = Pontos_de_Volume_da_venda × Multiplicador(tempo_de_ciclo_da_venda)
Pontos_finais_do_período = soma de todas as vendas/RR do período
```

**Por quê:** se o multiplicador fosse calculado sobre a velocidade média do período, uma venda rápida disfarçaria várias travadas atrás dela. Calculando por-venda, cada negócio paga (ou perde) pelo próprio ritmo — nada se esconde na média.

> Exemplo: ciclos de 3, 50, 48, 51 e 49 dias → média ≈ 40 dias (parece razoável, mas esconde 4 vendas travadas atrás de 1 rápida). Calculado por-venda: 3 dias → 1,5x · as outras quatro → 0,5x cada. O resultado reflete a realidade, não a média.

---

## 2. Trilha SDR — Pontos de Volume

| Ação | Inbound | Outbound (peso K.O.) |
|---|---|---|
| RR gerada | 1 ponto | 2 pontos |
| >1 RR gerada no dia | 1,5x pontos | 3x pontos |

Mesma lógica de peso que os Closers já usam: Outbound pesa mais por ser mais difícil de gerar.

**Guardrail:** só conta pontuação de velocidade para RR que **de fato aconteceu** (sem no-show) — senão incentiva agendar rápido e não comparecer.

## 3. Trilha SDR — Degraus de Velocidade

**Métrica:** tempo entre MQL e agendamento do SQL (handoff para o Closer)
**Mediana real do time:** 1,0 dia (calibrado nos últimos 90 dias, n=63)

| Faixa | Multiplicador | Tag |
|---|---|---|
| até 0,5 dia | **1,5x** | Resposta Relâmpago |
| 0,5 – 1 dia | **1,2x** | Ritmo Ideal |
| 1 – 3 dias | **1,0x** | Padrão |
| 3 – 7 dias | **0,8x** | Atenção |
| mais de 7 dias | **0,5x** | Lento |

### Exemplo ilustrativo — SDR

| | SDR X | SDR Y |
|---|---|---|
| RR outbound geradas | 10 | 15 |
| Pontos de volume | 20 pts | 30 pts |
| Ritmo médio até agendar | 0,4 dia | 4 dias |
| Multiplicador aplicado | 1,5x | 0,8x |
| **Pontos finais** | **30 pts** | **24 pts** |

X gera 33% menos RR que Y, mas responde no mesmo turno — e vence. Coerente com o gargalo já mapeado: tempo de resposta ao lead é crítico para conversão.

---

## 4. Trilha Closer — Pontos de Volume

| Ação | Inbound | Outbound (peso K.O.) |
|---|---|---|
| Venda fechada | 1 ponto | 2 pontos |
| >1 venda fechada no dia | 1,5x pontos | 3x pontos |

1 ponto fixo por venda, independente do valor do contrato — elimina a distorção entre marcas com tickets muito diferentes (Oral Unic, Inpot, Lisô Laser…).

**Guardrail:** só entra no cálculo de velocidade venda **aprovada e não cancelada/estornada** — senão cria incentivo pra empurrar contrato ruim só pra pontuar rápido.

## 5. Trilha Closer — Degraus de Velocidade

**Métrica:** tempo entre reunião realizada e venda fechada
**Mediana real do time:** 16,8 dias (calibrado no ciclo real reunião→venda, n=24 — amostra ainda pequena, recalibrar após o 1º ciclo rodado)

| Faixa | Multiplicador | Tag |
|---|---|---|
| até 14 dias | **1,5x** | Fechamento Relâmpago |
| 14 – 17 dias | **1,2x** | Ritmo Ideal |
| 17 – 28 dias | **1,0x** | Padrão |
| 28 – 40 dias | **0,8x** | Atenção |
| mais de 40 dias | **0,5x** | Lento |

Esse degrau conecta direto com o gargalo já identificado no dashboard de funil (Negociação SAL estourando o SLA de 7 dias) — o multiplicador vira um incentivo financeiro real pra destravar exatamente essa etapa.

### Exemplo ilustrativo — Closer

| | Closer A | Closer B |
|---|---|---|
| Vendas fechadas no ciclo | 5 | 7 |
| Pontos de volume | 9 pts | 12 pts |
| Ritmo médio de fechamento | 12 dias (top quartil) | 35 dias (4º quartil) |
| Multiplicador aplicado | 1,5x | 0,8x |
| **Pontos finais** | **13,5 pts** | **9,6 pts** |

A vende menos que B (9 vs. 12 pontos de volume) mas termina na frente por fechar dentro do ritmo top do time. Volume ainda importa — só não sozinho.

---

## 6. Guardrail — Desconto máximo

**Desconto máximo para valer o bônus de velocidade: 10 – 15%**

Acima disso, a venda **não perde** os pontos de volume — só não recebe o multiplicador de velocidade.

> ⚠️ **Ponto de atenção operacional:** hoje a base do funil não tem um campo de "% de desconto aplicado" — só o valor final do contrato. Antes de anunciar a regra pro time, é preciso decidir: criar esse campo no CRM, ou validar manualmente (Operações/CS) antes de fechar os pontos de cada ciclo. Sem isso, a regra existe mas ninguém consegue fiscalizar.

---

## 7. Estrutura — individual agora, times no futuro

| Hoje | Já preparado | Futuro |
|---|---|---|
| Ranking individual — time ainda pequeno, cada SDR e Closer pontua e é reconhecido individualmente | Cada vendedor já é cadastrado com a tag **SP** ou **BC** na base de pontos, mesmo rodando só o individual | Quando o time crescer, ativa a visão por equipe somando os pontos por tag — sem remodelar nada |

---

## 8. Cronograma & recalibração

| Período | Etapa | Detalhe |
|---|---|---|
| 03 – 17/08 | Ciclo 1 | Degraus de velocidade travados com os dados calibrados neste documento |
| 18 – 24/08 | Ciclo 2 | Mesmos degraus do Ciclo 1 — ninguém sente a régua mudar no meio do jogo |
| Após 24/08 | Recalibração | Novos quartis calculados com os dados do ciclo que acabou de rodar |
| Próxima competição | Novos degraus | Regra comunicada antes do início — recalibração nunca no meio de uma disputa |

**Regra geral de recalibração:** os degraus ficam travados durante todo o período de uma competição. Recalibração é rotina mensal, feita entre ciclos, nunca no meio de uma disputa em andamento.

---

## 9. Notas técnicas — fonte dos dados

- Base: Supabase, projeto `cygxmduuwlwfbodfrlkr`, tabela `DB_Funil_Analitico_duplicate`.
- SDR (tempo até agendamento): `data_agendamento_reuniao_sql - data_novo_mql`, últimos 90 dias, n=63.
- Closer (tempo até fechamento): `data_venda - data_reuniao_realizada`, todo o histórico disponível, n=24 (amostra pequena — tratar os degraus do Closer como ponto de partida e recalibrar assim que houver mais volume de vendas).
- Degraus definidos pelos quartis reais (P25/P50/P75/P90) do próprio time, não por metas arbitrárias — a régua se ajusta automaticamente conforme o time evolui, a cada recalibração.
