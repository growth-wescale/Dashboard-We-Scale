// supabase/functions/espelhar-rd/index.ts
//
// Espelha o RD Station CRM no deal_snapshot, sem depender de watermark.
// Roda periodicamente via pg_cron + pg_net (job espelho_rd_edge → invocar_espelho_rd()).
// Irmã gêmea de docs/scripts/espelhar_rd.py — mesma lógica, para rodar manual
// no terminal quando precisar de um backfill pontual.
//
// MODO OBSERVE (em espelho_rd_config.modo): calcula a diferença entre RD e banco,
// LOGA em sync_execucao, e para. Trocar para 'live' é 1 UPDATE, sem reimplantar.
//
// COMO FUNCIONA — uma CORRENTE de chamadas desta mesma function, cada uma com a sua
// CPU. Toda Edge Function tem só 2s de CPU por chamada, em qualquer plano (Free ou
// Pro). Ler ~10 mil deals numa chamada só já gastava ~1,8s e estourou em 23/09
// ("CPU Time exceeded", worker morto com a trava presa). Por isso nada pesado roda
// numa chamada só:
//
//   1. COORDENADOR (corpo vazio, é o que o pg_cron chama): lê os funis do RD e o
//      total de cada um, e divide o RD em FATIAS de no máximo FATIA_MAX deals — um
//      funil por fatia, ou uma etapa por fatia se o funil for grande. Quebrar por
//      funil/etapa também evita o teto de 10.000 resultados da listagem do RD.
//   2. FATIA (uma chamada por fatia): lista a fatia no RD, carrega do espelho só as
//      linhas daquela fatia, compara e acumula as divergências. Passa o acumulado
//      pra próxima fatia no corpo do POST.
//   3. FINAL: com a varredura completa (nenhuma página com erro e deals lidos ≥ total
//      do RD), todo deal do espelho que não apareceu em nenhuma fatia vira candidato a
//      exclusão. Ordena a fila por prioridade, loga e dispara o 1º lote.
//   4. LOTE: corrige TAM_LOTE deals com GET individual (dado fresco do RD) e dispara o
//      próximo lote com o resto da fila. Só os lotes escrevem, e só eles pegam a trava
//      do wf_5.
//
// Tudo em segundo plano (EdgeRuntime.waitUntil): quem chama recebe 202 na hora. Se
// um elo morrer, a corrente para ali e o próximo ciclo do cron recomeça do zero —
// nada fica preso, porque a varredura não segura a trava.
//
// Outras regras (23/09/2026):
//   - fila por prioridade: o que muda o funil (ausente, status, exclusão, etapa,
//     funil) antes de responsável/payload.
//   - deal EXCLUÍDO no RD só sai do espelho com 404 confirmado por GET individual
//     (registrar_deal_deletado). Deal restaurado no RD tem o deleted_at limpo.
//   - 429 do RD: respeita Retry-After, cada lote dura no mínimo DURACAO_MIN_LOTE_MS e
//     deal que toma 429 volta pro fim da fila (até MAX_REPETICOES_429).
//   - lote tenta a trava do wf_5 algumas vezes em vez de desistir.
//
// Log em sync_execucao: job 'espelho_rd_edge' (1 linha por varredura, escrita pela
// etapa FINAL ou por quem falhar) e 'espelho_rd_edge_lote' (1 linha por lote).

import { createClient } from "jsr:@supabase/supabase-js@2";

