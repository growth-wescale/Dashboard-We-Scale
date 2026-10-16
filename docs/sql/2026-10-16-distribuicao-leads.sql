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

-- =====================================================================================
-- Bloco 3 [distribuicao_processar] — escolha pura + processamento de UMA conversão
--   distribuicao_escolher(sdrs, contadores): minimiza n_i − p_i × (N+1)/100; empate por
--   maior peso, depois nome. Com 50/20/30 e 10 leads: TA,TC,TB,TA,TA,TC,TA,TB,TC,TA → 5/2/3.
--   distribuicao_processar(payload, recebido_em): regra vigente pelo event_identifier →
--   lock por marca → dedup (janela_dedup_min) → barreira (campo ausente passa; array barra se
--   qualquer elemento estiver na lista) → time (bloco 2) → escolha → INSERT no log → devolve
--   o objeto `deal` pronto pro POST. Em modo 'sombra' grava 'simulado' e conta só simulados;
--   em 'ativo' conta 'atribuido' + 'erro' (pendente de reprocessar) desde reinicio_em.
--   Sem SDR elegível → 'fallback' com responsavel_padrao_user_id (não entra no contador).
-- =====================================================================================
create or replace function public.distribuicao_escolher(p_sdrs jsonb, p_contadores jsonb)
returns text
language sql
immutable
as $$
  with s as (
    select e->>'nome' as nome, (e->>'peso')::numeric as peso,
           coalesce((p_contadores->>(e->>'nome'))::numeric, 0) as n
    from jsonb_array_elements(coalesce(p_sdrs, '[]'::jsonb)) e
  ), t as (select coalesce(sum(n), 0) as total from s)
  select s.nome
  from s, t
  order by (s.n - s.peso * (t.total + 1) / 100) asc, s.peso desc, s.nome asc
  limit 1
$$;

