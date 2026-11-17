-- 17/11/2026 — Teste da marca Kebabs no "Funil de teste" (6abf2318dca0200020ff065d)
-- Pedido do Junior. Aplicado no Supabase de Expansão (cygxmduuwlwfbodfrlkr) pelo Claude Code.
-- Decisões: sem barreira de MQL; SDR = Cassiana Lavall; responsável padrão = Junior; sem WhatsApp
-- automático; vai só até o agendamento (Reunião Agendada SQL do próprio funil de teste); lead que
-- já tem deal aberto em outra marca vai mesmo assim para a Cassiana.
-- A regra de distribuição da Kebabs entra depois, quando o Gabriel passar o identificador da conversão.

---------------------------------------------------------------------------------------------------
-- A) Distribuição: regra pode ignorar o "mesmo SDR" da reconversão
--    reconversao_mesmo_sdr = false -> o deal novo vai para o time da regra, mesmo que o lead tenha
--    deal aberto com outro SDR. A anotação "este MQL já tem deal aberto" continua sendo criada.
---------------------------------------------------------------------------------------------------
insert into public._backup_viewdefs (nome, criado_em, def)
select 'fn_distribuicao_processar_pre_kebabs_20261117', now(), pg_get_functiondef('public.distribuicao_processar'::regproc)
union all
select 'fn_distribuicao_publicar_regra_pre_kebabs_20261117', now(), pg_get_functiondef('public.distribuicao_publicar_regra'::regproc);

alter table public.distribuicao_regra add column if not exists reconversao_mesmo_sdr boolean not null default true;
comment on column public.distribuicao_regra.reconversao_mesmo_sdr is
  'true (padrão): lead com deal aberto vai para o SDR desse deal. false: vai sempre para o time da regra (Kebabs, 17/11/2026).';

do $$
declare
  d text := pg_get_functiondef('public.distribuicao_processar'::regproc);
  ancora text := E'  v_time := public.distribuicao_time_da_marca(v_regra.marca, p_recebido_em);';
  novo text := E'  -- regra que manda sempre para o próprio time (17/11/2026): ignora o SDR do deal aberto\n'
            || E'  if not coalesce(v_regra.reconversao_mesmo_sdr, true) and v_rec_nome is not null then\n'
            || E'    v_reconv := v_reconv || jsonb_build_object(''sdr'', null, ''deal_do_sdr'', null,\n'
            || E'      ''sdr_inelegiveis'', to_jsonb(v_rec_inel || (v_rec_nome || '' (esta marca vai sempre para o time da regra)'')));\n'
            || E'    v_rec_nome := null; v_rec_user := null; v_rec_deal := null;\n'
            || E'  end if;\n\n';
begin
  if (length(d) - length(replace(d, ancora, ''))) / length(ancora) <> 1 then
    raise exception 'âncora não encontrada (ou repetida) em distribuicao_processar';
  end if;
  execute replace(d, ancora, novo || ancora);
end $$;

do $$
declare
  d text := pg_get_functiondef('public.distribuicao_publicar_regra'::regproc);
  a1 text := E'criado_por, motivo, conversao_cof, nota_deal, tarefa)';
  a2 text := E'then p->''tarefa'' else null end)';
begin
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'âncora não encontrada em distribuicao_publicar_regra'; end if;
  d := replace(d, a1, E'criado_por, motivo, conversao_cof, nota_deal, tarefa, reconversao_mesmo_sdr)');
  -- sem o campo no payload (ex.: tela antiga), mantém o valor da versão anterior da marca
  d := replace(d, a2, E'then p->''tarefa'' else null end,\n'
    || E'     coalesce((p->>''reconversao_mesmo_sdr'')::boolean,\n'
    || E'              (select r.reconversao_mesmo_sdr from public.distribuicao_regra r where r.marca = v_marca and r.versao = v_versao - 1), true))');
  execute d;
end $$;

