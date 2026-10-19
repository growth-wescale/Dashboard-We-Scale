# Automações do RD Marketing que criam deal — levantamento de 19/10/2026

Lido pela API interna da tela de automação (`/workflow-automation/api/workflows/<id>`), só GET.
Base pra montar a automação nova da COF de cada marca na virada da distribuição de leads
(spec `2026-10-16-distribuicao-leads-sdr-design.md`, §6.5).

Códigos de passo: `CRMOP` criar negociação · `SDEMA` enviar e-mail · `CRMDN` anotação **na
negociação** · `CRMNA` nome da negociação · `CRMCT` tarefa no CRM · `NTOWN` notificar dono do
lead · `ADTAG` tag · `WTDEL` espera · `SDPWH` webhook.

Todas as "<marca> > CRM" têm `not_repeatable = true` (o lead entra uma vez só na vida: reconversão
hoje NÃO gera deal novo nem COF de novo) e `skip_weekends = true`.

| Fluxo | Entrada | Passos |
|---|---|---|
| Eletrovias > CRM (Limpo) | lista "Entrada Chatbot - Eletrovias" + campo do lead Capital Disponível ≠ "Até R$ 50 mil" e ≠ "De R$ 50 mil a R$ 100 mil" | CRMOP (SDR/Novo MQL, time Eletrovias) → SDEMA cof_eletrovias → CRMDN "COF enviado…" |
| B2Case > CRM (Limpo) | "Entrada Chatbot - B2 Case" + ≠ "Ainda não possuo", ≠ "Até R$ 60.000" | SDEMA → CRMDN → CRMOP (time B2Case) |
| Inpot > CRM (Limpo) | "Entrada Chatbot Inpot" + ≠ "Ainda não possuo", ≠ "Até R$ 200.000" | SDEMA → CRMDN → CRMOP |
| OralUnic > CRM (Limpo) | "Entrada Chatbot - Oral Unic" + ≠ "Ainda não possuo", ≠ "Até R$ 200.000" | CRMOP → SDEMA → CRMDN |
| Viva > CRM (Cadência Versão Final) | "Entrada Chatbot - Viva" + ≠ "Ainda não possuo", ≠ "até 600k" | CRMOP → SDEMA → CRMDN |
| Lisô Laser > CRM (Limpo) | "Entrada Chatbot - Lisô Laser" + ≠ "Ainda não possuo", ≠ "Até R$ 200.000" | CRMOP → SDEMA → CRMDN |
| Instituto do Autismo > CRM (Limpo) | "Entrada Chatbot IDA" + cf_capital_text ≠ "Menos de R$ 550k" | CRMOP (SDR, time IDA, último dono) |
| IDA_multistep | conversão IDA_multistep + Capital Disponível ≠ "Até R$ 299 mil", ≠ "Entre R$ 200.000 e R$ 300.000", ≠ "Ainda não possuo" | CRMOP (SDR, time IDA) — **segundo fluxo criando deal do IDA** |
| OdontoScale > CRM (Limpo) | segmentação "OdontoScale" + conversão **odontoscale_multistep** | CRMOP (Odonto Legacy/Novos Leads, time Odonto Scale) |
| odontolegacy_multistep | conversão odontolegacy_multistep (repetível) | CRMOP (time Odonto Legacy) → NTOWN → ADTAG converteu_odonto_legacy_consultoria → CRMCT tarefa "Novo Lead" (ligação, 1 h) |
| beautyconnection_multistep | conversão (repetível) | CRMOP (funil Beauty Connection) → CRMNA "Beauty Connection - primeiro nome" |
| partner_multistep | conversão (repetível) | CRMNA "Scale Partner - primeiro nome" → CRMOP (funil Scale Partner) |
| fonte | evento de integração | SDPWH (webhook) — não cria deal, não muda |

Também existem "<marca> > CRM (Limpo) - Prosp Ativa" (fora do escopo) e "Abriu/Clicou email cof
<marca>" (dependem do e-mail cof_<marca>, seguem funcionando se o e-mail continuar o mesmo).

Achados que mudam a virada:
1. **A barreira lê o campo do lead** (Capital Disponível = última resposta do lead em qualquer
   formulário), não a resposta da conversão — explica deal na marca errada e o caso da Oral Unic.
2. **`CRMDN` é anotação na negociação mais recente do lead**: não depende de o próprio fluxo criar o
   deal (os fluxos "Abriu/Clicou email cof" já usam assim). Fica na automação nova da COF (abaixo).
3. **Odonto tem dois identificadores** (odontoscale_multistep e odontolegacy_multistep) e a regra só
   conhece o segundo — é o lead de 18/10 10h18 que não chegou.