const RD_API = "https://crm.rdstation.com/api/v1";
const TAM_PAGINA = 200; // máximo aceito pela listagem do RD
const LIMITE_JANELA_RD = 10_000; // RD recusa page*limit acima disto
// Deals por fatia. O SDR (maior funil, ~4.600 deals em set/26) é quebrado por etapa.
// Medido: 10 mil deals ≈ 1,8s de CPU, então 3 mil ≈ 0,55s — folga larga.
const FATIA_MAX = 3_000;
// Wall clock: 150s no Free, 400s no Pro. Os prazos vencem antes de qualquer um dos
// dois, pro log e a liberação da trava sempre rodarem.
const PRAZO_ELO_MS = 100_000;
const RD_TIMEOUT_MS = 15_000; // fetch() do Deno NÃO tem timeout por padrão
const CONCORRENCIA_SCAN = 6; // ~6s por página da listagem a partir da Edge Function
const CONCORRENCIA_ESCRITA = 4;
const TAM_LOTE = 25;
const MAX_LOTES = 60; // trava contra corrente infinita: 60 × 25 = 1.500 deals por ciclo
// O RD devolve 429 quando apertamos demais (o token é dividido com o wf_5 e outras
// automações do n8n). Cada lote dura no mínimo DURACAO_MIN_LOTE_MS: 25 GETs a cada
// 20s = ~75 req/min.
const DURACAO_MIN_LOTE_MS = 20_000;
const MAX_REPETICOES_429 = 3; // deal que tomou 429 volta pro fim da fila até N vezes
const TENTATIVAS_LOCK = 6;
const ESPERA_LOCK_MS = 8_000;
const IGNORAR_NO_DIFF = new Set(["_produtos"]);
const EM_ANDAMENTO = new Set(["open", "ongoing"]);

// Ordem de correção: o que tira/põe deal no funil ou muda de etapa vem primeiro.
const PRIORIDADE: Record<string, number> = {
  ausentes: 0,
  restaurado: 0,
  status: 1,
  sumiu_do_rd: 1,
  etapa: 2,
  funil: 2,
  marca: 3,
  responsavel: 4,
  payload: 5,
};

const SNAP_COLS = "id_deal,marca,id_funil,id_etapa,status,responsavel_id,payload,deleted_at";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ErroRD extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

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
function achatar(doc: any, funilPadrao?: { id: string; nome: string }) {
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
  // A listagem do RD não traz deal_pipeline; o GET individual traz. Na listagem o
  // funil é o da fatia (a listagem é filtrada por funil ou por etapa dele).
  const idFunil: string | null = doc.deal_pipeline?.id ?? funilPadrao?.id ?? null;
  const nomeFunil: string | null = doc.deal_pipeline?.name ?? funilPadrao?.nome ?? null;

  const win = doc.win;
  const status = doc.status || (win === true ? "won" : win === false ? "lost" : "open");
  const user = doc.user || {};

  return {
    id_deal: String(doc.id ?? doc._id),
    marca: (payload["Marca"] as string) || null,
    id_funil: idFunil,
    nome_funil: nomeFunil,
    id_etapa: (etapa.id || etapa._id || null) as string | null,
    nome_etapa: etapa.name ?? null,
    status,
    responsavel: user.name ?? null,
    responsavel_id: user.id ?? null,
    motivo_perda: doc.deal_lost_reason?.name ?? null,
    updated_at: doc.updated_at || new Date().toISOString(),
    payload,
  };
}
type Flat = ReturnType<typeof achatar>;

// deno-lint-ignore no-explicit-any
function comparar(flat: Flat, snap: any | undefined): string[] {
  if (!snap) return ["ausentes"];
  const cats: string[] = [];
  if (snap.deleted_at) cats.push("restaurado");
  if (norm(flat.marca) !== norm(snap.marca)) cats.push("marca");
  if (norm(flat.id_etapa) !== norm(snap.id_etapa)) cats.push("etapa");
  if (flat.id_funil && norm(flat.id_funil) !== norm(snap.id_funil)) cats.push("funil");
  if (classeStatus(flat.status) !== classeStatus(snap.status)) cats.push("status");
  if (norm(flat.responsavel_id) !== norm(snap.responsavel_id)) cats.push("responsavel");

  const sp = snap.payload || {};
  for (const [k, v] of Object.entries(flat.payload)) {
    if (IGNORAR_NO_DIFF.has(k)) continue;
    if (norm(v) !== norm(sp[k])) {
      cats.push("payload");
      break;
    }
  }
  return cats;
}

let respostas429 = 0;