---------------------------------------------------------------------------------------------------
-- B) Etapas do Funil de teste em rd_funis_etapas (sem isso os eventos chegam sem nome de etapa)
--    Nomes conferidos na API do RD em 17/11. SQL/SAL/COF/Pré-contrato não têm de-para em
--    etapa_canonica de propósito: o teste vai só até o agendamento.
---------------------------------------------------------------------------------------------------
insert into public.rd_funis_etapas (pipeline_id, pipeline_nome, stage_id, stage_nome, ordem, ativo)
select '6abf2318dca0200020ff065d', 'Funil de teste', x.s, x.n, x.o, true
from (values
  ('6abf2318dca0200020ff065f','Novo MQL',1), ('6abf2318dca0200020ff0660','Tentando Contato',2),
  ('6abf2318dca0200020ff0661','Contato Efetivo',3), ('6abf2318dca0200020ff0662','Interesse Reunião',4),
  ('6abf2318dca0200020ff0663','Conexão',5), ('6abf237651c2d6002056f0b2','Reunião Agendada SQL',6),
  ('6abf23a60d73080024b50f9a','No Show',7), ('6abf23b33a4f4b00205b15a1','SQL',8),
  ('6abf23b86d17230020337c78','SAL',9), ('6abf23bc51c2d6002956eeaf','COF',10),
  ('6abf23bf1fb2410020cf5b8b','Comitê',11), ('6abf23f4e600b000298e9edc','Pré-contrato',12)) x(s,n,o)
where not exists (select 1 from public.rd_funis_etapas r where r.stage_id = x.s);

---------------------------------------------------------------------------------------------------
-- C) Dashboard: quais marcas do Funil de teste entram nas abas de Vendas
--    Trocar a marca do teste = 1 linha aqui (ativo = false na antiga, insert na nova).
---------------------------------------------------------------------------------------------------
create table if not exists public.dashboard_funil_teste_marca (
  id_funil text not null,
  marca text not null,
  ativo boolean not null default true,
  desde timestamptz not null default now(),
  motivo text,
  primary key (id_funil, marca)
);
alter table public.dashboard_funil_teste_marca enable row level security;
comment on table public.dashboard_funil_teste_marca is
  'Deals de um funil fora da lista de vw_funil_vendas que entram no dashboard, por marca (testes de marca nova). 17/11/2026.';
insert into public.dashboard_funil_teste_marca (id_funil, marca, motivo)
values ('6abf2318dca0200020ff065d', 'Kebabs', 'Teste da marca Kebabs (até 100 MQLs), pedido do Junior em 17/11/2026')
on conflict do nothing;

insert into public._backup_viewdefs (nome, criado_em, def)
select 'vw_funil_vendas_pre_funil_teste_20261117', now(), pg_get_viewdef('public.vw_funil_vendas'::regclass);

do $$
declare
  d text := pg_get_viewdef('public.vw_funil_vendas'::regclass);
  a text := $a$OR (d.id_funil = '6a99b60d62f84e00234789da'::text))$a$;
  b text := $b$OR (d.id_funil = '6a99b60d62f84e00234789da'::text) OR (EXISTS ( SELECT 1 FROM dashboard_funil_teste_marca ft WHERE ((ft.id_funil = d.id_funil) AND (ft.marca = d.marca) AND ft.ativo))))$b$;
begin
  if position(a in d) = 0 then raise exception 'âncora não encontrada em vw_funil_vendas'; end if;
  execute 'create or replace view public.vw_funil_vendas as ' || replace(d, a, b);
end $$;
select public.dash_sincronizar(true);

---------------------------------------------------------------------------------------------------
-- D) Cadência 50 "Kebabs (teste) — Tentativa de Contato (dias 1, 2, 4 e 5)", criada DESLIGADA
--    (ativa = false) por inserts diretos, como a 45. Funil de teste, etapas Novo MQL e Tentando
--    Contato, condição Marca = Kebabs (grupo 1). 21 passos: Pesquisa no D1 + por dia (1, 2, 4, 5)
--    ligações 09:00/11:00/14:00/16:30 e Whats manual 10:00. Ligar quando a regra da Kebabs ficar ativa:
--      update cadencias set ativa = true where id = 50;
---------------------------------------------------------------------------------------------------
