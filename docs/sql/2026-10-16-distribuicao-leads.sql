-- Distribuição de leads por SDR com peso da meta — Supabase de Expansão (cygxmduuwlwfbodfrlkr)
-- Spec: docs/superpowers/specs/2026-10-16-distribuicao-leads-sdr-design.md
-- Plano: docs/superpowers/plans/2026-10-16-distribuicao-leads-sdr.md
-- Cada bloco foi aplicado como migration (nome entre colchetes) via MCP em 16/10/2026.
-- Nenhuma tabela, view ou função já existente é alterada.

-- =====================================================================================
-- Bloco 1 [distribuicao_leads_tabelas] — tabelas, triggers de imutabilidade e views
-- =====================================================================================

-- Regra por marca, versionada (append-only). 1 vigente por marca (vigente_ate IS NULL).
create table public.distribuicao_regra (
  id                         bigserial primary key,
  marca                      text        not null,               -- nome das metas (meta_marca.marca), ex. 'Odonto Scale'
  marca_rd                   text        not null,               -- valor do campo "Marca" no RD CRM, ex. 'Odonto Legacy'
  versao                     integer     not null,
  vigente_de                 timestamptz not null default now(),
  vigente_ate                timestamptz,
  modo                       text        not null check (modo in ('desligado','sombra','ativo')),
  evento_identificador       text        not null,               -- event_identifier do webhook (ex. eletrovias_multistep)
  id_funil                   text        not null,
  id_etapa                   text        not null,
  campaign_id                text,
  barreira_campo             text,                               -- chave no payload (cf_...); null = sem barreira
  barreira_valores_barrados  text[]      not null default '{}',
  responsavel_padrao_user_id text        not null,
  nome_formato               text,                               -- ex. 'Scale Partner - {primeiro_nome}'
  campos_extra               jsonb       not null default '{}'::jsonb,  -- {"<chave payload>": "<custom_field_id do CRM>"}
  time_proprio               jsonb,                              -- [{"nome","peso"}], só vale sem meta (cadeia item 3)
  criado_por                 text,
  criado_em                  timestamptz not null default now(),
  motivo                     text,
  unique (marca, versao)
);
create unique index ux_distribuicao_regra_vigente on public.distribuicao_regra (marca) where vigente_ate is null;
create index ix_distribuicao_regra_evento on public.distribuicao_regra (evento_identificador) where vigente_ate is null;

-- Log de TODA conversão recebida (inclusive barradas e simuladas).
create table public.distribuicao_atribuicao (
  id                   bigserial primary key,
  recebido_em          timestamptz not null default now(),
  marca                text        not null,
  evento_identificador text        not null,
  regra_id             bigint      not null references public.distribuicao_regra(id),
  lead_email           text,
  lead_uuid            text,
  lead_nome            text,
  payload              jsonb       not null,
  resultado            text        not null check (resultado in ('atribuido','barrado','duplicado','simulado','fallback','erro')),
  motivo               text,
  barreira_valor_lido  text,
  fonte_time           text        check (fonte_time in ('versao_ativa','versao_anterior','time_proprio','nenhum')),
  meta_versao_id       bigint,
  reinicio_em          timestamptz,
  nome_sdr             text,
  user_id              text,
  contadores           jsonb,
  inelegiveis          jsonb,
  id_deal              text,
  tentativas           integer     not null default 0,
  erro_rd              text,
  reprocessado_em      timestamptz,
  reprocessado_por     text
);
create index ix_distribuicao_atribuicao_marca_data  on public.distribuicao_atribuicao (marca, recebido_em desc);
create index ix_distribuicao_atribuicao_lead        on public.distribuicao_atribuicao (lead_email, marca, recebido_em desc);
create index ix_distribuicao_atribuicao_resultado   on public.distribuicao_atribuicao (resultado);

