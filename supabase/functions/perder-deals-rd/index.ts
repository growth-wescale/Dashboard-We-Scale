import { createClient } from "jsr:@supabase/supabase-js@2";

// Dá perdido em deals do RD CRM em lote (04/11/2026).
//   ?tabela=<plano>&max=40
// Plano: (id_deal, motivo_id, enviado_em, http, resultado, conferido_win). Só tabelas de TABELAS.
// Cada PUT é confirmado com GET (win=false e motivo igual) antes de marcar como feito.

const RD = "https://crm.rdstation.com/api/v1";
// 19/11/2026: duplicados da Kebabs criados pelo fluxo "kebabs_multistep" do RD Marketing (motivo Duplicado).
const TABELAS = ["_perda_pa_vanessa_20261104", "_perda_duplicado_kebabs_20261119"];
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
  const u = new URL(req.url);
  const tabela = u.searchParams.get("tabela") || "";
  const max = Math.min(Number(u.searchParams.get("max") || "40"), 50);
  if (!TABELAS.includes(tabela)) return Response.json({ erro: "tabela nao permitida" }, { status: 400 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: tk } = await sb.rpc("get_secret", { secret_name: "rd_token" });
    const token = tk as string;
    if (!token) throw new Error("sem token");
    const { data: plano, error } = await sb.from(tabela).select("id_deal,motivo_id")
      .is("conferido_win", null).is("http", null).order("id_deal").limit(max);
    if (error) throw new Error(error.message);
    let ok = 0, falha = 0;
    for (const p of plano || []) {
      const corpo = { deal: { win: false, deal_lost_reason_id: p.motivo_id } };
      const put = await call(token, "/deals/" + p.id_deal, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      let conferido: string | null = null;
      if (put.status >= 200 && put.status < 300) {
        await sleep(250);
        // deno-lint-ignore no-explicit-any
        const g = await call(token, "/deals/" + p.id_deal); const b = g.body as any;
        if (b && b.win === false && b.deal_lost_reason_id === p.motivo_id && b.closed_at) conferido = "perdido";
      }
      await sb.from(tabela).update({
        enviado_em: new Date().toISOString(),
        http: put.status,
        conferido_win: conferido,
        resultado: conferido ? "ok" : JSON.stringify(put.body).slice(0, 1500),
      }).eq("id_deal", p.id_deal);
      if (conferido) ok++; else falha++;
      await sleep(400);
    }
    const { count } = await sb.from(tabela).select("id_deal", { count: "exact", head: true }).is("http", null);
    return Response.json({ processados: (plano || []).length, ok, falha, pendentes: count });
  } catch (e) {
    return Response.json({ erro: String((e as Error).message || e) }, { status: 500 });
  }
});