create or replace function public.distribuicao_processar(p_payload jsonb, p_recebido_em timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento     text  := p_payload->>'event_identifier';
  v_contact    jsonb := coalesce(p_payload->'contact', '{}'::jsonb);
  v_email      text  := nullif(lower(btrim(v_contact->>'email')), '');
  v_regra      public.distribuicao_regra;
  v_janela     int;
  v_time       jsonb;
  v_sdrs       jsonb;
  v_cont       jsonb := '{}'::jsonb;
  v_cont_out   jsonb;
  v_contar     text[];
  v_nome       text;
  v_user       text;
  v_resultado  text;
  v_motivo     text;
  v_valor      jsonb;
  v_valor_txt  text;
  v_barrado    boolean := false;
  v_fallback   boolean := false;
  v_id         bigint;
  v_nome_lead  text;
  v_deal_name  text;
  v_deal       jsonb;
begin
  if v_evento is null then
    return jsonb_build_object('resultado', 'ignorado', 'motivo', 'sem event_identifier');
  end if;
  select * into v_regra from public.distribuicao_regra where evento_identificador = v_evento and vigente_ate is null limit 1;
  if not found then
    return jsonb_build_object('resultado', 'ignorado', 'motivo', 'sem regra vigente para o evento ' || v_evento);
  end if;
  if v_regra.modo = 'desligado' then
    return jsonb_build_object('resultado', 'ignorado', 'motivo', 'marca ' || v_regra.marca || ' desligada', 'marca', v_regra.marca);
  end if;
  if v_email is null then
    return jsonb_build_object('resultado', 'ignorado', 'motivo', 'sem e-mail no payload', 'marca', v_regra.marca);
  end if;

  perform pg_advisory_xact_lock(hashtext('distribuicao:' || v_regra.marca));

  select coalesce(valor::int, 10) into v_janela from public.distribuicao_config where chave = 'janela_dedup_min';
  v_janela := coalesce(v_janela, 10);

  if exists (
    select 1 from public.distribuicao_atribuicao a
    where a.marca = v_regra.marca and a.lead_email = v_email and a.evento_identificador = v_evento
      and a.resultado <> 'duplicado'
      and a.recebido_em > p_recebido_em - make_interval(mins => v_janela) and a.recebido_em <= p_recebido_em
  ) then
    insert into public.distribuicao_atribuicao (recebido_em, marca, evento_identificador, regra_id, lead_email, lead_uuid, lead_nome, payload, resultado, motivo)
    values (p_recebido_em, v_regra.marca, v_evento, v_regra.id, v_email, v_contact->>'uuid', v_contact->>'name', p_payload,
            'duplicado', 'mesmo lead no mesmo evento há menos de ' || v_janela || ' min')
    returning id into v_id;
    return jsonb_build_object('atribuicao_id', v_id, 'resultado', 'duplicado', 'marca', v_regra.marca, 'regra_id', v_regra.id, 'modo', v_regra.modo);
  end if;

  if v_regra.barreira_campo is not null and cardinality(v_regra.barreira_valores_barrados) > 0 then
    v_valor := v_contact -> v_regra.barreira_campo;
    if v_valor is null or jsonb_typeof(v_valor) = 'null'
       or (jsonb_typeof(v_valor) = 'string' and btrim(v_valor #>> '{}') = '') then
      v_motivo := 'campo vazio, passou';
    elsif jsonb_typeof(v_valor) = 'array' then
      select string_agg(e, ', ') into v_valor_txt from jsonb_array_elements_text(v_valor) e;
      v_barrado := exists (select 1 from jsonb_array_elements_text(v_valor) e where e = any(v_regra.barreira_valores_barrados));
    else
      v_valor_txt := v_valor #>> '{}';
      v_barrado := v_valor_txt = any(v_regra.barreira_valores_barrados);
    end if;
  end if;
  if v_barrado then
    insert into public.distribuicao_atribuicao (recebido_em, marca, evento_identificador, regra_id, lead_email, lead_uuid, lead_nome, payload, resultado, motivo, barreira_valor_lido)
    values (p_recebido_em, v_regra.marca, v_evento, v_regra.id, v_email, v_contact->>'uuid', v_contact->>'name', p_payload,
            'barrado', v_regra.barreira_campo || ' = ' || v_valor_txt, v_valor_txt)
    returning id into v_id;
    return jsonb_build_object('atribuicao_id', v_id, 'resultado', 'barrado', 'motivo', v_regra.barreira_campo || ' = ' || v_valor_txt,
                              'marca', v_regra.marca, 'regra_id', v_regra.id, 'modo', v_regra.modo);
  end if;

  v_time := public.distribuicao_time_da_marca(v_regra.marca, p_recebido_em);
  v_sdrs := coalesce(v_time->'sdrs', '[]'::jsonb);
  if jsonb_array_length(v_sdrs) = 0 then
    v_fallback := true;
    v_user := v_regra.responsavel_padrao_user_id;
    v_nome := null;
    v_motivo := 'sem SDR elegível (' || (v_time->>'fonte') || ')'
      || coalesce(': ' || (select string_agg((i->>'nome') || ' ' || (i->>'motivo'), '; ') from jsonb_array_elements(v_time->'inelegiveis') i), '');
    v_resultado := case when v_regra.modo = 'sombra' then 'simulado' else 'fallback' end;
    v_cont_out := '{}'::jsonb;
  else
    v_contar := case when v_regra.modo = 'sombra' then array['simulado'] else array['atribuido', 'erro'] end;
    select coalesce(jsonb_object_agg(nome_sdr, n), '{}'::jsonb) into v_cont
    from (
      select nome_sdr, count(*) as n
      from public.distribuicao_atribuicao
      where marca = v_regra.marca and resultado = any(v_contar) and nome_sdr is not null
        and recebido_em >= (v_time->>'reinicio_em')::timestamptz and recebido_em < p_recebido_em
      group by nome_sdr
    ) x;
    v_nome := public.distribuicao_escolher(v_sdrs, v_cont);
    select s->>'user_id' into v_user from jsonb_array_elements(v_sdrs) s where s->>'nome' = v_nome;
    v_resultado := case when v_regra.modo = 'sombra' then 'simulado' else 'atribuido' end;
    v_motivo := coalesce(v_motivo, 'mais abaixo da cota desde ' || to_char((v_time->>'reinicio_em')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'));
    select jsonb_object_agg(s->>'nome', jsonb_build_array(coalesce((v_cont->>(s->>'nome'))::int, 0), (s->>'peso')::numeric)) into v_cont_out
    from jsonb_array_elements(v_sdrs) s;
  end if;

  v_nome_lead := coalesce(nullif(btrim(v_contact->>'name'), ''), v_email);
  v_deal_name := case when v_regra.nome_formato is not null
                      then replace(v_regra.nome_formato, '{primeiro_nome}', split_part(v_nome_lead, ' ', 1))
                      else v_nome_lead end;
  v_deal := jsonb_build_object(
    'name', v_deal_name,
    'deal_stage_id', v_regra.id_etapa,
    'user_id', v_user,
    'campaign_id', v_regra.campaign_id,
    'marca_rd', v_regra.marca_rd,
    'nome_sdr', v_nome,
    'contato', jsonb_build_object('nome', v_nome_lead, 'email', v_email,
                                  'telefone', coalesce(v_contact->>'mobile_phone', v_contact->>'personal_phone')),
    'utm', jsonb_build_object(
      'source',   coalesce(v_contact->>'utm_source',   v_contact->>'cf_utm_source'),
      'medium',   coalesce(v_contact->>'utm_medium',   v_contact->>'cf_utm_medium'),
      'campaign', coalesce(v_contact->>'utm_campaign', v_contact->>'cf_utm_campaign'),
      'term',     coalesce(v_contact->>'utm_term',     v_contact->>'cf_utm_term'),
      'content',  coalesce(v_contact->>'utm_content',  v_contact->>'cf_utm_content')),
    'cidade', v_contact->>'city',
    'estado', coalesce(v_contact->>'state', v_contact->>'cf_estado'),
    'capital', v_valor_txt,
    'campos_extra', (
      select coalesce(jsonb_object_agg(ce.value, v_contact->ce.key), '{}'::jsonb)
      from jsonb_each_text(coalesce(v_regra.campos_extra, '{}'::jsonb)) ce
      where v_contact ? ce.key
    )
  );

  insert into public.distribuicao_atribuicao
    (recebido_em, marca, evento_identificador, regra_id, lead_email, lead_uuid, lead_nome, payload, resultado, motivo,
     barreira_valor_lido, fonte_time, meta_versao_id, reinicio_em, nome_sdr, user_id, contadores, inelegiveis, deal_pronto)
  values
    (p_recebido_em, v_regra.marca, v_evento, v_regra.id, v_email, v_contact->>'uuid', v_contact->>'name', p_payload, v_resultado, v_motivo,
     v_valor_txt, v_time->>'fonte', (v_time->>'meta_versao_id')::bigint, (v_time->>'reinicio_em')::timestamptz, v_nome, v_user, v_cont_out, v_time->'inelegiveis', v_deal)
  returning id into v_id;

  return jsonb_build_object(
    'atribuicao_id', v_id, 'resultado', v_resultado, 'motivo', v_motivo,
    'marca', v_regra.marca, 'regra_id', v_regra.id, 'modo', v_regra.modo,
    'nome_sdr', v_nome, 'user_id', v_user, 'fallback', v_fallback, 'deal', v_deal
  );
end $$;

revoke execute on function public.distribuicao_escolher(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.distribuicao_processar(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.distribuicao_escolher(jsonb, jsonb) to service_role;
grant execute on function public.distribuicao_processar(jsonb, timestamptz) to service_role;
-- Teste do bloco 3 (rolado): sequência e contagem 5/2/3; barrado valor simples e em lista;
--   campo vazio passa com motivo 'campo vazio, passou'; duplicado em 1 min e atribuido 11 min
--   depois; evento desconhecido 'ignorado' sem linha; marca sem time → fallback com uPad;
--   sombra → simulado fora do contador do ativo. 14/14 em 16/10/2026.

-- =====================================================================================
-- Bloco 4 [distribuicao_escrita] — coluna deal_pronto no log (reprocessar reenvia o mesmo
-- objeto, sem recalcular a escolha; distribuicao_processar passou a gravá-la) + RPCs:
--   distribuicao_fechar(id, id_deal, erro, tentativas)   — passo 7 do Edge
--   distribuicao_publicar_regra(p jsonb, autor)           — encerra a vigente e insere versao+1;
--       exige marca, marca_rd, modo, evento, funil, etapa, responsável padrão; motivo a partir
--       da v2; recusa evento já usado por outra marca
--   distribuicao_alterar_disponibilidade(p jsonb, autor) — fora_agora | voltou | agendar | cancelar
--   distribuicao_reabrir(id)                              — só registro em 'erro'; devolve payload + deal
-- Todas security definer, só service_role.
-- =====================================================================================
alter table public.distribuicao_atribuicao add column if not exists deal_pronto jsonb;
-- distribuicao_processar: mesmo corpo do bloco 3, com deal_pronto na lista do INSERT.

create or replace function public.distribuicao_fechar(p_id bigint, p_id_deal text, p_erro text, p_tentativas int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id_deal is not null then
    update public.distribuicao_atribuicao
       set id_deal = p_id_deal, erro_rd = null, tentativas = coalesce(p_tentativas, tentativas),
           resultado = case when nome_sdr is null then 'fallback' else 'atribuido' end
     where id = p_id;
  else
    update public.distribuicao_atribuicao
       set erro_rd = p_erro, tentativas = coalesce(p_tentativas, tentativas), resultado = 'erro'
     where id = p_id;
  end if;
end $$;

create or replace function public.distribuicao_publicar_regra(p jsonb, p_autor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marca text := p->>'marca';
  v_versao int;
  v_id bigint;
  v_outra text;
  k text;
begin
  foreach k in array array['marca','marca_rd','modo','evento_identificador','id_funil','id_etapa','responsavel_padrao_user_id'] loop
    if nullif(btrim(coalesce(p->>k, '')), '') is null then
      raise exception 'campo obrigatório ausente: %', k;
    end if;
  end loop;
  if (p->>'modo') not in ('desligado','sombra','ativo') then
    raise exception 'modo inválido: %', p->>'modo';
  end if;

  perform pg_advisory_xact_lock(hashtext('distribuicao:' || v_marca));

  select marca into v_outra from public.distribuicao_regra
   where evento_identificador = p->>'evento_identificador' and vigente_ate is null and marca <> v_marca limit 1;
  if v_outra is not null then
    raise exception 'evento % já é usado pela regra vigente da marca %', p->>'evento_identificador', v_outra;
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao from public.distribuicao_regra where marca = v_marca;
  if v_versao > 1 and nullif(btrim(coalesce(p->>'motivo', '')), '') is null then
    raise exception 'motivo é obrigatório para publicar uma versão nova da regra';
  end if;

  update public.distribuicao_regra set vigente_ate = now() where marca = v_marca and vigente_ate is null;

  insert into public.distribuicao_regra
    (marca, marca_rd, versao, vigente_de, modo, evento_identificador, id_funil, id_etapa, campaign_id,
     barreira_campo, barreira_valores_barrados, responsavel_padrao_user_id, nome_formato, campos_extra, time_proprio,
     criado_por, motivo)
  values
    (v_marca, p->>'marca_rd', v_versao, now(), p->>'modo', p->>'evento_identificador', p->>'id_funil', p->>'id_etapa', nullif(p->>'campaign_id', ''),
     nullif(p->>'barreira_campo', ''),
     coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'barreira_valores_barrados', '[]'::jsonb)) x), '{}'::text[]),
     p->>'responsavel_padrao_user_id', nullif(p->>'nome_formato', ''),
     coalesce(p->'campos_extra', '{}'::jsonb),
     case when jsonb_typeof(p->'time_proprio') = 'array' and jsonb_array_length(p->'time_proprio') > 0 then p->'time_proprio' else null end,
     p_autor, nullif(p->>'motivo', ''))
  returning id into v_id;

  return jsonb_build_object('regra_id', v_id, 'versao', v_versao);
end $$;

create or replace function public.distribuicao_alterar_disponibilidade(p jsonb, p_autor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acao text := p->>'acao';
  v_sdr  text := p->>'nome_sdr';
  v_id   bigint;
begin
  if v_acao = 'fora_agora' then
    if v_sdr is null then raise exception 'nome_sdr obrigatório'; end if;
    select id into v_id from public.distribuicao_disponibilidade
     where nome_sdr = v_sdr and tipo = 'fora_agora' and encerrado_em is null and fim is null limit 1;
    if v_id is null then
      insert into public.distribuicao_disponibilidade (nome_sdr, tipo, inicio, motivo, criado_por)
      values (v_sdr, 'fora_agora', now(), nullif(p->>'motivo', ''), p_autor) returning id into v_id;
    end if;
  elsif v_acao = 'voltou' then
    if v_sdr is null then raise exception 'nome_sdr obrigatório'; end if;
    update public.distribuicao_disponibilidade
       set encerrado_em = now()
     where nome_sdr = v_sdr and encerrado_em is null and inicio <= now() and (fim is null or fim > now());
    select max(id) into v_id from public.distribuicao_disponibilidade where nome_sdr = v_sdr and encerrado_em is not null;
  elsif v_acao = 'agendar' then
    if v_sdr is null or p->>'inicio' is null or p->>'fim' is null then raise exception 'nome_sdr, inicio e fim são obrigatórios'; end if;
    insert into public.distribuicao_disponibilidade (nome_sdr, tipo, inicio, fim, motivo, criado_por)
    values (v_sdr, 'ausencia', (p->>'inicio')::timestamptz, (p->>'fim')::timestamptz, nullif(p->>'motivo', ''), p_autor) returning id into v_id;
  elsif v_acao = 'cancelar' then
    v_id := (p->>'id')::bigint;
    update public.distribuicao_disponibilidade set encerrado_em = now() where id = v_id and encerrado_em is null;
  else
    raise exception 'ação desconhecida: %', v_acao;
  end if;
  return jsonb_build_object('id', v_id, 'acao', v_acao);
end $$;

create or replace function public.distribuicao_reabrir(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.distribuicao_atribuicao;
begin
  select * into a from public.distribuicao_atribuicao where id = p_id;
  if not found then raise exception 'registro % não existe', p_id; end if;
  if a.resultado <> 'erro' then raise exception 'registro % não está em erro (%)', p_id, a.resultado; end if;
  return jsonb_build_object('atribuicao_id', a.id, 'marca', a.marca, 'regra_id', a.regra_id, 'nome_sdr', a.nome_sdr, 'user_id', a.user_id,
                            'tentativas', a.tentativas, 'payload', a.payload, 'deal', a.deal_pronto);
end $$;

revoke execute on function public.distribuicao_fechar(bigint, text, text, int) from public, anon, authenticated;
revoke execute on function public.distribuicao_publicar_regra(jsonb, text) from public, anon, authenticated;
revoke execute on function public.distribuicao_alterar_disponibilidade(jsonb, text) from public, anon, authenticated;
revoke execute on function public.distribuicao_reabrir(bigint) from public, anon, authenticated;
grant execute on function public.distribuicao_fechar(bigint, text, text, int) to service_role;
grant execute on function public.distribuicao_publicar_regra(jsonb, text) to service_role;
grant execute on function public.distribuicao_alterar_disponibilidade(jsonb, text) to service_role;
grant execute on function public.distribuicao_reabrir(bigint) to service_role;

-- =====================================================================================
-- Bloco 6 — regras iniciais (modo sombra, sem barreira) publicadas em 16/10/2026 e a query
-- de paridade. Webhook do RD Marketing criado pela tela (Integrações → Webhooks), gatilho
-- "Conversão", sem filtro de evento: a função ignora identificador sem regra vigente.
-- Responsável padrão inicial de todas as marcas = Brunno (gestor, user 68a6224426b00500192ff6f4);
-- o Junior troca na aba do dashboard. Marcas sem meta (IDA, Scale Partner, Beauty Connection)
-- com time_proprio = quem recebe hoje.
-- =====================================================================================
-- Eventos confirmados nas segmentações "Entrada Chatbot - <marca>" do RD Marketing:
--   eletrovias_multistep · inpot_multistep · lisolaser_multistep · b2case_multistep ·
--   viva_multistep · oralunic_multistep · IDA_multistep · odontolegacy_multistep ·
--   partner_multistep · beautyconnection_multistep
-- Exemplo (Eletrovias); as outras só mudam marca/evento/funil/etapa/campanha:
-- select distribuicao_publicar_regra('{"marca":"Eletrovias","marca_rd":"Eletrovias","modo":"sombra",
--   "evento_identificador":"eletrovias_multistep","id_funil":"69380917e00ed10014daaa62",
--   "id_etapa":"69380917e00ed10014daaa64","campaign_id":"69e0e12b7fe67b000120920d",
--   "responsavel_padrao_user_id":"68a6224426b00500192ff6f4"}'::jsonb, 'autor');
-- Regra "Teste" (Funil de teste, time_proprio Xayane 100, modo ativo) e "Teste-erro" (desligada)
-- existem só para o teste de ponta a ponta da Edge Function.

-- Paridade sombra × automação do RD (rodar por marca antes da virada):
-- para cada simulado/barrado, existe deal criado pela automação do RD (mesma campanha) para o
-- mesmo e-mail na mesma hora? Esperado: todo simulado tem deal; nenhum barrado tem.
-- select a.id, a.marca, a.resultado, a.lead_email, a.recebido_em, d.id_deal, d.payload->>'_created_at' as criado_rd
-- from distribuicao_atribuicao a
-- join distribuicao_regra r on r.id = a.regra_id
-- left join deal_snapshot d on lower(d.payload->>'_contact_email') = a.lead_email  -- ajustar à chave de e-mail do espelho
--   and (d.payload->>'_created_at')::timestamptz between a.recebido_em - interval '30 min' and a.recebido_em + interval '30 min'
-- where a.resultado in ('simulado','barrado') and a.marca = 'Eletrovias'
-- order by a.recebido_em desc;
