// supabase/functions/espelhar-rd/index.ts
//
// Espelha o RD Station CRM no deal_snapshot, sem depender de watermark.
// Roda periodicamente via pg_cron + pg_net (job espelho_rd_edge → invocar_espelho_rd()).
// Irmã gêmea de docs/scripts/espelhar_rd.py — mesma lógica, para rodar manual
// no terminal quando precisar de um backfill pontual.
//
// MODO OBSERVE (padrão de fábrica, em espelho_rd_config.modo):
//   calcula a diferença entre RD e banco, LOGA em sync_execucao, e para. Não
//   chama nenhuma RPC de escrita. Trocar para 'live' é 1 UPDATE, sem reimplantar.
//
// VARREDURA POR FUNIL (22/09/2026): a listagem do RD recusa qualquer página além
// de 10.000 resultados ("Result window is too large, must be less than or equal
// to 10000"). A base passou de 9.800 deals em set/26, então a varredura sem filtro
// deixaria de enxergar parte dela assim que cruzasse os 10 mil. Agora cada funil é
// uma listagem própria (deal_pipeline_id) — cada uma bem abaixo do teto — e, se um
// funil sozinho chegar perto de 10 mil, ele é quebrado por etapa (deal_stage_id).
// Um request sem filtro traz o total geral do RD, e a soma das fatias é conferida
// contra ele: qualquer deal fora de funil conhecido aparece como `cobertura` < total
// no log, em vez de sumir calado.
//
// Por que isto não pesa o banco:
//   - a varredura do RD é só leitura: listagem paginada (nenhuma escrita) + 1
//     request a /deal_pipelines, com CONCORRENCIA_SCAN requests em paralelo
//   - a leitura do espelho é 1 SELECT paginado em deal_snapshot — medido: ~1-1.5s
//   - a comparação campo-a-campo é tudo em memória, ~150ms
//   - escritas (só em modo live) são sequenciais, no máximo
//     espelho_rd_config.max_escritas_por_execucao por execução, pelas MESMAS
//     RPCs que o wf_5 já chama em produção
//   - segura deals_sync_tentar_lock, então nunca roda ao mesmo tempo que o
//     wf_5 nem duas vezes seguidas se um ciclo demorar mais que o intervalo
//   - tem orçamento de tempo próprio: para antes do limite da Edge Function e
//     devolve o resto pro próximo ciclo — nada é perdido, só adiado
//
// Limitação conhecida: se a plataforma matar o worker à força (WORKER_RESOURCE_LIMIT),
// o `finally` não roda e o lock fica preso até o auto-release de 20 min em
// deals_sync_tentar_lock. Visto 2x em testes (1x em modo observe sem escrever nada,
// 1x logo no 1º ciclo live antes de escrever qualquer coisa). Mitigado soltando as
// estruturas grandes (rdDeals/snap) antes do loop de escrita e reduzindo
// max_escritas_por_execucao — mas não é 100% coberto pelo comPrazo/finally, só o
// timeout do lock é garantia dura.

import { createClient } from "jsr:@supabase/supabase-js@2";

const RD_API = "https://crm.rdstation.com/api/v1";
const TAM_PAGINA = 200; // máximo aceito pela listagem do RD
const LIMITE_JANELA_RD = 10_000; // RD recusa page*limit acima disto
// Folga abaixo do teto: entre ler o total na página 1 e buscar a última página,
// deals novos podem entrar no funil. Acima disto o funil é quebrado por etapa.
const LIMITE_FATIA = 9_000;
const WALL_CLOCK_BUDGET_MS = 100_000; // folga generosa abaixo do limite de 150s do plano Free
const RD_TIMEOUT_MS = 15_000; // fetch() do Deno NÃO tem timeout por padrão — sem isto, uma
// conexão parada com o RD prende a function pra sempre. AbortSignal.timeout garante que
// cada request desiste sozinho, mesmo que a resposta nunca chegue.
const CONCORRENCIA_SCAN = 6; // medido: ~6s por página da listagem do RD a partir da Edge
// Function (rede até o RD é bem mais longa daqui que do Mac/n8n). 6 em paralelo mantém a
// varredura dentro do orçamento. Só leitura, sem risco de escrita duplicada.
const IGNORAR_NO_DIFF = new Set(["_produtos"]);
const EM_ANDAMENTO = new Set(["open", "ongoing"]);

