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
// VARREDURA POR FUNIL (22/09/2026): a listagem do RD recusa qualquer página além
// de 10.000 resultados. Cada funil é uma listagem própria (deal_pipeline_id) e, se
// um funil sozinho chegar perto de 10 mil, ele é quebrado por etapa. A soma das
// fatias é conferida contra o total geral do RD (`cobertura` no log).
//
// VAZÃO (23/09/2026): o Funil Atual ficava horas atrás do RD depois de operação em
// massa (em 23/09, ~200 perdas + 40 exclusões às 9h e ~185 trocas de responsável às
// 10h). Causas, todas corrigidas aqui:
//   1. a varredura do RD (40-100s) comia quase todo o orçamento de 100s, e às vezes
//      sobrava zero para corrigir. E cada chamada da Edge Function tem só 2s de CPU:
//      varredura + correções na mesma chamada estoura ("CPU Time exceeded", visto em
//      23/09 depois de ~80 correções) e a plataforma mata o worker com a trava presa.
//      Agora são duas etapas. A VARREDURA só compara e monta a fila. As correções
//      vão em LOTES de TAM_LOTE deals, cada lote numa chamada nova (CPU própria),
//      que ao terminar dispara o próximo lote com o resto da fila no corpo do POST.
//      Tudo em segundo plano (EdgeRuntime.waitUntil): o chamador recebe 202 na hora.
//   2. as correções eram sequenciais (1 por vez). Agora CONCORRENCIA_ESCRITA em paralelo
//      dentro do lote — cada deal é independente.
//   3. a fila seguia a ordem da listagem do RD. Agora vai por prioridade: o que muda o
//      funil (ausente, status, exclusão, etapa, funil) antes de responsável/payload.
//   4. deal EXCLUÍDO no RD ficava no espelho como "Em andamento" pra sempre — nenhum
//      job tratava exclusão (só backfill manual). Agora: com a varredura completa,
//      todo deal do espelho que não voltou do RD é conferido com GET individual, e só
//      um 404 marca deleted_at (registrar_deal_deletado). Deal que volta (restaurado)
//      tem o deleted_at limpo.
//   5. se o wf_5 estava com a trava, o ciclo inteiro era pulado. Agora tenta de novo
//      algumas vezes antes de desistir (o wf_5 leva ~5s).

import { createClient } from "jsr:@supabase/supabase-js@2";