4. **IDA tem dois fluxos criando deal**, com barreiras em campos diferentes.
5. Odonto Legacy cria tarefa "Novo Lead" e notifica o dono — a função tem que criar a tarefa.

## Automações novas da COF (criadas em 19/10/2026, ativas, ainda sem disparo)

Uma por marca com COF, todas iguais na forma: entrada **"Leads que vão atender aos critérios"**
(só leads novos) por **conversão `cof_<marca>`**, lead pode passar **mais de uma vez** (COF de novo
na reconversão, decisão do Junior), passos **Enviar e-mail** (o mesmo e-mail de hoje, então os fluxos
"Abriu/Clicou email cof" seguem valendo) → **Adicionar anotação** (texto e link copiados da automação
atual; o RD anota na "negociação mais recente do lead" = a que a distribuição acabou de criar —
testado no fluxo de teste: a anotação entrou 50 s depois).

| Fluxo | Conversão | E-mail |
|---|---|---|
| Eletrovias > COF (distribuição) | cof_eletrovias | cof_eletrovias (22664114) |
| B2Case > COF (distribuição) | cof_b2case | cof_b2case (22664104) |
| Inpot > COF (distribuição) | cof_inpot | cof_inpot (22664035) |
| Oral Unic > COF (distribuição) | cof_oralunic | cof_oralunic (22664099) |
| Viva > COF (distribuição) | cof_viva | cof_viva (22664108) |
| Lisô Laser > COF (distribuição) | cof_liso | cof_liso (22664095) |

As regras dessas 6 marcas têm `conversao_cof` desde 19/10. A conversão só é enviada com a regra em
`ativo`. Na virada de cada marca: desativar a "<marca> > CRM (Limpo)" antiga e publicar a regra
`ativo` no mesmo minuto.

**Virada feita em 19/10/2026:** Eletrovias 11h43 (regra id 49); B2Case 13h36 (50), Inpot 13h37 (51),
Oral Unic 13h37 (52), Viva 13h37 (53) e Lisô Laser 13h38 (54). As 6 automações antigas estão
desativadas no RD (ids: Eletrovias `33b6126b-de85-4439-92e0-a05d77295af4`, B2Case
`eaddf832-b2f9-4eae-a2e6-fb684cbd5660`, Inpot `88fc2834-86b2-472a-a3d8-ec99d9faacba`, Oral Unic
`8e3d33ef-6650-4c4b-9c6e-db8ff57ce060`, Viva `e82aa05c-e594-4edf-a203-97a85dfe7420`, Lisô
`55a0d668-4107-4f1a-8e40-2fa28c11ec61`). Para voltar uma marca atrás: reativar o fluxo antigo e
publicar a regra em `sombra`, também no mesmo minuto. As versões "- Prosp Ativa" não foram tocadas. Anotação no deal fica com a automação do RD, não com a
função (`nota_deal` vazio nessas marcas, pra não duplicar). Fluxo de teste "TESTE COF distribuição
(apagar)" (conversão cof_distribuicao_teste, tag + anotação) fica ativo até o teste final.

## Virada das outras 4 marcas (19/10/2026, à tarde)

| Marca | O que foi feito no RD Marketing | Regra |
|---|---|---|
| Scale Partner | `partner_multistep` desativada 14h00 | id 55, nome "Scale Partner - {primeiro_nome}", Vanessa |
| Beauty Connection | `beautyconnection_multistep` desativada 14h01 | id 56, nome "Beauty Connection - {primeiro_nome}", Vanessa; Marca = Beauty Connection (a automação gravava Lisô Laser) |
| IDA | "Instituto do Autismo > CRM (Limpo)" desativada 14h02 (`IDA_multistep` já estava desativada pelo Junior) | id 57, barreira `cf_capital_text` = "Menos de R$ 550k", Sarah |
| Odonto Legacy | `odontolegacy_multistep` **editada** 14h10: saíram Criar Negociação, Notificar responsável e Criar tarefa; ficou só a tag `converteu_odonto_legacy_consultoria` | id 58, tarefa "Novo Lead" (ligação, 1 h), Sarah |

"OdontoScale > CRM (Limpo)" (`odontoscale_multistep`, LP antiga) **continua ativa** até o Gabriel
trocar a LP: a distribuição não conhece esse evento, então não há duplicidade.

## Caixa reserva (2º webhook)

Webhook "Caixa reserva distribuição" (gatilho Conversão, sem filtro) → Edge Function
`caixa-reserva-leads` no Supabase de Marketing. Não substitui o webhook "Distribuição de leads
(dashboard We Scale)": cobre só quando ele falha. Detalhes no CLAUDE.md, seção 3.