const t0 = Date.now();
const tempoEsgotado = () => Date.now() - t0 > WALL_CLOCK_BUDGET_MS;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Prazo global além do timeout por request: cobre qualquer chamada que possa
// travar (inclusive as do próprio supabase-js), não só as do RD.
function comPrazo<T>(promessa: Promise<T>, ms: number, mensagem: string): Promise<T> {
  return Promise.race([
    promessa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(mensagem)), ms)),
  ]);
}

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v, Object.keys(v as object).sort());
  return String(v).trim();
}

function classeStatus(s: string | null | undefined): string {
  const v = (s || "").trim().toLowerCase();
  return EM_ANDAMENTO.has(v) ? "em_andamento" : v;
}

// deno-lint-ignore no-explicit-any
function achatar(doc: any, mapaEtapas: Map<string, [string, string]>) {
  const payload: Record<string, unknown> = {};
  for (const cf of doc.deal_custom_fields || []) {
    const label = cf.custom_field?.label;
    if (label) payload[label] = cf.value;
  }
  payload["_valor_contrato"] = doc.amount_total != null ? String(doc.amount_total) : null;
  payload["_fonte"] = doc.deal_source?.name ?? null;
  payload["_campanha"] = doc.campaign?.name ?? null;
  payload["_rating"] = doc.rating != null ? String(doc.rating) : null;

  // deno-lint-ignore no-explicit-any
  const prods = doc.deal_products || [];
  const unidades = prods.reduce(
    // deno-lint-ignore no-explicit-any
    (s: number, p: any) => s + (Number(p.amount ?? p.amount_decimal) || 0),
    0,
  );
  payload["_nome_negociacao"] = (doc.name || "").trim() || null;
  payload["_quantidade_unidades"] = unidades > 0 ? String(unidades) : null;
  payload["_created_at"] = doc.created_at ?? null;
  payload["_closed_at"] = doc.closed_at ?? null;
  payload["_produtos"] = prods.length
    // deno-lint-ignore no-explicit-any
    ? JSON.stringify(prods.map((p: any) => ({ nome: p.name, amount: p.amount, total: p.total })))
    : null;

  const etapa = doc.deal_stage || {};
  const idEtapa: string | null = etapa.id || etapa._id || null;
  let idFunil: string | null = doc.deal_pipeline?.id ?? null;
  let nomeFunil: string | null = doc.deal_pipeline?.name ?? null;
  // A listagem do RD não traz deal_pipeline; o GET individual traz. Quando falta,
  // resolve pelo mapa de /deal_pipelines (etapa -> funil), como o wf_5 já faz.
  if (!idFunil && idEtapa && mapaEtapas.has(idEtapa)) {
    [idFunil, nomeFunil] = mapaEtapas.get(idEtapa)!;
  }

  const win = doc.win;
  const status = doc.status || (win === true ? "won" : win === false ? "lost" : "open");
  const user = doc.user || {};

  return {
    id_deal: String(doc.id ?? doc._id),
    marca: (payload["Marca"] as string) || null,
    id_funil: idFunil,
    nome_funil: nomeFunil,
    id_etapa: idEtapa,
    nome_etapa: etapa.name ?? null,
    status,
    responsavel: user.name ?? null,
    responsavel_id: user.id ?? null,
    motivo_perda: doc.deal_lost_reason?.name ?? null,
    updated_at: doc.updated_at || new Date().toISOString(),
    payload,
  };
}