const RD_API = "https://crm.rdstation.com/api/v1";
const TAM_PAGINA = 200; // máximo aceito pela listagem do RD
const LIMITE_JANELA_RD = 10_000; // RD recusa page*limit acima disto
const LIMITE_FATIA = 9_000; // folga abaixo do teto — acima disto o funil é quebrado por etapa
// Wall clock da Edge Function no plano Free é 150s: se passar disso a plataforma
// mata o worker sem rodar o finally, e a trava fica presa 20 min. Os prazos abaixo
// vencem antes, então o log e a liberação da trava sempre acontecem.
const PRAZO_VARREDURA_MS = 125_000;
const PRAZO_LOTE_MS = 100_000;
const RD_TIMEOUT_MS = 15_000; // fetch() do Deno NÃO tem timeout por padrão
const CONCORRENCIA_SCAN = 6; // ~6s por página da listagem a partir da Edge Function
const CONCORRENCIA_ESCRITA = 4;
// CPU é o limite (2s por chamada), não o tempo. A v8 fazia varredura + 53 correções
// numa chamada só sem estourar; um lote sem varredura com 25 fica bem abaixo.
const TAM_LOTE = 25;
const MAX_LOTES = 60; // trava contra corrente infinita: 60 × 25 = 1.500 deals por ciclo
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
  tentativas = 4,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const qs = new URLSearchParams({ token, ...params }).toString();
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await fetch(`${RD_API}${path}?${qs}`, { signal: AbortSignal.timeout(RD_TIMEOUT_MS) });
      if (resp.ok) return await resp.json();
      if (resp.status === 429) respostas429++;
      if (resp.status !== 429 && resp.status < 500) {
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

type Fatia = { rotulo: string; filtro: Record<string, string>; etapas?: Etapa[] };
type Pedido = { fatia: Fatia; pagina: number };

async function varrerRD(token: string, funis: Funil[], mapaEtapas: Map<string, [string, string]>) {
  const deals = new Map<string, Flat>();
  const errosPagina: string[] = [];
  let requests = 0;

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

  let totalRd: number | null = null;
  const resGeral = await Promise.allSettled([rd(token, "/deals", { limit: "1", page: "1" })]);
  requests++;
  if (resGeral[0].status === "fulfilled") totalRd = Number(resGeral[0].value.total ?? NaN);
  else errosPagina.push(`geral: ${String(resGeral[0].reason).slice(0, 80)}`);

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

  const fatiasEtapa: Fatia[] = quebrarPorEtapa.flatMap((f) =>
    (f.etapas || []).map((e) => ({
      rotulo: `${f.rotulo}/etapa:${e.nome}`,
      filtro: { deal_stage_id: e.id },
    }))
  );
  await buscar(fatiasEtapa.map((fatia) => ({ fatia, pagina: 1 })), (p, resp) => {
    const total = Number(resp.total ?? 0);
    if (total > LIMITE_JANELA_RD) errosPagina.push(`${p.fatia.rotulo}: ${total} deals, acima da janela do RD`);
    agendarResto(p, Math.min(total, LIMITE_JANELA_RD));
  });

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
      .order("id_deal")
      .range(offset, offset + 999);
    if (error) throw new Error(`select deal_snapshot: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) linhas.set(String(r.id_deal), r);
    offset += 1000;
    if (data.length < 1000) break;
  }
  return linhas;
}

// deno-lint-ignore no-explicit-any
async function gravarEvento(supabase: any, flat: Flat, extra: { lostNote?: string | null; closedAt?: string | null }) {
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

// Caminho completo: GET individual (histórico de etapas + anotação de perda + contato).
// deno-lint-ignore no-explicit-any
async function aplicarCompleto(supabase: any, token: string, id: string, restaurado: boolean) {
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
// deno-lint-ignore no-explicit-any
async function verificarExclusao(supabase: any, token: string, id: string): Promise<"excluido" | "existe"> {
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

type Tarefa = { id: string; c: string[] }; // c = categorias da divergência

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

// O wf_5 segura a trava por ~5s. Em vez de pular o ciclo inteiro, espera um pouco.
async function pegarTrava(supabase: Sb): Promise<boolean> {
  for (let i = 0; i < TENTATIVAS_LOCK; i++) {
    const { data } = await supabase.rpc("deals_sync_tentar_lock", { p_timeout_minutos: 20 });
    if (data === true) return true;
    if (i < TENTATIVAS_LOCK - 1) await sleep(ESPERA_LOCK_MS);
  }
  return false;
}

async function soltarTrava(supabase: Sb, job: string) {
  await supabase.rpc("deals_sync_liberar_lock", {
    p_watermark: null, // preserva o watermark do wf_5 (COALESCE na função)
    p_status: "success",
    p_records: 0,
    p_report: { job },
  });
}

async function lerToken(supabase: Sb): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { secret_name: "rd_token" });
  if (error || !data) throw new Error(`get_secret rd_token: ${error?.message || "vazio"}`);
  return data as string;
}

// Dispara o próximo lote numa chamada nova da própria function (CPU zerada).
async function encadear(fila: Tarefa[], lote: number, ciclo: string) {
  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/espelhar-rd`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fila, lote, ciclo }),
    signal: AbortSignal.timeout(30_000),
  });
  if (resp.status !== 202) throw new Error(`encadear lote ${lote}: HTTP ${resp.status}`);
}

// ETAPA 1 — varredura: compara RD × espelho, monta a fila por prioridade e passa
// pro 1º lote. Não grava nada no espelho (a CPU da chamada vai toda na varredura).
async function executarVarredura(supabase: Sb, t0: number) {
  const iniciadoEm = new Date(t0).toISOString();
  const logar = novoLogger(supabase, "espelho_rd_edge", iniciadoEm);
  let travado = false;
  try {
    const rdToken = await lerToken(supabase);
    const { data: configRows } = await supabase.from("espelho_rd_config").select("chave,valor");
    // deno-lint-ignore no-explicit-any
    const config = Object.fromEntries((configRows || []).map((r: any) => [r.chave, r.valor]));
    const modo = config.modo === "live" ? "live" : "observe";
    const maxEscritas = Number(config.max_escritas_por_execucao || 1000);

    travado = await pegarTrava(supabase);
    if (!travado) {
      await logar({ status: "success", checkpoint: { pulado: "lock_ocupado_pelo_wf_5_ou_outra_execucao_do_espelho" } });
      return;
    }

    const r = await comPrazo(
      (async () => {
        const { mapa: mapaEtapas, funis } = await carregarFunis(rdToken);
        const { deals: rdDeals, paginas, errosPagina, cobertura } = await varrerRD(rdToken, funis, mapaEtapas);
        const snap = await carregarSnapshot(supabase);

        const porCategoria: Record<string, number> = {};
        const tarefas: (Tarefa & { p: number })[] = [];
        const add = (id: string, c: string[]) => {
          for (const k of c) porCategoria[k] = (porCategoria[k] || 0) + 1;
          tarefas.push({ id, c, p: Math.min(...c.map((k) => PRIORIDADE[k] ?? 9)) });
        };
        for (const [id, flat] of rdDeals) {
          const c = comparar(flat, snap.get(id));
          if (c.length) add(id, c);
        }
        // Exclusões: só com a varredura COMPLETA — senão um deal de uma página que
        // falhou pareceria excluído. Mesmo assim, cada um é confirmado por 404.
        const varreduraCompleta = errosPagina.length === 0 && cobertura.total_rd != null &&
          rdDeals.size >= cobertura.total_rd;
        if (varreduraCompleta) {
          for (const [id, s] of snap) if (!s.deleted_at && !rdDeals.has(id)) add(id, ["sumiu_do_rd"]);
        }
        tarefas.sort((a, b) => a.p - b.p);
        const fila: Tarefa[] = tarefas.slice(0, maxEscritas).map(({ id, c }) => ({ id, c }));
        return { paginas, errosPagina, cobertura, varreduraCompleta, rdTotal: rdDeals.size, snapTotal: snap.size, porCategoria, total: tarefas.length, fila };
      })(),
      PRAZO_VARREDURA_MS,
      "prazo da varredura estourado — alguma chamada travou sem lançar erro",
    );

    await soltarTrava(supabase, "espelho_rd_edge");
    travado = false;

    let encadeado: string | null = null;
    if (modo === "live" && r.fila.length) {
      try {
        await encadear(r.fila, 1, iniciadoEm);
        encadeado = "ok";
      } catch (e) {
        encadeado = String(e).slice(0, 200);
      }
    }

    await logar({
      status: r.errosPagina.length > 0 || (encadeado && encadeado !== "ok") ? "partial" : "success",
      paginas: r.paginas,
      requests: r.paginas,
      deals_processados: 0,
      eventos_gerados: 0,
      erro: encadeado && encadeado !== "ok" ? encadeado : null,
      checkpoint: {
        modo,
        etapa: "varredura",
        rd_total: r.rdTotal,
        snapshot_total: r.snapTotal,
        cobertura: r.cobertura,
        varredura_completa: r.varreduraCompleta,
        divergentes_no_total: r.total,
        por_categoria: r.porCategoria,
        enfileirados: modo === "live" ? r.fila.length : 0,
        paginas_com_erro: r.errosPagina,
        dt_ms: Date.now() - t0,
        rd_429: respostas429,
      },
    });
  } catch (e) {
    await logar({ status: "failure", erro: String(e).slice(0, 500) });
  } finally {
    if (travado) await soltarTrava(supabase, "espelho_rd_edge");
  }
}

