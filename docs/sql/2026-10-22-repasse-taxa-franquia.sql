-- 2026-10-22 — Repasse da taxa de franquia (Supabase de Expansão)
-- Aplicado como migration `repasse_taxa_franquia_versionado`.
--
-- Quanto de cada venda fica com a We Scale e quanto vai pra marca. Versões
-- imutáveis com data de vigência: cada venda usa a versão vigente NA DATA DA
-- VENDA, então publicar uma versão nova nunca muda o histórico anterior a ela.
-- Escrita só pela Edge Function gravar-repasse (permissão acao.repasse-editar).
-- Leitura do dashboard: vw_repasse_taxa.

create table public.repasse_taxa_versao (
  id bigserial primary key,
  numero int not null unique,
  vigente_desde date not null unique,
  motivo text,
  criado_por text,
  criado_em timestamptz not null default now()
);

create table public.repasse_taxa_marca (
  versao_id bigint not null references public.repasse_taxa_versao(id) on delete restrict,
  marca text not null,
  pct_we_scale numeric(5,2) not null check (pct_we_scale >= 0 and pct_we_scale <= 100),
  primary key (versao_id, marca)
);

alter table public.repasse_taxa_versao enable row level security;
alter table public.repasse_taxa_marca enable row level security;

create or replace function public.repasse_bloquear_mudanca() returns trigger
language plpgsql as $$
begin
  raise exception 'Versão de repasse publicada não pode ser alterada nem apagada. Publique uma versão nova.';
end $$;

create trigger repasse_versao_imutavel before update or delete on public.repasse_taxa_versao
  for each row execute function public.repasse_bloquear_mudanca();
create trigger repasse_marca_imutavel before update or delete on public.repasse_taxa_marca
  for each row execute function public.repasse_bloquear_mudanca();

create or replace function public.publicar_repasse_versao(p jsonb, p_autor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_desde date := (p->>'vigenteDesde')::date;
  v_ultima date;
  v_num int;
  v_id bigint;
  v_item jsonb;
  v_pct numeric;
begin
  if v_desde is null then raise exception 'vigenteDesde obrigatório'; end if;
  if coalesce(btrim(p->>'motivo'), '') = '' then raise exception 'motivo obrigatório'; end if;
  if jsonb_typeof(p->'marcas') <> 'array' or jsonb_array_length(p->'marcas') = 0 then
    raise exception 'informe ao menos uma marca';
  end if;

  perform pg_advisory_xact_lock(hashtext('repasse_taxa_versao'));
  select max(vigente_desde), coalesce(max(numero), 0) + 1 into v_ultima, v_num from repasse_taxa_versao;
  if v_ultima is not null and v_desde <= v_ultima then
    raise exception 'A nova versão tem que valer a partir de uma data depois de % (vigência da versão atual).', to_char(v_ultima, 'DD/MM/YYYY');
  end if;

  insert into repasse_taxa_versao (numero, vigente_desde, motivo, criado_por)
  values (v_num, v_desde, btrim(p->>'motivo'), p_autor) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p->'marcas') loop
    v_pct := (v_item->>'pctWeScale')::numeric;
    if coalesce(btrim(v_item->>'marca'), '') = '' or v_pct is null or v_pct < 0 or v_pct > 100 then
      raise exception 'marca ou percentual inválido: %', v_item;
    end if;
    insert into repasse_taxa_marca (versao_id, marca, pct_we_scale) values (v_id, btrim(v_item->>'marca'), v_pct);
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;

revoke all on function public.publicar_repasse_versao(jsonb, text) from public, anon, authenticated;
grant execute on function public.publicar_repasse_versao(jsonb, text) to service_role;

create or replace view public.vw_repasse_taxa as
select v.id as versao_id, v.numero, v.vigente_desde, v.motivo, v.criado_por, v.criado_em,
       m.marca, m.pct_we_scale
from repasse_taxa_versao v
join repasse_taxa_marca m on m.versao_id = v.id;

grant select on public.vw_repasse_taxa to anon, authenticated;

-- V1: percentuais informados pelo Junior em 22/10/2026, valendo desde o início da base.
insert into repasse_taxa_versao (numero, vigente_desde, motivo, criado_por)
values (1, '2025-01-01', 'Percentuais atuais, informados pelo Junior em 22/10/2026', 'Junior (via Claude Code)');
insert into repasse_taxa_marca (versao_id, marca, pct_we_scale)
select (select id from repasse_taxa_versao where numero = 1), x.marca, x.pct
from (values ('Oral Unic', 100), ('B2Case', 100), ('Lisô Laser', 100), ('Inpot', 60), ('Eletrovias', 70), ('Viva', 100)) as x(marca, pct);

-- Testes rodados em 22/10 (transação com rollback): publicar V2 com vigência
-- 2027-01-01 funciona; UPDATE em repasse_taxa_marca é bloqueado; publicar com
-- vigência ≤ a da última versão é recusado.