async function rd(
  token: string,
  path: string,
  params: Record<string, string> = {},
  tentativas = 6,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const qs = new URLSearchParams({ token, ...params }).toString();
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await fetch(`${RD_API}${path}?${qs}`, { signal: AbortSignal.timeout(RD_TIMEOUT_MS) });
      if (resp.ok) return await resp.json();
      if (resp.status === 429) {
        respostas429++;
        // Respeita o Retry-After do RD quando vem; senão, espera crescente (até ~30s).
        const retry = Number(resp.headers.get("retry-after"));
        await resp.body?.cancel();
        ultimoErro = new ErroRD(429, "RD HTTP 429");
        await sleep(retry > 0 ? retry * 1000 : Math.min(30_000, 2 ** i * 1000));
        continue;
      }
      if (resp.status < 500) {
        // 4xx não se resolve tentando de novo (inclusive 404 = deal excluído)
        throw new ErroRD(resp.status, `RD HTTP ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
      }
      ultimoErro = new ErroRD(resp.status, `RD HTTP ${resp.status}`);
    } catch (e) {
      if (e instanceof ErroRD && e.status !== 429 && e.status < 500) throw e;
      ultimoErro = e;
    }
    await sleep(2 ** i * 500);
  }
  throw ultimoErro;
}

// ---------------------------------------------------------------------------------
// Tipos da corrente

type Tarefa = { id: string; c: string[]; r?: number }; // c = categorias; r = repetições por 429
type Fatia = {
  rotulo: string;
  filtro: Record<string, string>; // deal_pipeline_id ou deal_stage_id
  funil: { id: string; nome: string };
  snap: { coluna: "id_funil" | "id_etapa"; valor: string };
};
type Acum = {
  tarefas: (Tarefa & { p: number })[];
  vistos: string[];
  lidos: number;
  paginas: number;
  erros: string[];
  cats: Record<string, number>;
};
type Meta = { ciclo: string; t0: number; totalRd: number | null; modo: string; maxEscritas: number };

// deno-lint-ignore no-explicit-any
type Sb = any;

function novoLogger(supabase: Sb, job: string, iniciadoEm: string) {
  return async (extra: Record<string, unknown>) => {
    try {
      await supabase.from("sync_execucao").insert({
        job,
        iniciado_em: iniciadoEm,
        terminado_em: new Date().toISOString(),
        ...extra,
      });
    } catch (_) {
      // logging nunca deve derrubar a execução
    }
  };
}

async function lerToken(supabase: Sb): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { secret_name: "rd_token" });
  if (error || !data) throw new Error(`get_secret rd_token: ${error?.message || "vazio"}`);
  return data as string;
}

// Chama o próximo elo da corrente: uma chamada nova desta function (CPU zerada).
async function encadear(corpo: Record<string, unknown>) {
  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/espelhar-rd`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30_000),
  });
  await resp.body?.cancel();
  if (resp.status !== 202) throw new Error(`encadear ${corpo.etapa ?? "lote"}: HTTP ${resp.status}`);
}

// ---------------------------------------------------------------------------------
// 1. COORDENADOR — divide o RD em fatias