// ETAPA 2 — um lote: aplica até TAM_LOTE deals da fila (GET individual = dado
// fresco do RD, não o da varredura) e passa o resto pro próximo lote.
async function executarLote(supabase: Sb, t0: number, fila: Tarefa[], lote: number, ciclo: string) {
  const logar = novoLogger(supabase, "espelho_rd_edge_lote", new Date(t0).toISOString());
  let travado = false;
  const agora = fila.slice(0, TAM_LOTE);
  let resto = fila.slice(TAM_LOTE);
  let aplicados = 0, falhas = 0, excluidos = 0, eventos = 0;
  const erros: { id: string; erro: string }[] = [];
  try {
    const rdToken = await lerToken(supabase);
    travado = await pegarTrava(supabase);
    if (!travado) {
      // Não perde a fila: devolve o lote inteiro pro próximo elo.
      resto = fila;
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
                if ((await verificarExclusao(supabase, rdToken, t.id)) === "excluido") excluidos++;
              } else {
                eventos += await aplicarCompleto(supabase, rdToken, t.id, t.c.includes("restaurado"));
              }
              aplicados++;
            } catch (e) {
              falhas++;
              erros.push({ id: t.id, erro: String(e).slice(0, 200) });
            }
          }
        };
        await Promise.all(Array.from({ length: CONCORRENCIA_ESCRITA }, trabalhador));
      })(),
      PRAZO_LOTE_MS,
      "prazo do lote estourado",
    );
  } catch (e) {
    erros.push({ id: "-", erro: String(e).slice(0, 200) });
  } finally {
    if (travado) await soltarTrava(supabase, "espelho_rd_edge_lote");
  }

  let encadeado: string | null = null;
  if (resto.length) {
    if (lote >= MAX_LOTES) encadeado = `parou no limite de ${MAX_LOTES} lotes; ${resto.length} ficam pro próximo ciclo`;
    else {
      try {
        await encadear(resto, lote + 1, ciclo);
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
      restantes: resto.length,
      encadeado,
      dt_ms: Date.now() - t0,
      rd_429: respostas429,
    },
  });
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t0 = Date.now(); // por requisição — worker quente reaproveita o módulo
  respostas429 = 0;
  // deno-lint-ignore no-explicit-any
  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch (_) {
    // pg_cron manda '{}' — corpo vazio também vale como "varredura"
  }
  const trabalho = Array.isArray(corpo?.fila)
    ? executarLote(supabase, t0, corpo.fila, Number(corpo.lote) || 1, String(corpo.ciclo || ""))
    : executarVarredura(supabase, t0);
  // Segundo plano: o chamador recebe 202 na hora, sem depender do timeout dele.
  // Resultado em sync_execucao (espelho_rd_edge = varredura, espelho_rd_edge_lote = lotes).
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime.waitUntil(trabalho);
  return new Response(JSON.stringify({ aceito: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
