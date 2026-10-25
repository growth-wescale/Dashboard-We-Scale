import { createClient } from "jsr:@supabase/supabase-js@2";

// Migração dos funis de marca para SDR/Closer (10/2026). Lê a tabela-plano
// `_migracao_funis_plano` e escreve no RD CRM com o token do Vault.
//
//   POST ?acao=preparar                      cria o motivo "Funil descontinuado" e reinclui opções nos campos
//   POST ?acao=perder&onda=onda2&max=55      marca como perdido os abertos da onda (status_origem = open), com os campos do plano
//   POST ?acao=mover&onda=onda1&max=55       move de funil, confere com GET e registra a exclusão preventiva
//   POST ?acao=teste_criar                   cria 4 deals no Funil de teste e as linhas de plano onda=teste
//   POST ?acao=teste_status                  estado atual dos deals de teste (etapa, funil, win, closed_at, histórico)
//
// Regras: nunca muda `user_id`; `PUT` + `GET` por deal; deal fechado tem que
// continuar fechado (win/closed_at iguais); lote ≤ 55 (o gateway corta em 150 s).

const RD = "https://crm.rdstation.com/api/v1";
const PLANO = "_migracao_funis_plano";
const EXCLUSAO = "deal_eventos_excluidos_manualmente";
const CF = {
  marca: "69600aafd006b100155e4066",
  cidade: "699f1fb06dd7650019c8a725",
  estado: "699f1fbcea4328001396ecba",
  fonteMacro: "6a8c4f1b06873300248bbff5",
  closerResp: "69e242a4cf6bc60013948e4e",
  temperatura: "68e7c7e3d482c500142ed922",
  dataCof: "68e7c7ad736c54001d16a148",
  previsao: "68e7c86fd7994b00165d009b",
};
const FUNIL_TESTE_NOVO_MQL = "6abf2318dca0200020ff065f"; // Funil de teste / Novo MQL (conferido em teste_criar)
const FUNIL_TESTE = "6abf2318dca0200020ff065d";
const SDR_TENTANDO = "69380917e00ed10014daaa65";
const SDR_CONEXAO = "6a3036b47638b0001eedc614";
const CLOSER_SAL = "69380937219fc3001702b9b8";
const USER_TESTE = "68a6224426b00500192ff6f4"; // Brunno (responsável padrão da distribuição)
const MOTIVO_PERDA = "Funil descontinuado";
const OPCOES_CLOSER_ANTIGAS = ["Vanessa Daniel", "Aurélio Briano", "Giullia", "Rômulo", "Raissa"];
const OPCAO_FONTE_NOVA = "Não identificado";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// deno-lint-ignore no-explicit-any
type J = any;