-- Disponibilidade dos SDRs (histórico: linha nunca é apagada, só encerrada).
create table public.distribuicao_disponibilidade (
  id           bigserial primary key,
  nome_sdr     text        not null,          -- = nome_cargo_foto.nome
  tipo         text        not null check (tipo in ('fora_agora','ausencia')),
  inicio       timestamptz not null default now(),
  fim          timestamptz,
  motivo       text,
  criado_por   text,
  criado_em    timestamptz not null default now(),
  encerrado_em timestamptz,
  check (fim is null or fim > inicio)
);
create index ix_distribuicao_disponibilidade_sdr on public.distribuicao_disponibilidade (nome_sdr, inicio desc);

-- Configuração geral.
create table public.distribuicao_config (
  chave     text primary key,
  valor     text not null,
  descricao text
);
insert into public.distribuicao_config (chave, valor, descricao) values
  ('janela_dedup_min',      '10', 'Mesmo e-mail + marca + evento dentro desta janela (min) vira "duplicado"'),
  ('retries_rd',            '3',  'Tentativas do POST /deals no RD CRM (só 429, 5xx e timeout repetem)'),
  ('alerta_silencio_horas', '6',  'Marca ativa sem nenhum registro há mais de N horas em dia útil dispara alerta');

-- Imutabilidade: regra só muda em vigente_ate (null -> valor); disponibilidade só em fim/encerrado_em.
create or replace function public.distribuicao_regra_imutavel() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'distribuicao_regra é append-only: não apague versões';
  end if;
  if old.vigente_ate is not null then
    raise exception 'versão % da marca % já encerrada: publique uma versão nova', old.versao, old.marca;
  end if;
  if row(new.id, new.marca, new.marca_rd, new.versao, new.vigente_de, new.modo, new.evento_identificador, new.id_funil, new.id_etapa,
         new.campaign_id, new.barreira_campo, new.barreira_valores_barrados, new.responsavel_padrao_user_id, new.nome_formato,
         new.campos_extra, new.time_proprio, new.criado_por, new.criado_em, new.motivo)
     is distinct from
     row(old.id, old.marca, old.marca_rd, old.versao, old.vigente_de, old.modo, old.evento_identificador, old.id_funil, old.id_etapa,
         old.campaign_id, old.barreira_campo, old.barreira_valores_barrados, old.responsavel_padrao_user_id, old.nome_formato,
         old.campos_extra, old.time_proprio, old.criado_por, old.criado_em, old.motivo) then
    raise exception 'distribuicao_regra é imutável: só vigente_ate pode mudar (publique uma versão nova)';
  end if;
  return new;
end $$;
create trigger distribuicao_regra_imutavel before update or delete on public.distribuicao_regra
  for each row execute function public.distribuicao_regra_imutavel();

create or replace function public.distribuicao_disponibilidade_imutavel() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'distribuicao_disponibilidade é histórico: encerre em vez de apagar';
  end if;
  if row(new.id, new.nome_sdr, new.tipo, new.inicio, new.motivo, new.criado_por, new.criado_em)
     is distinct from
     row(old.id, old.nome_sdr, old.tipo, old.inicio, old.motivo, old.criado_por, old.criado_em) then
    raise exception 'distribuicao_disponibilidade: só fim e encerrado_em podem mudar';
  end if;
  return new;
end $$;
create trigger distribuicao_disponibilidade_imutavel before update or delete on public.distribuicao_disponibilidade
  for each row execute function public.distribuicao_disponibilidade_imutavel();

-- RLS ligado, sem policy: só service_role (bypass) toca nas tabelas; o front lê pelas views.
alter table public.distribuicao_regra            enable row level security;
alter table public.distribuicao_atribuicao       enable row level security;
alter table public.distribuicao_disponibilidade  enable row level security;
alter table public.distribuicao_config           enable row level security;
revoke all on public.distribuicao_regra, public.distribuicao_atribuicao, public.distribuicao_disponibilidade, public.distribuicao_config from anon, authenticated;

