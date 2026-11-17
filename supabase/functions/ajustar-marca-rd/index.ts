import { createClient } from "jsr:@supabase/supabase-js@2";

// Ajusta o campo Marca no RD CRM (27/10/2026).
//  ?acao=campo[&opcao=X&depois=Y] -> garante a opção X no campo Marca, logo depois de Y
//     (padrão: "Scale Partner Beauty" depois de "Scale Partner"; 17/11/2026: "Kebabs")
//  ?acao=deal&max=40[&tabela=...] -> troca a Marca dos deals da tabela-plano (id, marca_alvo, aplicado_em, http, resultado;
//     fonte_alvo opcional grava também a Fonte Macro, obrigatória no RD). Só aceita tabelas de TABELAS.
// Toda escrita é confirmada com GET antes de marcar como aplicada.

const RD = "https://crm.rdstation.com/api/v1";
const CAMPO_MARCA = "69600aafd006b100155e4066";
const NOVA_OPCAO = "Scale Partner Beauty";
const CAMPO_FONTE_MACRO = "6a8c4f1b06873300248bbff5";
// 04/11/2026: 4 deals sem Marca criados pela automação antiga "OdontoScale > CRM (Limpo)".
const TABELAS = ["_ajuste_marca_20261027", "_ajuste_marca_20261104"];
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
function marcaDoDeal(b: any): string | null {
  for (const cf of b?.deal_custom_fields || []) {
    const id = cf?.custom_field?._id ?? cf?.custom_field?.id ?? cf?.custom_field_id;
    if (id === CAMPO_MARCA) return cf.value ?? null;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const acao = u.searchParams.get("acao") || "";
  const max = Math.min(Number(u.searchParams.get("max") || "40"), 60);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: tk } = await sb.rpc("get_secret", { secret_name: "rd_token" });
    const token = tk as string;
    if (!token) throw new Error("sem token");

    if (acao === "campo") {
      // deno-lint-ignore no-explicit-any
      const g = await call(token, "/custom_fields/" + CAMPO_MARCA); const atual = (g.body as any)?.opts as string[] | undefined;
      if (!Array.isArray(atual)) throw new Error("nao li as opcoes do campo: " + g.status);
      const NOVA = (u.searchParams.get("opcao") || NOVA_OPCAO).trim();
      const depois = u.searchParams.get("depois") || "Scale Partner";
      if (atual.includes(NOVA)) return Response.json({ acao, ja_existia: true, opts: atual });
      const i = atual.indexOf(depois);
      const novas = i >= 0 ? [...atual.slice(0, i + 1), NOVA, ...atual.slice(i + 1)] : [...atual, NOVA];
      const tentativas = [];
      for (const corpo of [{ custom_field: { opts: novas } }, { opts: novas }]) {
        const put = await call(token, "/custom_fields/" + CAMPO_MARCA, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        await sleep(500);
        // deno-lint-ignore no-explicit-any
        const v = await call(token, "/custom_fields/" + CAMPO_MARCA); const opts = (v.body as any)?.opts as string[] | undefined;
        // deno-lint-ignore no-explicit-any
        tentativas.push({ formato: Object.keys(corpo)[0], http: put.status, required: (v.body as any)?.required, ok: !!opts?.includes(NOVA) });
        if (opts?.includes(NOVA)) return Response.json({ acao, criada: true, tentativas, opts });
      }
      return Response.json({ acao, criada: false, tentativas }, { status: 500 });
    }

    if (acao === "deal") {
      const TABELA = u.searchParams.get("tabela") || TABELAS[0];
      if (!TABELAS.includes(TABELA)) return Response.json({ erro: "tabela nao permitida" }, { status: 400 });
      const comFonte = TABELA !== "_ajuste_marca_20261027";
      const { data: plano, error } = await sb.from(TABELA).select(comFonte ? "id,marca_alvo,fonte_alvo" : "id,marca_alvo").is("aplicado_em", null).order("id").limit(max);
      if (error) throw new Error(error.message);
      let ok = 0, falha = 0;
      // deno-lint-ignore no-explicit-any
      for (const p of (plano || []) as any[]) {
        const campos = [{ custom_field_id: CAMPO_MARCA, value: p.marca_alvo }];
        if (p.fonte_alvo) campos.push({ custom_field_id: CAMPO_FONTE_MACRO, value: p.fonte_alvo });
        const corpo = { deal: { deal_custom_fields: campos } };
        const put = await call(token, "/deals/" + p.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        let confirmado = false;
        if (put.status >= 200 && put.status < 300) {
          await sleep(250);
          const g = await call(token, "/deals/" + p.id);
          confirmado = marcaDoDeal(g.body) === p.marca_alvo;
        }
        await sb.from(TABELA).update({
          aplicado_em: confirmado ? new Date().toISOString() : null,
          http: put.status,
          resultado: confirmado ? "ok" : JSON.stringify(put.body).slice(0, 1500),
        }).eq("id", p.id);
        if (confirmado) ok++; else falha++;
        await sleep(400);
      }
      const { count } = await sb.from(TABELA).select("id", { count: "exact", head: true }).is("aplicado_em", null);
      return Response.json({ acao, processados: (plano || []).length, ok, falha, pendentes: count });
    }
    return Response.json({ erro: "acao invalida" }, { status: 400 });
  } catch (e) {
    return Response.json({ erro: String((e as Error).message || e) }, { status: 500 });
  }
});
