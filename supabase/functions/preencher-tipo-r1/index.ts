import { createClient } from "jsr:@supabase/supabase-js@2";

// Preenche o campo "Tipo de R1" no RD CRM (17/11/2026).
//  ?tabela=<plano>&max=25 -> grava o valor da coluna `valor` em cada deal pendente (aplicado_em nulo)
//  Plano: id, nome, valor, motivo_antes, motivo_depois, aplicado_em, http, resultado. Só aceita tabelas de TABELAS.
//  Só manda o campo (nunca etapa/status) e confirma por GET. Guarda o motivo de perda antes e depois,
//  porque o RD já reverteu motivo de deal perdido em edição (ver CLAUDE.md, 27/10/2026).

const RD = "https://crm.rdstation.com/api/v1";
const CAMPO_TIPO_R1 = "6af3226d307c22002371c944";
const TABELAS = ["_tipo_r1_20261117"];
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

// deno-lint-ignore no-explicit-any
function valorDoCampo(b: any): string | null {
  for (const cf of b?.deal_custom_fields || []) {
    const id = cf?.custom_field?._id ?? cf?.custom_field?.id ?? cf?.custom_field_id;
    if (id === CAMPO_TIPO_R1) return cf.value ?? null;
  }
  return null;
}
// deno-lint-ignore no-explicit-any
const motivo = (b: any): string | null => b?.deal_lost_reason?.name ?? b?.deal_lost_reason?._id ?? null;

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const TABELA = u.searchParams.get("tabela") || TABELAS[0];
  if (!TABELAS.includes(TABELA)) return Response.json({ erro: "tabela nao permitida" }, { status: 400 });
  const max = Math.min(Number(u.searchParams.get("max") || "25"), 40);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: tk } = await sb.rpc("get_secret", { secret_name: "rd_token" });
    const token = tk as string;
    if (!token) throw new Error("sem token");
    const { data: plano, error } = await sb.from(TABELA).select("id,valor").is("aplicado_em", null).order("id").limit(max);
    if (error) throw new Error(error.message);
    let ok = 0, falha = 0;
    // deno-lint-ignore no-explicit-any
    for (const p of (plano || []) as any[]) {
      const antes = await call(token, "/deals/" + p.id);
      const corpo = { deal: { deal_custom_fields: [{ custom_field_id: CAMPO_TIPO_R1, value: p.valor }] } };
      const put = await call(token, "/deals/" + p.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      let confirmado = false;
      let depoisBody: unknown = null;
      if (put.status >= 200 && put.status < 300) {
        await sleep(250);
        const g = await call(token, "/deals/" + p.id);
        depoisBody = g.body;
        confirmado = valorDoCampo(g.body) === p.valor;
      }
      await sb.from(TABELA).update({
        aplicado_em: confirmado ? new Date().toISOString() : null,
        http: put.status,
        motivo_antes: motivo(antes.body),
        motivo_depois: depoisBody ? motivo(depoisBody) : null,
        resultado: confirmado ? "ok" : JSON.stringify(put.body).slice(0, 1500),
      }).eq("id", p.id);
      if (confirmado) ok++; else falha++;
      await sleep(400);
    }
    const { count } = await sb.from(TABELA).select("id", { count: "exact", head: true }).is("aplicado_em", null);
    return Response.json({ processados: (plano || []).length, ok, falha, pendentes: count });
  } catch (e) {
    return Response.json({ erro: String((e as Error).message || e) }, { status: 500 });
  }
});