async function executarCoordenador(supabase: Sb, t0: number) {
  const ciclo = new Date(t0).toISOString();
  const logar = novoLogger(supabase, "espelho_rd_edge", ciclo);
  try {
    const token = await lerToken(supabase);
    const { data: configRows } = await supabase.from("espelho_rd_config").select("chave,valor");
    // deno-lint-ignore no-explicit-any
    const config = Object.fromEntries((configRows || []).map((r: any) => [r.chave, r.valor]));
    const meta: Meta = {
      ciclo,
      t0,
      totalRd: null,
      modo: config.modo === "live" ? "live" : "observe",
      maxEscritas: Number(config.max_escritas_por_execucao || 1000),
    };

    await comPrazo(
      (async () => {
        const geral = await rd(token, "/deals", { limit: "1", page: "1" });
        meta.totalRd = Number(geral.total ?? NaN);

        const pipelines = await rd(token, "/deal_pipelines", { limit: "50" });
        const fatias: Fatia[] = [];
        // Total de cada funil (limit=1 é barato) decide se ele vira uma fatia só ou
        // uma fatia por etapa.
        // deno-lint-ignore no-explicit-any
        const totais = await Promise.all(pipelines.map((p: any) =>
          rd(token, "/deals", { deal_pipeline_id: p.id, limit: "1", page: "1" }).then((r) => Number(r.total ?? 0))
        ));
        // deno-lint-ignore no-explicit-any
        pipelines.forEach((p: any, i: number) => {
          const funil = { id: p.id, nome: p.name };
          if (totais[i] <= FATIA_MAX) {
            fatias.push({ rotulo: `funil:${p.name}`, filtro: { deal_pipeline_id: p.id }, funil, snap: { coluna: "id_funil", valor: p.id } });
            return;
          }
          for (const s of p.deal_stages || []) {
            const sid = s.id || s._id;
            if (!sid) continue;
            fatias.push({
              rotulo: `funil:${p.name}/etapa:${s.name}`,
              filtro: { deal_stage_id: sid },
              funil,
              snap: { coluna: "id_etapa", valor: sid },
            });
          }
        });

        const acum: Acum = { tarefas: [], vistos: [], lidos: 0, paginas: 3 + pipelines.length, erros: [], cats: {} };
        await encadear({ etapa: "fatia", fatias, i: 0, acum, meta });
      })(),
      PRAZO_ELO_MS,
      "prazo do coordenador estourado",
    );
  } catch (e) {
    await logar({ status: "failure", erro: `coordenador: ${String(e).slice(0, 480)}` });
  }
}

// ---------------------------------------------------------------------------------
// 2. FATIA — lista uma fatia no RD e compara com o espelho

async function listarFatia(token: string, fatia: Fatia, acum: Acum) {
  const deals = new Map<string, Flat>();
  const pagina = async (pg: number) => {
    const r = await rd(token, "/deals", { ...fatia.filtro, limit: String(TAM_PAGINA), page: String(pg) });
    for (const d of r.deals || []) deals.set(String(d.id), achatar(d, fatia.funil));
    return Number(r.total ?? 0);
  };
  const total = await pagina(1);
  acum.paginas++;
  if (total > LIMITE_JANELA_RD) acum.erros.push(`${fatia.rotulo}: ${total} deals, acima da janela do RD`);
  const paginas = Math.ceil(Math.min(total, LIMITE_JANELA_RD) / TAM_PAGINA);
  const resto = Array.from({ length: Math.max(0, paginas - 1) }, (_, k) => k + 2);
  for (let i = 0; i < resto.length; i += CONCORRENCIA_SCAN) {
    const lote = resto.slice(i, i + CONCORRENCIA_SCAN);
    const res = await Promise.allSettled(lote.map(pagina));
    acum.paginas += lote.length;
    res.forEach((r, j) => {
      if (r.status === "rejected") acum.erros.push(`${fatia.rotulo} p${lote[j]}: ${String(r.reason).slice(0, 80)}`);
    });
  }
  return deals;
}

// Linhas do espelho da fatia + as dos deals que o RD pôs nela mas o espelho ainda
// guarda em outro funil/etapa (mudaram de lugar).
async function snapshotDaFatia(supabase: Sb, fatia: Fatia, idsRd: string[]) {
  // deno-lint-ignore no-explicit-any
  const linhas = new Map<string, any>();
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await supabase.from("deal_snapshot").select(SNAP_COLS)
      .eq(fatia.snap.coluna, fatia.snap.valor).order("id_deal").range(offset, offset + 999);
    if (error) throw new Error(`select deal_snapshot: ${error.message}`);
    for (const r of data || []) linhas.set(String(r.id_deal), r);
    if (!data || data.length < 1000) break;
  }
  const faltam = idsRd.filter((id) => !linhas.has(id));
  for (let i = 0; i < faltam.length; i += 150) {
    const { data, error } = await supabase.from("deal_snapshot").select(SNAP_COLS).in("id_deal", faltam.slice(i, i + 150));
    if (error) throw new Error(`select deal_snapshot (in): ${error.message}`);
    for (const r of data || []) linhas.set(String(r.id_deal), r);
  }
  return linhas;
}

