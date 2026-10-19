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
2. **`CRMDN` é anotação na negociação**: some se o fluxo não cria o deal. A função tem que criar.
3. **Odonto tem dois identificadores** (odontoscale_multistep e odontolegacy_multistep) e a regra só
   conhece o segundo — é o lead de 18/10 10h18 que não chegou.
4. **IDA tem dois fluxos criando deal**, com barreiras em campos diferentes.
5. Odonto Legacy cria tarefa "Novo Lead" e notifica o dono — a função tem que criar a tarefa.