-- Views (rodam com os direitos do dono, mesmo padrão das outras vw_* lidas pela anon).
create or replace view public.vw_distribuicao_regras as
  select id, marca, marca_rd, versao, vigente_de, vigente_ate, modo, evento_identificador, id_funil, id_etapa, campaign_id,
         barreira_campo, barreira_valores_barrados, responsavel_padrao_user_id, nome_formato, campos_extra, time_proprio,
         criado_por, criado_em, motivo
  from public.distribuicao_regra;

-- Sem payload: tem telefone e respostas do lead.
create or replace view public.vw_distribuicao_atribuicoes as
  select id, recebido_em, marca, evento_identificador, regra_id, lead_email, lead_uuid, lead_nome, resultado, motivo,
         barreira_valor_lido, fonte_time, meta_versao_id, reinicio_em, nome_sdr, user_id, contadores, inelegiveis,
         id_deal, tentativas, erro_rd, reprocessado_em, reprocessado_por
  from public.distribuicao_atribuicao;

create or replace view public.vw_distribuicao_disponibilidade as
  select d.*,
         (d.encerrado_em is null and d.inicio <= now() and (d.fim is null or d.fim > now())) as cobre_agora
  from public.distribuicao_disponibilidade d;

grant select on public.vw_distribuicao_regras, public.vw_distribuicao_atribuicoes, public.vw_distribuicao_disponibilidade to anon, authenticated;

-- Teste das travas (rolado em transação):
-- begin; insert 1 vigente; 2ª vigente da mesma marca -> unique_violation; update modo -> exceção do trigger; rollback;