// deno-lint-ignore no-explicit-any
function comparar(flat: any, snap: any | undefined): { cats: string[] } {
  if (!snap) return { cats: ["ausentes"] };
  const cats: string[] = [];
  if (norm(flat.marca) !== norm(snap.marca)) cats.push("marca");
  if (norm(flat.id_etapa) !== norm(snap.id_etapa)) cats.push("etapa");
  if (flat.id_funil && norm(flat.id_funil) !== norm(snap.id_funil)) cats.push("funil");
  if (classeStatus(flat.status) !== classeStatus(snap.status)) cats.push("status");
  if (norm(flat.responsavel_id) !== norm(snap.responsavel_id)) cats.push("responsavel");

  const sp = snap.payload || {};
  let campoDivergente = false;
  for (const [k, v] of Object.entries(flat.payload)) {
    if (IGNORAR_NO_DIFF.has(k)) continue;
    if (norm(v) !== norm(sp[k])) { campoDivergente = true; break; }
  }
  if (campoDivergente) cats.push("payload");
  return { cats };
}

async function rd(
  token: string,
  path: string,
  params: Record<string, string> = {},
  tentativas = 4,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const qs = new URLSearchParams({ token, ...params }).toString();
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await fetch(`${RD_API}${path}?${qs}`, { signal: AbortSignal.timeout(RD_TIMEOUT_MS) });
      if (resp.ok) return await resp.json();
      if (resp.status !== 429 && resp.status < 500) {
        throw new Error(`RD HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      }
      ultimoErro = new Error(`RD HTTP ${resp.status}`);
    } catch (e) {
      ultimoErro = e;
    }
    await sleep(2 ** i * 500);
  }
  throw ultimoErro;
}

type Etapa = { id: string; nome: string };
type Funil = { id: string; nome: string; etapas: Etapa[] };

async function carregarFunis(token: string) {
  const pipelines = await rd(token, "/deal_pipelines", { limit: "50" });
  const mapa = new Map<string, [string, string]>();
  const funis: Funil[] = [];
  for (const p of pipelines) {
    const etapas: Etapa[] = [];
    for (const s of p.deal_stages || []) {
      const sid = s.id || s._id;
      if (!sid) continue;
      mapa.set(sid, [p.id, p.name]);
      etapas.push({ id: sid, nome: s.name });
    }
    funis.push({ id: p.id, nome: p.name, etapas });
  }
  return { mapa, funis };
}

// Uma "fatia" é uma listagem filtrada do RD que cabe inteira na janela de 10 mil.
type Fatia = { rotulo: string; filtro: Record<string, string>; etapas?: Etapa[] };
type Pedido = { fatia: Fatia; pagina: number };

async function varrerRD(token: string, funis: Funil[], mapaEtapas: Map<string, [string, string]>) {
  // deno-lint-ignore no-explicit-any
  const deals = new Map<string, any>();
  const errosPagina: string[] = [];
  let requests = 0;

  // Busca uma lista de pedidos em lotes de CONCORRENCIA_SCAN. Cada resposta vai
  // pro callback; falha vira entrada em errosPagina (não derruba o lote).
  // deno-lint-ignore no-explicit-any
  async function buscar(pedidos: Pedido[], aoReceber: (p: Pedido, resp: any) => void) {
    for (let i = 0; i < pedidos.length; i += CONCORRENCIA_SCAN) {
      const lote = pedidos.slice(i, i + CONCORRENCIA_SCAN);
      const resultados = await Promise.allSettled(
        lote.map((p) =>
          rd(token, "/deals", { ...p.fatia.filtro, limit: String(TAM_PAGINA), page: String(p.pagina) })
        ),
      );
      requests += lote.length;
      resultados.forEach((r, j) => {
        const p = lote[j];
        if (r.status === "rejected") {
          errosPagina.push(`${p.fatia.rotulo} p${p.pagina}: ${String(r.reason).slice(0, 80)}`);
          return;
        }
        for (const d of r.value.deals || []) deals.set(String(d.id), achatar(d, mapaEtapas));
        aoReceber(p, r.value);
      });
    }
  }

  // Total geral, sem filtro — referência pra conferir que as fatias cobrem tudo.
  let totalRd: number | null = null;
  const geral: Fatia = { rotulo: "geral", filtro: {} };
  const resGeral = await Promise.allSettled([rd(token, "/deals", { limit: "1", page: "1" })]);
  requests++;
  if (resGeral[0].status === "fulfilled") totalRd = Number(resGeral[0].value.total ?? NaN);
  else errosPagina.push(`${geral.rotulo}: ${String(resGeral[0].reason).slice(0, 80)}`);

  // Fase 1: página 1 de cada funil. Descobre o total de cada um.
  const totais = new Map<string, number>();
  const restantes: Pedido[] = [];
  const quebrarPorEtapa: Fatia[] = [];

  const agendarResto = (p: Pedido, total: number) => {
    totais.set(p.fatia.rotulo, total);
    const paginas = Math.ceil(total / TAM_PAGINA);
    for (let pg = 2; pg <= paginas; pg++) restantes.push({ fatia: p.fatia, pagina: pg });
  };

  const fatiasFunil: Fatia[] = funis.map((f) => ({
    rotulo: `funil:${f.nome}`,
    filtro: { deal_pipeline_id: f.id },
    etapas: f.etapas,
  }));
  await buscar(fatiasFunil.map((fatia) => ({ fatia, pagina: 1 })), (p, resp) => {
    const total = Number(resp.total ?? 0);
    if (total > LIMITE_FATIA) quebrarPorEtapa.push(p.fatia);
    else agendarResto(p, total);
  });

  // Fase 1b: funil grande demais → uma fatia por etapa.
  const fatiasEtapa: Fatia[] = quebrarPorEtapa.flatMap((f) =>
    (f.etapas || []).map((e) => ({
      rotulo: `${f.rotulo}/etapa:${e.nome}`,
      filtro: { deal_stage_id: e.id },
    }))
  );
  await buscar(fatiasEtapa.map((fatia) => ({ fatia, pagina: 1 })), (p, resp) => {
    const total = Number(resp.total ?? 0);
    // Uma etapa sozinha acima de 10 mil não tem como ser listada inteira: registra
    // em vez de fingir cobertura completa.
    if (total > LIMITE_JANELA_RD) errosPagina.push(`${p.fatia.rotulo}: ${total} deals, acima da janela do RD`);
    agendarResto(p, Math.min(total, LIMITE_JANELA_RD));
  });

  // Fase 2: demais páginas de todas as fatias.
  await buscar(restantes, () => {});

  const somaFatias = [...totais.values()].reduce((a, b) => a + b, 0);
  return {
    deals,
    paginas: requests,
    errosPagina,
    cobertura: {
      total_rd: totalRd,
      soma_fatias: somaFatias,
      deals_lidos: deals.size,
      fatias_por_etapa: quebrarPorEtapa.map((f) => f.rotulo),
    },
  };
}

// deno-lint-ignore no-explicit-any
async function carregarSnapshot(supabase: any) {
  // deno-lint-ignore no-explicit-any
  const linhas = new Map<string, any>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("deal_snapshot")
      .select("id_deal,marca,id_funil,id_etapa,status,responsavel_id,payload,deleted_at")
      .range(offset, offset + 999);
    if (error) throw new Error(`select deal_snapshot: ${error.message}`);
    if (!data || data.length === 0) break;
    // deno-lint-ignore no-explicit-any
    for (const r of data) linhas.set(String(r.id_deal), r);
    offset += 1000;
    if (data.length < 1000) break;
  }
  return linhas;
}

// deno-lint-ignore no-explicit-any
async function aplicarUm(supabase: any, token: string, id: string) {
  const doc = await rd(token, `/deals/${id}`, {});
  const flat = achatar(doc, new Map());

  const hist = doc.deal_stage_histories || [];
  let eventosEtapa = 0;
  if (hist.length) {
    const { data, error } = await supabase.rpc("registrar_stage_history", {
      p_id_deal: flat.id_deal,
      // deno-lint-ignore no-explicit-any
      p_historico: hist.map((h: any) => ({
        id: h.id || h._id,
        deal_stage_id: h.deal_stage_id,
        start_date: h.start_date,
        end_date: h.end_date,
      })),
      p_origem: "api_espelho_edge",
    });
    if (error) throw new Error(`registrar_stage_history: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    eventosEtapa = row?.eventos_inseridos || 0;
  }

  const { data: evData, error: evErr } = await supabase.rpc("processar_deal_evento", {
    p_id_deal: flat.id_deal,
    p_id_contact: null,
    p_marca: flat.marca,
    p_id_funil: flat.id_funil,
    p_nome_funil: flat.nome_funil,
    p_id_etapa: flat.id_etapa,
    p_nome_etapa: flat.nome_etapa,
    p_status: flat.status,
    p_responsavel: flat.responsavel,
    p_responsavel_id: flat.responsavel_id,
    p_motivo_perda: flat.motivo_perda,
    p_payload: flat.payload,
    p_data_evento: flat.updated_at,
    p_origem: "api_espelho_edge",
  });
  if (evErr) throw new Error(`processar_deal_evento: ${evErr.message}`);
  const ev = Array.isArray(evData) ? evData[0] : evData;

  if (ev?.gerou_perda || ev?.gerou_ganho) {
    await supabase.rpc("registrar_fechamento", {
      p_id_deal: flat.id_deal,
      p_tipo: ev.gerou_perda ? "perda" : "ganho",
      p_motivo_perda: doc.deal_lost_reason?.name ?? null,
      p_anotacao_perda: doc.deal_lost_note ?? null,
      p_closed_at: doc.closed_at || doc.lost_at || doc.win_date || null,
    });
  }

  const contato = (doc.contacts || [])[0];
  if (contato && (contato.name || contato.emails?.length || contato.phones?.length)) {
    const email = typeof contato.emails?.[0] === "string" ? contato.emails[0] : contato.emails?.[0]?.email;
    const fone = typeof contato.phones?.[0] === "string" ? contato.phones[0] : contato.phones?.[0]?.phone;
    await supabase.rpc("upsert_deal_contato", {
      p_id_deal: flat.id_deal,
      p_nome: contato.name ?? null,
      p_email: email ?? null,
      p_telefone: fone ?? null,
      p_origem: "espelho_edge",
    });
  }

  return { eventosEtapa, eventos: ev?.eventos_gerados || 0 };
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Modo diagnóstico: ?fase=mapa|scan1|scan|snapshot1|snapshot|diff mede só aquela
  // etapa, sem lock, sem log, sem escrever nada — útil pra depurar sem esperar o
  // ciclo inteiro. Mantido de propósito (não afeta o caminho real de baixo).
  const fase = new URL(req.url).searchParams.get("fase");
  if (fase) {
    const dt0 = Date.now();
    try {
      const { data: tokenData } = await supabase.rpc("get_secret", { secret_name: "rd_token" });
      const rdToken = tokenData as string;
      const dtToken = Date.now() - dt0;

      if (fase === "mapa") {
        const { mapa, funis } = await carregarFunis(rdToken);
        return new Response(JSON.stringify({ fase, dtToken, dtTotal: Date.now() - dt0, etapas: mapa.size, funis: funis.length }), { headers: { "Content-Type": "application/json" } });
      }
      if (fase === "scan1") {
        const t1 = Date.now();
        const resp = await rd(rdToken, "/deals", { limit: String(TAM_PAGINA), page: "1" });
        return new Response(JSON.stringify({ fase, dtToken, dtUmaPagina: Date.now() - t1, qtd: (resp.deals || []).length, hasMore: resp.has_more }), { headers: { "Content-Type": "application/json" } });
      }
      if (fase === "scan") {
        const t1 = Date.now();
        const { mapa, funis } = await carregarFunis(rdToken);
        const { deals, paginas, errosPagina, cobertura } = await varrerRD(rdToken, funis, mapa);
        return new Response(JSON.stringify({ fase, dtToken, dtScan: Date.now() - t1, dtTotal: Date.now() - dt0, total: deals.size, paginas, errosPagina, cobertura }), { headers: { "Content-Type": "application/json" } });
      }
      if (fase === "snapshot1") {
        const t1 = Date.now();
        const { data, error } = await supabase.from("deal_snapshot").select("id_deal").range(0, 999);
        return new Response(JSON.stringify({ fase, dtToken, dtUmaPagina: Date.now() - t1, qtd: data?.length, error: error?.message }), { headers: { "Content-Type": "application/json" } });
      }
      if (fase === "snapshot") {
        const t1 = Date.now();
        const snap = await carregarSnapshot(supabase);
        return new Response(JSON.stringify({ fase, dtToken, dtSnapshot: Date.now() - t1, total: snap.size }), { headers: { "Content-Type": "application/json" } });
      }
      if (fase === "diff") {
        const t1 = Date.now();
        const { mapa, funis } = await carregarFunis(rdToken);
        const { deals: rdDeals, paginas, errosPagina, cobertura } = await varrerRD(rdToken, funis, mapa);
        const tScan = Date.now();
        const snap = await carregarSnapshot(supabase);
        const tSnap = Date.now();
        let divergentes = 0;
        for (const [id, flat] of rdDeals) {
          const { cats } = comparar(flat, snap.get(id));
          if (cats.length) divergentes++;
        }
        const tCmp = Date.now();
        return new Response(JSON.stringify({
          fase, dtToken, paginas, errosPagina, cobertura,
          dtScan: tScan - t1, dtSnapshot: tSnap - tScan, dtComparacao: tCmp - tSnap, dtTotal: tCmp - dt0,
          rdTotal: rdDeals.size, snapTotal: snap.size, divergentes,
        }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ erro: "fase desconhecida" }), { status: 400 });
    } catch (e) {
      return new Response(JSON.stringify({ fase, erro: String(e), dtTotal: Date.now() - dt0 }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const iniciadoEm = new Date().toISOString();
  let lockAdquirido = false;

  const logar = async (extra: Record<string, unknown>) => {
    try {
      await supabase.from("sync_execucao").insert({
        job: "espelho_rd_edge",
        iniciado_em: iniciadoEm,
        terminado_em: new Date().toISOString(),
        ...extra,
      });
    } catch (_) {
      // logging nunca deve derrubar a execução
    }
  };

  try {
    const { data: tokenData, error: tokenErr } = await supabase.rpc("get_secret", { secret_name: "rd_token" });
    if (tokenErr || !tokenData) throw new Error(`get_secret rd_token: ${tokenErr?.message || "vazio"}`);
    const rdToken = tokenData as string;

    const { data: configRows } = await supabase.from("espelho_rd_config").select("chave,valor");
    // deno-lint-ignore no-explicit-any
    const config = Object.fromEntries((configRows || []).map((r: any) => [r.chave, r.valor]));
    const modo = config.modo === "live" ? "live" : "observe"; // qualquer valor != 'live' vira observe
    const maxEscritas = Number(config.max_escritas_por_execucao || 150);
    const delayMs = Number(config.delay_ms_entre_requests || 200);

    const { data: lockOk } = await supabase.rpc("deals_sync_tentar_lock", { p_timeout_minutos: 20 });
    if (lockOk !== true) {
      await logar({
        status: "success",
        checkpoint: { pulado: "lock_ocupado_pelo_wf_5_ou_outra_execucao_do_espelho" },
      });
      return new Response(JSON.stringify({ skip: true, motivo: "lock ocupado" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    lockAdquirido = true;

    // Tudo que segue é uma sequência de chamadas de rede (RD + Postgres) — qualquer
    // uma delas poderia travar por conta própria. comPrazo garante que a function
    // sempre retorna, e o finally sempre libera o lock, mesmo se algo pendurar.
    const {
      rdTotal, paginas, errosPagina, cobertura, snapTotal, porCategoria, plano,
      aplicados, falhas, eventosGerados, parouPorOrcamento, erros,
    } = await comPrazo(
      (async () => {
        const { mapa: mapaEtapas, funis } = await carregarFunis(rdToken);
        const { deals: rdDeals, paginas, errosPagina, cobertura } = await varrerRD(rdToken, funis, mapaEtapas);
        const snap = await carregarSnapshot(supabase);

        const porCategoria: Record<string, number> = {};
        const plano: string[] = [];
        for (const [id, flat] of rdDeals) {
          const { cats } = comparar(flat, snap.get(id));
          if (cats.length) {
            plano.push(id);
            for (const c of cats) porCategoria[c] = (porCategoria[c] || 0) + 1;
          }
        }
        const rdTotal = rdDeals.size;
        const snapTotal = snap.size;
        // Achado num teste real (31/08): a 1ª execução em modo live levou WORKER_RESOURCE_LIMIT
        // (HTTP 546) sem escrever nada. rdDeals e snap ficavam vivos durante TODA a escrita
        // porque eram referenciados no retorno só pra .size. Soltando as duas antes do loop
        // de escrita, o coletor de lixo pode liberar essa memória.
        rdDeals.clear();
        snap.clear();

        let aplicados = 0, falhas = 0, eventosGerados = 0, parouPorOrcamento = false;
        const erros: { id: string; erro: string }[] = [];

        if (modo === "live") {
          for (const id of plano) {
            if (aplicados + falhas >= maxEscritas) break;
            if (tempoEsgotado()) {
              parouPorOrcamento = true;
              break;
            }
            try {
              const r = await aplicarUm(supabase, rdToken, id);
              aplicados++;
              eventosGerados += r.eventos + r.eventosEtapa;
            } catch (e) {
              falhas++;
              erros.push({ id, erro: String(e).slice(0, 200) });
            }
            await sleep(delayMs);
          }
        }

        return { rdTotal, paginas, errosPagina, cobertura, snapTotal, porCategoria, plano, aplicados, falhas, eventosGerados, parouPorOrcamento, erros };
      })(),
      130_000,
      "prazo global de 130s estourado — alguma chamada travou sem lançar erro",
    );

    await logar({
      status: falhas > 0 || errosPagina.length > 0 ? "partial" : "success",
      paginas,
      requests: paginas + aplicados,
      deals_processados: aplicados,
      eventos_gerados: eventosGerados,
      erro: erros.length ? JSON.stringify(erros.slice(0, 20)) : null,
      checkpoint: {
        modo,
        rd_total: rdTotal,
        snapshot_total: snapTotal,
        cobertura,
        divergentes_no_total: plano.length,
        por_categoria: porCategoria,
        aplicados,
        falhas,
        paginas_com_erro: errosPagina,
        parou_por_orcamento: parouPorOrcamento,
        restantes_no_proximo_ciclo: Math.max(0, plano.length - aplicados - falhas),
      },
    });

    return new Response(
      JSON.stringify({
        modo,
        rd_total: rdTotal,
        cobertura,
        divergentes: plano.length,
        aplicados,
        falhas,
        eventos_gerados: eventosGerados,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    await logar({ status: "failure", erro: String(e).slice(0, 500) });
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    if (lockAdquirido) {
      await supabase.rpc("deals_sync_liberar_lock", {
        p_watermark: null, // preserva o watermark do wf_5 (COALESCE na função)
        p_status: "success",
        p_records: 0,
        p_report: { job: "espelho_rd_edge" },
      });
    }
  }
});