async function call(token: string, path: string, init?: RequestInit): Promise<{ status: number; body: J }> {
  const sep = path.includes("?") ? "&" : "?";
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const resp = await fetch(RD + path + sep + "token=" + encodeURIComponent(token), { ...init, signal: AbortSignal.timeout(20000) });
    if (resp.status === 429) {
      const ra = Number(resp.headers.get("Retry-After") || "0");
      await resp.body?.cancel();
      await sleep(Math.max(ra * 1000, 3000 * tentativa));
      continue;
    }
    let body: J = null;
    try { body = await resp.json(); } catch { body = null; }
    return { status: resp.status, body };
  }
  return { status: 429, body: null };
}
const json = (init: RequestInit["method"], body: unknown): RequestInit => ({ method: init, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const idDe = (x: J) => (x && (x.id ?? x._id)) ?? null;
const cfValor = (deal: J, id: string) => ((deal?.deal_custom_fields || []).find((c: J) => idDe(c.custom_field) === id) || {}).value ?? null;
const mesmoInstante = (a: string | null, b: string | null) => (!a && !b) || (!!a && !!b && Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000);

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const acao = u.searchParams.get("acao") || "";
  const onda = u.searchParams.get("onda") || "";
  const max = Math.min(Number(u.searchParams.get("max") || "40"), 55);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const out = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  try {
    const { data: tk } = await sb.rpc("get_secret", { secret_name: "rd_token" });
    const token = tk as string;
    if (!token) throw new Error("sem token");

    if (acao === "preparar") {
      const motivos = await call(token, "/deal_lost_reasons");
      const lista: J[] = Array.isArray(motivos.body) ? motivos.body : (motivos.body?.deal_lost_reasons || []);
      let motivo = lista.find((m) => String(m.name || "").trim().toLowerCase() === MOTIVO_PERDA.toLowerCase());
      let criado = false;
      if (!motivo) {
        const r = await call(token, "/deal_lost_reasons", json("POST", { deal_lost_reason: { name: MOTIVO_PERDA } }));
        if (r.status < 200 || r.status >= 300) throw new Error("criar motivo: HTTP " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
        motivo = r.body?.deal_lost_reason || r.body; criado = true;
      }
      const campos = await call(token, "/custom_fields?for=deal");
      const todos: J[] = Array.isArray(campos.body) ? campos.body : (campos.body?.custom_fields || []);
      const opcoes: Record<string, unknown> = {};
      // "Não identificado" também em Closer responsável: as etapas do Closer exigem o campo e parte dos deals
      // migrados tem dono que não é Closer (achado na onda 2, 24/10).
      for (const [id, extra] of [[CF.closerResp, OPCOES_CLOSER_ANTIGAS.concat([OPCAO_FONTE_NOVA])], [CF.fonteMacro, [OPCAO_FONTE_NOVA]]] as [string, string[]][]) {
        const campo = todos.find((c) => idDe(c) === id);
        if (!campo) throw new Error("campo nao encontrado: " + id);
        const atuais: string[] = campo.opts || [];
        const novas = atuais.concat(extra.filter((o) => !atuais.includes(o)));
        if (novas.length === atuais.length) { opcoes[campo.label] = { inalterado: true, opts: atuais }; continue; }
        const r = await call(token, "/custom_fields/" + id, json("PUT", { custom_field: { opts: novas } }));
        const g = await call(token, "/custom_fields?for=deal");
        const depois = (Array.isArray(g.body) ? g.body : (g.body?.custom_fields || [])).find((c: J) => idDe(c) === id);
        opcoes[campo.label] = { http: r.status, opts: depois?.opts, required: depois?.required, regras: (depois?.required_rules || []).length };
      }
      await sb.from("espelho_rd_config").upsert({ chave: "migracao_motivo_perda_id", valor: String(idDe(motivo)) });
      return out({ motivo: { id: idDe(motivo), name: motivo?.name, criado }, opcoes });
    }

    if (acao === "teste_criar") {
      const pipes = await call(token, "/deal_pipelines");
      const teste = (Array.isArray(pipes.body) ? pipes.body : []).find((p: J) => idDe(p) === FUNIL_TESTE);
      const novoMql = (teste?.deal_stages || []).find((s: J) => String(s.name).toLowerCase() === "novo mql");
      if (!novoMql) throw new Error("Funil de teste sem Novo MQL");
      const base = [
        { custom_field_id: CF.marca, value: "Teste" }, { custom_field_id: CF.cidade, value: "Teste" },
        { custom_field_id: CF.estado, value: "Teste" }, { custom_field_id: CF.fonteMacro, value: "Inbound" },
      ];
      const casos = [
        { nome: "A aberto", status: "open", destino: SDR_TENTANDO, campos: null },
        { nome: "B perdido", status: "lost", destino: SDR_TENTANDO, campos: null },
        { nome: "C ganho", status: "won", destino: CLOSER_SAL, campos: { [CF.temperatura]: "Padrão", [CF.dataCof]: "2026-10-20", [CF.previsao]: "2026-10-20", [CF.closerResp]: "Douglas" } },
        { nome: "D aberto sem canal", status: "open", destino: SDR_CONEXAO, campos: null },
      ];
      const criados: J[] = [];
      let motivoId: string | null = null;
      for (const c of casos) {
        const r = await call(token, "/deals", json("POST", {
          deal: { name: "TESTE migração funil (apagar) " + c.nome, deal_stage_id: idDe(novoMql), user_id: USER_TESTE, deal_custom_fields: base },
          contacts: [{ name: "Teste migração " + c.nome, emails: [{ email: "teste.migracao." + c.nome[0].toLowerCase() + "@exemplo-wescale.com" }] }],
        }));
        const id = idDe(r.body);
        if (!id) throw new Error("POST deal falhou: " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
        await sleep(400);
        if (c.status === "lost") {
          if (!motivoId) { const { data } = await sb.from("espelho_rd_config").select("valor").eq("chave", "migracao_motivo_perda_id").maybeSingle(); motivoId = data?.valor ?? null; }
          await call(token, "/deals/" + id, json("PUT", { deal: { win: false, deal_lost_reason_id: motivoId } }));
        }
        if (c.status === "won") await call(token, "/deals/" + id, json("PUT", { deal: { win: true } }));
        await sleep(400);
        const g = await call(token, "/deals/" + id);
        criados.push({ id, nome: c.nome, win: g.body?.win, closed_at: g.body?.closed_at, etapa: idDe(g.body?.deal_stage) });
        await sb.from(PLANO).upsert({
          id_deal: id, onda: "teste", funil_origem: "Funil de teste", id_etapa_origem: idDe(g.body?.deal_stage), nome_etapa_origem: g.body?.deal_stage?.name,
          status_origem: c.status, id_etapa_destino: c.destino, campos: c.campos, closed_at_antes: g.body?.closed_at ?? null, win_antes: g.body?.win ?? null,
          perdido_em: c.status === "lost" ? new Date().toISOString() : null,
        }, { onConflict: "id_deal" });
        await sleep(400);
      }
      return out({ criados });
    }

    if (acao === "teste_status") {
      const { data: plano } = await sb.from(PLANO).select("id_deal,id_etapa_destino,aplicado_em,http,resultado,exclusao_em").like("onda", "teste%").order("id");
      const estados: J[] = [];
      for (const p of plano || []) {
        const g = await call(token, "/deals/" + p.id_deal);
        const d = g.body || {};
        estados.push({
          ...p, nome: d.name, funil: d.deal_pipeline?.name, etapa: d.deal_stage?.name, etapa_id: idDe(d.deal_stage), win: d.win, closed_at: d.closed_at,
          temperatura: cfValor(d, CF.temperatura), data_cof: cfValor(d, CF.dataCof), closer_resp: cfValor(d, CF.closerResp),
          historico: (d.deal_stage_histories || []).slice(-3).map((h: J) => ({ etapa: h.deal_stage_id, inicio: h.start_date, fim: h.end_date })),
        });
        await sleep(300);
      }
      const { data: excl } = await sb.from(EXCLUSAO).select("id_deal,id_etapa,data_evento_aproximada").in("id_deal", (plano || []).map((p: J) => p.id_deal));
      const { data: evs } = await sb.from("deal_eventos").select("id_deal,tipo_evento,nome_funil,nome_etapa,data_evento,origem").in("id_deal", (plano || []).map((p: J) => p.id_deal)).order("data_evento");
      return out({ estados, exclusoes: excl, eventos: evs });
    }

    if (acao === "perder") {
      if (!onda) return out({ erro: "onda obrigatoria" }, 400);
      const { data: cfg } = await sb.from("espelho_rd_config").select("valor").eq("chave", "migracao_motivo_perda_id").maybeSingle();
      const motivoId = cfg?.valor; if (!motivoId) throw new Error("rode preparar antes");
      const { data: plano, error } = await sb.from(PLANO).select("id,id_deal,campos").eq("onda", onda).eq("status_origem", "open").is("perdido_em", null).order("id").limit(max);
      if (error) throw new Error(error.message);
      let ok = 0, falha = 0;
      for (const p of plano || []) {
        // O RD valida os campos obrigatórios do deal em qualquer PUT (422 deal_required_custom_fields):
        // os abertos dos funis de marca não têm Marca/Cidade/Estado/Fonte Macro, então os campos do
        // plano vão junto com a perda, iguais aos que o `mover` manda (achado na onda 2, 24/10).
        const campos = p.campos && typeof p.campos === "object" ? Object.entries(p.campos).map(([custom_field_id, value]) => ({ custom_field_id, value })) : [];
        const corpoPerda: J = { win: false, deal_lost_reason_id: motivoId };
        if (campos.length) corpoPerda.deal_custom_fields = campos;
        const put = await call(token, "/deals/" + p.id_deal, json("PUT", { deal: corpoPerda }));
        let g: J = null;
        if (put.status >= 200 && put.status < 300) { await sleep(250); g = (await call(token, "/deals/" + p.id_deal)).body; }
        const perdeu = g && g.win === false && !!g.closed_at;
        await sb.from(PLANO).update({
          perdido_em: perdeu ? new Date().toISOString() : null, closed_at_antes: perdeu ? g.closed_at : null, win_antes: perdeu ? false : null,
          http: put.status, resultado: perdeu ? "perdido" : "PERDA FALHOU: " + JSON.stringify(put.body).slice(0, 1200),
        }).eq("id", p.id);
        if (perdeu) ok++; else falha++;
        await sleep(400);
      }
      const { count } = await sb.from(PLANO).select("id", { count: "exact", head: true }).eq("onda", onda).eq("status_origem", "open").is("perdido_em", null);
      return out({ acao, onda, processados: (plano || []).length, ok, falha, pendentes: count });
    }

    if (acao === "mover") {
      if (!onda) return out({ erro: "onda obrigatoria" }, 400);
      // Só a onda 2 exige a perda antes de mover (abertos dos 5 funis de marca);
      // onda 1 (Legacy) e teste movem o deal aberto como está.
      const { data: plano, error } = await sb.from(PLANO).select("*").eq("onda", onda).is("aplicado_em", null)
        .or("status_origem.neq.open,perdido_em.not.is.null,onda.neq.onda2").order("id").limit(max);
      if (error) throw new Error(error.message);
      let ok = 0, falha = 0;
      for (const p of plano || []) {
        const campos = p.campos && typeof p.campos === "object" ? Object.entries(p.campos).map(([custom_field_id, value]) => ({ custom_field_id, value })) : [];
        const corpo: J = { deal_stage_id: p.id_etapa_destino };
        if (campos.length) corpo.deal = { deal_custom_fields: campos };
        const put = await call(token, "/deals/" + p.id_deal, json("PUT", corpo));
        let g: J = null, resultado = "", confirmado = false, exclusaoEm: string | null = null, historicoNovo: J = null;
        if (put.status >= 200 && put.status < 300) {
          await sleep(250);
          g = (await call(token, "/deals/" + p.id_deal)).body || {};
          const naEtapa = idDe(g.deal_stage) === p.id_etapa_destino;
          const fechadoIgual = (g.win ?? null) === (p.win_antes ?? null) && mesmoInstante(g.closed_at ?? null, p.closed_at_antes ?? null);
          if (!naEtapa) resultado = "NAO MOVEU: etapa " + idDe(g.deal_stage);
          else if (!fechadoIgual) resultado = "ALERTA fechamento mudou: win " + g.win + " closed_at " + g.closed_at + " (antes " + p.win_antes + " / " + p.closed_at_antes + ")";
          else {
            const hist: J[] = (g.deal_stage_histories || []).filter((h: J) => h.deal_stage_id === p.id_etapa_destino);
            hist.sort((a: J, b: J) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
            const entrada = hist[hist.length - 1];
            if (!entrada) resultado = "MOVEU, sem entrada no historico";
            else {
              const { error: e2 } = await sb.from(EXCLUSAO).insert({
                id_deal: p.id_deal, id_etapa: p.id_etapa_destino, data_evento_aproximada: entrada.start_date,
                motivo: "Migração dos funis de marca (" + onda + "): troca de funil na mesma etapa canônica, não é passagem real. Ver docs/superpowers/specs/2026-10-21-migracao-funis-legados-design.md §4.2.",
                evento_original: { origem: "migrar-funis", historico_rd: entrada, funil_origem: p.funil_origem, etapa_origem: p.id_etapa_origem },
              });
              if (e2) resultado = "MOVEU, exclusao falhou: " + e2.message;
              else { confirmado = true; exclusaoEm = new Date().toISOString(); historicoNovo = entrada; resultado = "ok"; }
            }
          }
        } else resultado = "PUT " + put.status + ": " + JSON.stringify(put.body).slice(0, 1200);
        await sb.from(PLANO).update({
          aplicado_em: confirmado ? new Date().toISOString() : null, http: put.status, resultado, exclusao_em: exclusaoEm, historico_novo: historicoNovo,
        }).eq("id", p.id);
        if (confirmado) ok++; else falha++;
        await sleep(400);
      }
      const { count } = await sb.from(PLANO).select("id", { count: "exact", head: true }).eq("onda", onda).is("aplicado_em", null);
      return out({ acao, onda, processados: (plano || []).length, ok, falha, pendentes: count });
    }

    return out({ erro: "acao invalida" }, 400);
  } catch (e) {
    return out({ erro: String((e as Error).message || e) }, 500);
  }
});