async function executarFatia(supabase: Sb, fatias: Fatia[], i: number, acum: Acum, meta: Meta) {
  const logar = novoLogger(supabase, "espelho_rd_edge", meta.ciclo);
  const fatia = fatias[i];
  try {
    await comPrazo(
      (async () => {
        const token = await lerToken(supabase);
        const deals = await listarFatia(token, fatia, acum);
        const snap = await snapshotDaFatia(supabase, fatia, [...deals.keys()]);
        for (const [id, flat] of deals) {
          acum.vistos.push(id);
          const c = comparar(flat, snap.get(id));
          if (!c.length) continue;
          for (const k of c) acum.cats[k] = (acum.cats[k] || 0) + 1;
          acum.tarefas.push({ id, c, p: Math.min(...c.map((k) => PRIORIDADE[k] ?? 9)) });
        }
        acum.lidos += deals.size;
      })(),
      PRAZO_ELO_MS,
      `prazo da fatia ${fatia.rotulo} estourado`,
    );
  } catch (e) {
    // Fatia com erro não derruba a corrente: vira erro de página, e com isso a
    // varredura fica incompleta (a checagem de exclusão fica pro próximo ciclo).
    acum.erros.push(`${fatia.rotulo}: ${String(e).slice(0, 120)}`);
  }
  try {
    if (i + 1 < fatias.length) await encadear({ etapa: "fatia", fatias, i: i + 1, acum, meta });
    else await encadear({ etapa: "final", acum, meta });
  } catch (e) {
    await logar({ status: "failure", erro: `fatia ${i + 1}/${fatias.length}: ${String(e).slice(0, 400)}` });
  }
}

// ---------------------------------------------------------------------------------
// 3. FINAL — exclusões, fila por prioridade, log da varredura, 1º lote

async function executarFinal(supabase: Sb, acum: Acum, meta: Meta) {
  const logar = novoLogger(supabase, "espelho_rd_edge", meta.ciclo);
  try {
    const varreduraCompleta = acum.erros.length === 0 && meta.totalRd != null &&
      !Number.isNaN(meta.totalRd) && acum.lidos >= meta.totalRd;
    let snapTotal = 0;
    if (varreduraCompleta) {
      const vistos = new Set(acum.vistos);
      for (let offset = 0;; offset += 1000) {
        const { data, error } = await supabase.from("deal_snapshot").select("id_deal")
          .is("deleted_at", null).order("id_deal").range(offset, offset + 999);
        if (error) throw new Error(`select deal_snapshot (ids): ${error.message}`);
        for (const r of data || []) {
          snapTotal++;
          if (vistos.has(String(r.id_deal))) continue;
          acum.cats.sumiu_do_rd = (acum.cats.sumiu_do_rd || 0) + 1;
          acum.tarefas.push({ id: String(r.id_deal), c: ["sumiu_do_rd"], p: PRIORIDADE.sumiu_do_rd });
        }
        if (!data || data.length < 1000) break;
      }
    }
    acum.tarefas.sort((a, b) => a.p - b.p);
    const fila: Tarefa[] = acum.tarefas.slice(0, meta.maxEscritas).map(({ id, c }) => ({ id, c }));

    let encadeado: string | null = null;
    if (meta.modo === "live" && fila.length) {
      try {
        await encadear({ fila, lote: 1, ciclo: meta.ciclo });
        encadeado = "ok";
      } catch (e) {
        encadeado = String(e).slice(0, 200);
      }
    }

    await logar({
      status: acum.erros.length > 0 || (encadeado && encadeado !== "ok") ? "partial" : "success",
      paginas: acum.paginas,
      requests: acum.paginas,
      deals_processados: 0,
      eventos_gerados: 0,
      erro: encadeado && encadeado !== "ok" ? encadeado : null,
      checkpoint: {
        modo: meta.modo,
        etapa: "varredura",
        rd_total: acum.lidos,
        snapshot_ativos: varreduraCompleta ? snapTotal : null,
        cobertura: { total_rd: meta.totalRd, deals_lidos: acum.lidos },
        varredura_completa: varreduraCompleta,
        divergentes_no_total: acum.tarefas.length,
        por_categoria: acum.cats,
        enfileirados: meta.modo === "live" ? fila.length : 0,
        paginas_com_erro: acum.erros.slice(0, 20),
        dt_ms: Date.now() - meta.t0,
      },
    });
  } catch (e) {
    await logar({ status: "failure", erro: `final: ${String(e).slice(0, 480)}` });
  }
}

