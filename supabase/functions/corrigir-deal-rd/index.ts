import { createClient } from "jsr:@supabase/supabase-js@2";

// Correção pontual de deals no RD CRM a partir de uma tabela-plano
// (colunas: ordem, id_deal, corpo jsonb, enviado_em, http, resposta, get_depois).
// Executa as linhas pendentes em ordem (PUT /deals/:id com o corpo da linha) e grava
// o GET do deal logo depois de cada passo. Para no primeiro erro.
// Chamada: POST ?tabela=_corrige_deal_20261116
// Criada em 16/11/2026 (Omar Darwiche Moussa: perder de novo e voltar ao SDR).

const RD = "https://crm.rdstation.com/api/v1";
// 19/11/2026: 3 campos do formulário da Kebabs que a v1 da regra não levava ao deal.
const TABELAS = new Set(["_corrige_deal_20261116", "_corrige_deal_20261119"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(token: string, path: string, init?: RequestInit) {
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const resp = await fetch(RD + path + "?token=" + encodeURIComponent(token), { ...init, signal: AbortSignal.timeout(20000) });
    if (resp.status === 429) {
      const ra = Number(resp.headers.get("Retry-After") || "0");
      await resp.body?.cancel();
      await sleep(Math.max(ra * 1000, 3000 * tentativa));
      continue;
    }
    let body: unknown = null;
    try { body = await resp.json(); } catch { body = null; }
    return { status: resp.status, body };
  }
  return { status: 429, body: null };
}

Deno.serve(async (req: Request) => {
  const tabela = new URL(req.url).searchParams.get("tabela") || "";
  if (!TABELAS.has(tabela)) return new Response(JSON.stringify({ erro: "tabela invalida" }), { status: 400 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: tk } = await sb.rpc("get_secret", { secret_name: "rd_token" });
    const token = tk as string;
    if (!token) throw new Error("sem token");
    const { data: plano, error } = await sb.from(tabela).select("ordem,id_deal,corpo").is("enviado_em", null).order("ordem");
    if (error) throw new Error(error.message);
    const feitos: unknown[] = [];
    for (const p of plano || []) {
      const put = await call(token, "/deals/" + p.id_deal, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.corpo) });
      await sleep(1500);
      const g = await call(token, "/deals/" + p.id_deal);
      // deno-lint-ignore no-explicit-any
      const b = g.body as any;
      const resumo = b ? {
        win: b.win, closed_at: b.closed_at, user: b.user?.name,
        deal_stage_id: b.deal_stage?.id ?? b.deal_stage?._id, deal_stage: b.deal_stage?.name,
        deal_pipeline: b.deal_pipeline?.name, deal_lost_reason: b.deal_lost_reason?.name ?? b.deal_lost_reason_id,
        deal_stage_histories: b.deal_stage_histories,
        // deno-lint-ignore no-explicit-any
        campos: (b.deal_custom_fields || []).map((c: any) => ({ id: c?.custom_field?._id ?? c?.custom_field?.id ?? c?.custom_field_id, value: c?.value })),
      } : null;
      await sb.from(tabela).update({
        enviado_em: new Date().toISOString(), http: put.status,
        resposta: put.status >= 300 ? put.body : null, get_depois: resumo,
      }).eq("ordem", p.ordem);
      feitos.push({ ordem: p.ordem, http: put.status, depois: resumo && { win: resumo.win, closed_at: resumo.closed_at, etapa: resumo.deal_stage, funil: resumo.deal_pipeline, motivo: resumo.deal_lost_reason } });
      if (put.status >= 300) break;
      await sleep(1000);
    }
    return new Response(JSON.stringify({ feitos }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String((e as Error).message || e) }), { status: 500 });
  }
});