-- =====================================================================================
-- Bloco 2 [distribuicao_time_da_marca] — time da marca pela cadeia
--   (1) versão ativa das metas do mês corrente → (2) última versão ativa de mês anterior
--   → (3) time_proprio da regra vigente → 'nenhum'.
-- Elegível = funcao SDR, peso > 0, cadastrado em nome_cargo_foto com user_id e ativo,
-- sem distribuicao_disponibilidade cobrindo p_em. Pesos renormalizados para 100.
-- reinicio_em = maior entre ativada_em da versão (ou vigente_de da regra), a virada do
-- mês e a última mudança de disponibilidade de alguém do time.
-- =====================================================================================
create or replace function public.distribuicao_time_da_marca(p_marca text, p_em timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes        date := date_trunc('month', p_em)::date;
  v_versao_id  bigint;
  v_ativada    timestamptz;
  v_fonte      text;
  v_reinicio   timestamptz;
  v_regra      public.distribuicao_regra;
  v_time       jsonb;
  v_sdrs       jsonb := '[]'::jsonb;
  v_inel       jsonb := '[]'::jsonb;
  v_soma       numeric := 0;
  v_disp       timestamptz;
  rec          record;
  v_cad        record;
begin
  select v.id, v.ativada_em into v_versao_id, v_ativada
  from public.meta_versao v
  join public.meta_marca mm on mm.meta_versao_id = v.id and mm.marca = p_marca
  where v.ativa and v.mes_referencia = v_mes
  limit 1;
  if found then
    v_fonte := 'versao_ativa';
  else
    select v.id, v.ativada_em into v_versao_id, v_ativada
    from public.meta_versao v
    join public.meta_marca mm on mm.meta_versao_id = v.id and mm.marca = p_marca
    where v.ativa and v.mes_referencia < v_mes
    order by v.mes_referencia desc
    limit 1;
    if found then v_fonte := 'versao_anterior'; end if;
  end if;

  select * into v_regra from public.distribuicao_regra where marca = p_marca and vigente_ate is null;

  if v_fonte is not null then
    select jsonb_agg(jsonb_build_object('nome', mp.nome, 'peso', mp.peso) order by mp.nome) into v_time
    from public.meta_pessoa mp
    join public.meta_marca mm on mm.id = mp.meta_marca_id
    where mm.meta_versao_id = v_versao_id and mm.marca = p_marca and mp.funcao = 'SDR' and mp.peso > 0;
    v_reinicio := greatest(coalesce(v_ativada, '-infinity'::timestamptz), date_trunc('month', p_em));
  elsif v_regra.time_proprio is not null and jsonb_typeof(v_regra.time_proprio) = 'array' and jsonb_array_length(v_regra.time_proprio) > 0 then
    v_fonte := 'time_proprio';
    v_time := v_regra.time_proprio;
    v_versao_id := null;
    v_reinicio := greatest(v_regra.vigente_de, date_trunc('month', p_em));
  else
    return jsonb_build_object('fonte', 'nenhum', 'meta_versao_id', null, 'reinicio_em', date_trunc('month', p_em),
                              'sdrs', '[]'::jsonb, 'inelegiveis', '[]'::jsonb);
  end if;

  for rec in
    select t->>'nome' as nome, (t->>'peso')::numeric as peso
    from jsonb_array_elements(coalesce(v_time, '[]'::jsonb)) t
    where (t->>'peso')::numeric > 0
  loop
    select n.user_id, n.ativo into v_cad from public.nome_cargo_foto n where n.nome = rec.nome limit 1;
    if not found then
      v_inel := v_inel || jsonb_build_object('nome', rec.nome, 'peso', rec.peso, 'motivo', 'sem cadastro em nome_cargo_foto');
    elsif v_cad.user_id is null then
      v_inel := v_inel || jsonb_build_object('nome', rec.nome, 'peso', rec.peso, 'motivo', 'sem user_id do RD no cadastro');
    elsif coalesce(v_cad.ativo, false) = false then
      v_inel := v_inel || jsonb_build_object('nome', rec.nome, 'peso', rec.peso, 'motivo', 'inativo no cadastro');
    elsif exists (
      select 1 from public.distribuicao_disponibilidade d
      where d.nome_sdr = rec.nome and d.encerrado_em is null and d.inicio <= p_em and (d.fim is null or d.fim > p_em)
    ) then
      v_inel := v_inel || jsonb_build_object('nome', rec.nome, 'peso', rec.peso, 'motivo', 'fora (disponibilidade)');
    else
      v_sdrs := v_sdrs || jsonb_build_object('nome', rec.nome, 'user_id', v_cad.user_id, 'peso', rec.peso);
      v_soma := v_soma + rec.peso;
    end if;
  end loop;

  if v_soma > 0 then
    select jsonb_agg(jsonb_build_object('nome', s->>'nome', 'user_id', s->>'user_id',
                                        'peso', round((s->>'peso')::numeric * 100 / v_soma, 2)) order by s->>'nome')
      into v_sdrs
    from jsonb_array_elements(v_sdrs) s;
  end if;

  select max(x) into v_disp from (
    select unnest(array[d.criado_em, d.encerrado_em,
                        case when d.fim <= p_em then d.fim end,
                        case when d.inicio <= p_em then d.inicio end]) as x
    from public.distribuicao_disponibilidade d
    where d.nome_sdr in (select t->>'nome' from jsonb_array_elements(coalesce(v_time, '[]'::jsonb)) t)
  ) u where x is not null and x <= p_em;
  if v_disp is not null then v_reinicio := greatest(v_reinicio, v_disp); end if;

  return jsonb_build_object(
    'fonte', v_fonte,
    'meta_versao_id', v_versao_id,
    'reinicio_em', v_reinicio,
    'sdrs', coalesce(v_sdrs, '[]'::jsonb),
    'inelegiveis', v_inel
  );
end $$;

revoke execute on function public.distribuicao_time_da_marca(text, timestamptz) from public, anon, authenticated;
grant execute on function public.distribuicao_time_da_marca(text, timestamptz) to service_role;

-- Teste do bloco 2 (rolado): fixture em 2030-01 com TA 50 / TB 20 / TC 30 (TC sem user_id) →
--   versao_ativa com TA 71.43 / TB 28.57 e TC inelegível; 2030-02 sem versão → versao_anterior com
--   reinicio = virada do mês; TB "fora_agora" → só TA 100 e reinicio = criado_em; marca só com
--   time_proprio → 'time_proprio'; sem nada → 'nenhum'. 10/10 em 16/10/2026.