// ---------------------------------------------------------------------------------
// 4. LOTE — correções (única etapa que escreve no espelho)

async function gravarEvento(supabase: Sb, flat: Flat, extra: { lostNote?: string | null; closedAt?: string | null }) {
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
      p_motivo_perda: flat.motivo_perda,
      p_anotacao_perda: extra.lostNote ?? null,
      p_closed_at: extra.closedAt ?? null,
    });
  }
  return ev?.eventos_gerados || 0;
}

// GET individual: histórico de etapas + anotação de perda + contato.
async function aplicarCompleto(supabase: Sb, token: string, id: string, restaurado: boolean) {
  const doc = await rd(token, `/deals/${id}`, {});
  const flat = achatar(doc);

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

  const eventos = await gravarEvento(supabase, flat, {
    lostNote: doc.deal_lost_note ?? null,
    closedAt: doc.closed_at || doc.lost_at || doc.win_date || null,
  });

  if (restaurado) {
    const { error } = await supabase.from("deal_snapshot").update({ deleted_at: null }).eq("id_deal", flat.id_deal);
    if (error) throw new Error(`limpar deleted_at: ${error.message}`);
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

  return eventos + eventosEtapa;
}

// Deal que estava no espelho e não voltou da varredura: só um 404 do RD prova exclusão.
// Se o RD devolve o deal (criado depois da varredura, ou movido no meio dela), aplica.
async function verificarExclusao(supabase: Sb, token: string, id: string): Promise<"excluido" | "existe"> {
  try {
    await rd(token, `/deals/${id}`, {});
  } catch (e) {
    if (e instanceof ErroRD && e.status === 404) {
      const { error } = await supabase.rpc("registrar_deal_deletado", {
        p_id_deal: id,
        p_data_evento: new Date().toISOString(),
      });
      if (error) throw new Error(`registrar_deal_deletado: ${error.message}`);
      return "excluido";
    }
    throw e;
  }
  await aplicarCompleto(supabase, token, id, false);
  return "existe";
}

// O wf_5 segura a trava por ~5s. Em vez de desistir, espera um pouco.
async function pegarTrava(supabase: Sb): Promise<boolean> {
  for (let i = 0; i < TENTATIVAS_LOCK; i++) {
    const { data } = await supabase.rpc("deals_sync_tentar_lock", { p_timeout_minutos: 20 });
    if (data === true) return true;
    if (i < TENTATIVAS_LOCK - 1) await sleep(ESPERA_LOCK_MS);
  }
  return false;
}

async function soltarTrava(supabase: Sb) {
  await supabase.rpc("deals_sync_liberar_lock", {
    p_watermark: null, // preserva o watermark do wf_5 (COALESCE na função)
    p_status: "success",
    p_records: 0,
    p_report: { job: "espelho_rd_edge_lote" },
  });
}

async function executarLote(supabase: Sb, t0: number, fila: Tarefa[], lote: number, ciclo: string) {
  const logar = novoLogger(supabase, "espelho_rd_edge_lote", new Date(t0).toISOString());
  let travado = false;
  const agora = fila.slice(0, TAM_LOTE);
  let resto = fila.slice(TAM_LOTE);
  let aplicados = 0, falhas = 0, excluidos = 0, eventos = 0, repostos = 0;
  const erros: { id: string; erro: string }[] = [];
  try {
    const token = await lerToken(supabase);
    travado = await pegarTrava(supabase);
    if (!travado) {
      resto = fila; // não perde a fila: devolve o lote inteiro pro próximo elo
      throw new Error("trava ocupada — lote adiado para o próximo elo");
    }

    await comPrazo(
      (async () => {
        let proxima = 0;
        const trabalhador = async () => {
          while (proxima < agora.length) {
            const t = agora[proxima++];
            try {
              if (t.c.includes("sumiu_do_rd")) {
                if ((await verificarExclusao(supabase, token, t.id)) === "excluido") excluidos++;
              } else {
                eventos += await aplicarCompleto(supabase, token, t.id, t.c.includes("restaurado"));
              }
              aplicados++;
            } catch (e) {
              const r = (t.r || 0) + 1;
              if (e instanceof ErroRD && e.status === 429 && r <= MAX_REPETICOES_429) {
                resto.push({ ...t, r }); // tenta de novo num lote seguinte, sem contar falha
                repostos++;
              } else {
                falhas++;
                erros.push({ id: t.id, erro: String(e).slice(0, 200) });
              }
            }
          }
        };
        await Promise.all(Array.from({ length: CONCORRENCIA_ESCRITA }, trabalhador));
      })(),
      PRAZO_ELO_MS,
      "prazo do lote estourado",
    );
  } catch (e) {
    erros.push({ id: "-", erro: String(e).slice(0, 200) });
  } finally {
    if (travado) await soltarTrava(supabase);
  }

  let encadeado: string | null = null;
  if (resto.length) {
    const falta = DURACAO_MIN_LOTE_MS - (Date.now() - t0);
    if (falta > 0) await sleep(falta);
    if (lote >= MAX_LOTES) encadeado = `parou no limite de ${MAX_LOTES} lotes; ${resto.length} ficam pro próximo ciclo`;
    else {
      try {
        await encadear({ fila: resto, lote: lote + 1, ciclo });
        encadeado = "ok";
      } catch (e) {
        encadeado = String(e).slice(0, 200);
      }
    }
  }

  await logar({
    status: falhas > 0 || erros.length > 0 || (encadeado && encadeado !== "ok") ? "partial" : "success",
    requests: aplicados + falhas,
    deals_processados: aplicados,
    eventos_gerados: eventos,
    erro: erros.length ? JSON.stringify(erros.slice(0, 20)) : null,
    checkpoint: {
      ciclo,
      lote,
      no_lote: agora.length,
      aplicados,
      excluidos_confirmados: excluidos,
      falhas,
      repostos_por_429: repostos,
      restantes: resto.length,
      encadeado,
      dt_ms: Date.now() - t0,
      rd_429: respostas429,
    },
  });
}

// ---------------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t0 = Date.now(); // por requisição — worker quente reaproveita o módulo
  respostas429 = 0;
  // deno-lint-ignore no-explicit-any
  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch (_) {
    // pg_cron manda '{}' — corpo vazio também vale como "coordenador"
  }

  let trabalho: Promise<void>;
  if (Array.isArray(corpo?.fila)) {
    trabalho = executarLote(supabase, t0, corpo.fila, Number(corpo.lote) || 1, String(corpo.ciclo || ""));
  } else if (corpo?.etapa === "fatia") {
    trabalho = executarFatia(supabase, corpo.fatias, Number(corpo.i) || 0, corpo.acum, corpo.meta);
  } else if (corpo?.etapa === "final") {
    trabalho = executarFinal(supabase, corpo.acum, corpo.meta);
  } else {
    trabalho = executarCoordenador(supabase, t0);
  }

  // Segundo plano: quem chama recebe 202 na hora, sem depender do timeout dele.
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime.waitUntil(trabalho);
  return new Response(JSON.stringify({ aceito: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
