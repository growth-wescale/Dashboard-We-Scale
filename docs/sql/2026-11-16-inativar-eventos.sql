-- =============================================================================
-- 2026-11-16 — Inativar eventos de deal_eventos em vez de apagar
-- Spec: docs/superpowers/specs/2026-11-16-inativar-eventos-design.md
--
-- Um único bloco DO: se qualquer conferência falhar, nada é aplicado.
--
-- Mecanismo: a view de ativos se chama deal_eventos e mora no schema
-- eventos_ativos. Cada view que lia public.deal_eventos é recriada com a própria
-- definição (sem editar o texto) sob search_path = eventos_ativos, public; assim o
-- nome deal_eventos passa a apontar para os ativos e o resto continua em public.
-- =============================================================================

do $mig$
declare
  -- matview e tudo que depende dela (precisa DROP + CREATE; ordem = nível)
  v_arvore text[] := array[
    'mv_deal_ciclo_enriquecido',
    'vw_deal_ciclo_enriquecido',
    'vw_funil_vendas', 'vw_marketing_funil',
    'vw_alerta_pos_live', 'vw_closer_reunioes', 'vw_deal_timeline_eventos',
    'vw_deal_timeline_reunioes', 'vw_deal_timeline_tarefas'];
  -- demais views que leem deal_eventos (CREATE OR REPLACE, mesmo OID)
  v_outras text[] := array[
    'vw_deal_eventos_ciclo', 'vw_deal_eventos_limpo', 'vw_deal_eventos_marca_resolvida',
    'vw_deal_origem_comercial', 'vw_deal_posse', 'vw_diagnostico_origem', 'vw_funil_compat',
    'vw_meetrox_calls_analise', 'vw_prev_eventos', 'vw_restauracao_automacao_20260818'];
  -- quem lê public.deal_eventos direto hoje (conferido contra pg_depend)
  v_leitoras text[] := array[
    'mv_deal_ciclo_enriquecido', 'vw_alerta_pos_live', 'vw_deal_eventos_ciclo',
    'vw_deal_eventos_limpo', 'vw_deal_eventos_marca_resolvida', 'vw_deal_origem_comercial',
    'vw_deal_posse', 'vw_deal_timeline_eventos', 'vw_diagnostico_origem', 'vw_funil_compat',
    'vw_meetrox_calls_analise', 'vw_prev_eventos', 'vw_restauracao_automacao_20260818'];
  v_funcoes text[] := array[
    'processar_deal_evento', 'registrar_fechamento', 'registrar_anotacao_perda',
    'consolidar_eventos_mesma_etapa', 'deals_sem_contato', 'funil_flat_from_eventos',
    'relatorio_expansao_metricas'];
  r record;
  a record;
  v_def text;
  v_novo text;
  v_n int;
  v_esperado int;
begin
  perform set_config('lock_timeout', '15s', true);
  perform set_config('search_path', 'public', true);

  -- Segura a trava do dash_sincronizar: a rodada de cada minuto pula enquanto isto roda
  -- (matview não aceita LOCK TABLE; é ele quem faz o REFRESH dela).
  perform pg_advisory_xact_lock(hashtext('public.dash_sincronizar'));

  -- ---------------------------------------------------------------------------
  -- 0) Conferir que as listas batem com o banco de agora
  -- ---------------------------------------------------------------------------
  select count(*) into v_n from (
    select distinct c.relname::text nome
      from pg_depend d
      join pg_rewrite rw on rw.oid = d.objid and d.classid = 'pg_rewrite'::regclass
      join pg_class c on c.oid = rw.ev_class
     where d.refobjid = 'public.deal_eventos'::regclass
       and c.oid <> 'public.deal_eventos'::regclass) x
   where not (x.nome = any(v_leitoras));
  if v_n > 0 then raise exception 'Há view lendo deal_eventos fora da lista'; end if;

  select count(distinct c.relname) into v_n
    from pg_depend d
    join pg_rewrite rw on rw.oid = d.objid and d.classid = 'pg_rewrite'::regclass
    join pg_class c on c.oid = rw.ev_class
   where d.refobjid = 'public.deal_eventos'::regclass and c.relname::text = any(v_leitoras);
  if v_n <> cardinality(v_leitoras) then raise exception 'Lista de leitoras desatualizada (%)', v_n; end if;

  with recursive dep(oid) as (
    select 'public.mv_deal_ciclo_enriquecido'::regclass::oid
    union
    select rw.ev_class from dep
      join pg_depend d on d.refobjid = dep.oid and d.classid = 'pg_rewrite'::regclass
      join pg_rewrite rw on rw.oid = d.objid
     where rw.ev_class <> dep.oid)
  select count(*) into v_n from dep join pg_class c on c.oid = dep.oid
   where not (c.relname::text = any(v_arvore));
  if v_n > 0 then raise exception 'Há objeto novo dependendo da matview'; end if;

  -- ---------------------------------------------------------------------------
  -- 1) Guardar definições, permissões, comentários e índices
  -- ---------------------------------------------------------------------------
  create temp table _mig_obj on commit drop as
  select c.relname::text as nome, c.relkind::text as tipo,
         regexp_replace(pg_get_viewdef(c.oid), ';\s*$', '') as def,
         c.relacl, c.reloptions,
         obj_description(c.oid, 'pg_class') as comentario,
         array_position(v_arvore, c.relname::text) as ordem_arvore
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname::text = any(v_arvore || v_outras);
  if (select count(*) from _mig_obj) <> cardinality(v_arvore) + cardinality(v_outras) then
    raise exception 'Nem todas as views foram encontradas';
  end if;
  if exists (select 1 from _mig_obj where relacl is null) then
    raise exception 'View sem ACL explícita: revisar antes';
  end if;

  create temp table _mig_idx on commit drop as
  select indexdef from pg_indexes
   where schemaname = 'public' and tablename = 'mv_deal_ciclo_enriquecido';

  create temp table _mig_fn on commit drop as
  select p.proname::text as nome, pg_get_functiondef(p.oid) as def
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = any(v_funcoes);
  if (select count(*) from _mig_fn) <> cardinality(v_funcoes) then
    raise exception 'Função ausente ou sobrecarregada';
  end if;

  insert into public._backup_viewdefs (nome, criado_em, def)
  select nome || '_pre_inativar_20261116', now(), def from _mig_obj
  union all
  select 'fn_' || nome || '_pre_inativar_20261116', now(), def from _mig_fn;

  -- ---------------------------------------------------------------------------
  -- 2) Matview e dependentes: DROP (sem CASCADE); recriadas no passo 5
  -- ---------------------------------------------------------------------------
  for r in select * from _mig_obj where ordem_arvore is not null order by ordem_arvore desc loop
    if r.tipo = 'm' then
      execute format('drop materialized view public.%I', r.nome);
    else
      execute format('drop view public.%I', r.nome);
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 3) Coluna ativo + quem/quando/por quê
  -- ---------------------------------------------------------------------------
  alter table public.deal_eventos
    add column ativo boolean not null default true,
    add column inativado_em timestamptz,
    add column inativado_por text,
    add column inativado_motivo text;
  alter table public.deal_eventos
    add constraint ck_deal_eventos_inativacao
    check (ativo or (inativado_em is not null and nullif(btrim(inativado_motivo), '') is not null));
  comment on column public.deal_eventos.ativo is
    'false = evento inativado (não aconteceu de verdade). Some de todas as views (leem eventos_ativos.deal_eventos). Inativar/reativar só por inativar_eventos()/reativar_eventos().';

  -- Perda por dia: a regra passa a valer só entre perdas ativas.
  create unique index ux_deal_eventos_perda_por_dia_ativa on public.deal_eventos
    using btree (id_deal, (((data_evento at time zone 'America/Sao_Paulo'::text))::date))
    where tipo_evento = 'perda'::text and ativo;
  drop index public.ux_deal_eventos_perda_por_dia;
  alter index public.ux_deal_eventos_perda_por_dia_ativa rename to ux_deal_eventos_perda_por_dia;

  -- ---------------------------------------------------------------------------
  -- 4) View dos ativos
  -- ---------------------------------------------------------------------------
  create schema eventos_ativos;
  comment on schema eventos_ativos is
    'Só a view deal_eventos (eventos ativos). Toda leitura de eventos do banco passa por ela. Ver docs/sql/2026-11-16-inativar-eventos.sql';
  create view eventos_ativos.deal_eventos with (security_invoker = true) as
    select * from public.deal_eventos where ativo;
  comment on view eventos_ativos.deal_eventos is
    'public.deal_eventos sem os eventos inativados. Leitura nova de eventos deve usar esta view.';
  revoke all on eventos_ativos.deal_eventos from public, anon, authenticated, service_role;
  grant usage on schema eventos_ativos to anon, authenticated, service_role;
  grant select on eventos_ativos.deal_eventos to anon, authenticated, service_role;

  -- ---------------------------------------------------------------------------
  -- 5) Views leitoras apontam para os ativos (mesma definição)
  -- ---------------------------------------------------------------------------
  perform set_config('search_path', 'eventos_ativos, public', true);
  -- Demais views: CREATE OR REPLACE (mantém OID, permissões e comentários)
  for r in select * from _mig_obj where ordem_arvore is null loop
    execute format('create or replace view public.%I%s as %s', r.nome,
      case when r.reloptions is not null
           then format(' with (%s)', array_to_string(r.reloptions, ', ')) else '' end,
      r.def);
  end loop;
  -- Matview e dependentes: CREATE com a mesma definição
  for r in select * from _mig_obj where ordem_arvore is not null order by ordem_arvore loop
    if r.tipo = 'm' then
      execute format('create materialized view public.%I as %s', r.nome, r.def);
      for a in select indexdef from _mig_idx loop
        execute a.indexdef;
      end loop;
    else
      execute format('create view public.%I%s as %s', r.nome,
        case when r.reloptions is not null
             then format(' with (%s)', array_to_string(r.reloptions, ', ')) else '' end,
        r.def);
    end if;
  end loop;

  perform set_config('search_path', 'public', true);

  -- Permissões e comentários das recriadas, iguais aos de antes
  for r in select * from _mig_obj where ordem_arvore is not null loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', r.nome);
    for a in select x.grantee, x.privilege_type
               from aclexplode(r.relacl) x
              where x.grantee <> 'postgres'::regrole loop
      execute format('grant %s on public.%I to %s', a.privilege_type, r.nome,
        case when a.grantee = 0 then 'public' else a.grantee::regrole::text end);
    end loop;
    if r.comentario is not null then
      execute format('comment on %s public.%I is %L',
        case when r.tipo = 'm' then 'materialized view' else 'view' end, r.nome, r.comentario);
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 6) Conferências das views
  -- ---------------------------------------------------------------------------
  for r in select * from _mig_obj loop
    v_novo := regexp_replace(pg_get_viewdef(format('public.%I', r.nome)::regclass), ';\s*$', '');
    if replace(v_novo, 'eventos_ativos.deal_eventos', 'deal_eventos') <> r.def then
      raise exception 'Definição de % mudou além da origem dos eventos', r.nome;
    end if;
    if (r.nome = any(v_leitoras)) <> (position('eventos_ativos.deal_eventos' in v_novo) > 0) then
      raise exception 'Origem dos eventos errada em %', r.nome;
    end if;
    if (select array_agg(x::text order by x::text) from unnest(r.relacl) x)
       is distinct from
       (select array_agg(x::text order by x::text)
          from pg_class c, unnest(c.relacl) x
         where c.oid = format('public.%I', r.nome)::regclass) then
      raise exception 'Permissões diferentes em %', r.nome;
    end if;
    if r.comentario is distinct from obj_description(format('public.%I', r.nome)::regclass, 'pg_class') then
      raise exception 'Comentário diferente em %', r.nome;
    end if;
  end loop;

  -- nenhuma view fora de eventos_ativos lê mais a tabela direto
  select count(*) into v_n
    from pg_depend d
    join pg_rewrite rw on rw.oid = d.objid and d.classid = 'pg_rewrite'::regclass
    join pg_class c on c.oid = rw.ev_class
   where d.refobjid = 'public.deal_eventos'::regclass
     and c.oid <> 'public.deal_eventos'::regclass
     and c.relnamespace <> 'eventos_ativos'::regnamespace;
  if v_n <> 0 then raise exception 'Ainda há % view(s) lendo a tabela direto', v_n; end if;

  if (select count(*) from pg_class where relnamespace = 'eventos_ativos'::regnamespace) <> 1 then
    raise exception 'Objeto criado no schema errado';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'mv_deal_ciclo_enriquecido')
     <> (select count(*) from _mig_idx) then
    raise exception 'Índices da matview não foram recriados';
  end if;
  if (select count(*) from eventos_ativos.deal_eventos) <> (select count(*) from public.deal_eventos) then
    raise exception 'View de ativos não tem todos os eventos';
  end if;
  if (select count(*) from public.mv_deal_ciclo_enriquecido) = 0 then
    raise exception 'Matview vazia';
  end if;

  -- ---------------------------------------------------------------------------
  -- 7) Funções que gravam: nunca mexem em evento inativo
  -- ---------------------------------------------------------------------------
  -- processar_deal_evento: a substituição da perda do mesmo dia só toca a ativa
  select def into v_def from _mig_fn where nome = 'processar_deal_evento';
  v_n := cardinality(string_to_array(v_def, $q$WHERE id_deal = p_id_deal AND tipo_evento = 'perda'$q$)) - 1;
  if v_n <> 2 then raise exception 'processar_deal_evento: esperava 2 trechos, achou %', v_n; end if;
  execute replace(v_def,
    $q$WHERE id_deal = p_id_deal AND tipo_evento = 'perda'$q$,
    $q$WHERE id_deal = p_id_deal AND tipo_evento = 'perda' AND ativo$q$);

  -- registrar_fechamento: se o fechamento mais recente estiver inativo, não mexe em nada
  select def into v_def from _mig_fn where nome = 'registrar_fechamento';
  if cardinality(string_to_array(v_def, E'DECLARE\n')) - 1 <> 1
     or cardinality(string_to_array(v_def, 'SELECT id_evento, data_evento INTO v_id, v_data')) - 1 <> 1
     or cardinality(string_to_array(v_def, $q$  IF p_tipo = 'perda' THEN$q$)) - 1 <> 1 then
    raise exception 'registrar_fechamento: texto diferente do esperado';
  end if;
  v_def := replace(v_def, E'DECLARE\n', E'DECLARE\n  v_ativo boolean;\n');
  v_def := replace(v_def, 'SELECT id_evento, data_evento INTO v_id, v_data',
                          'SELECT id_evento, data_evento, ativo INTO v_id, v_data, v_ativo');
  v_def := replace(v_def, $q$  IF p_tipo = 'perda' THEN$q$,
    E'  -- evento inativado: não regrava motivo, anotação nem data\n'
    || E'  IF NOT v_ativo THEN\n    RETURN QUERY SELECT false, false; RETURN;\n  END IF;\n\n'
    || $q$  IF p_tipo = 'perda' THEN$q$);
  execute v_def;

  -- registrar_anotacao_perda: idem (só grava se a perda mais recente estiver ativa)
  select def into v_def from _mig_fn where nome = 'registrar_anotacao_perda';
  if cardinality(string_to_array(v_def, E'LIMIT 1\n   );')) - 1 <> 1 then
    raise exception 'registrar_anotacao_perda: texto diferente do esperado';
  end if;
  execute replace(v_def, E'LIMIT 1\n   );', E'LIMIT 1\n   ) AND ativo;');

  -- consolidar_eventos_mesma_etapa (sem agendamento): só considera e só apaga ativos
  select def into v_def from _mig_fn where nome = 'consolidar_eventos_mesma_etapa';
  if cardinality(string_to_array(v_def, $q$WHERE tipo_evento = 'mudanca_etapa'$q$)) - 1 <> 1 then
    raise exception 'consolidar_eventos_mesma_etapa: texto diferente do esperado';
  end if;
  execute replace(v_def, $q$WHERE tipo_evento = 'mudanca_etapa'$q$,
                         $q$WHERE tipo_evento = 'mudanca_etapa' AND ativo$q$);

  -- ---------------------------------------------------------------------------
  -- 8) Funções que só leem: passam a ler os ativos
  -- ---------------------------------------------------------------------------
  for r in select * from _mig_fn
            where nome in ('deals_sem_contato', 'funil_flat_from_eventos', 'relatorio_expansao_metricas') loop
    v_esperado := case r.nome when 'relatorio_expansao_metricas' then 3 else 1 end;
    select count(*) into v_n from regexp_matches(r.def, '(FROM\s+)(public\.)?deal_eventos(\s)', 'g');
    if v_n <> v_esperado then
      raise exception '%: esperava % leitura(s), achou %', r.nome, v_esperado, v_n;
    end if;
    v_def := regexp_replace(r.def, '(FROM\s+)(public\.)?deal_eventos(\s)', '\1eventos_ativos.deal_eventos\3', 'g');
    if v_def ~* '(from|join)\s+(public\.)?deal_eventos\M' then
      raise exception '%: sobrou leitura da tabela', r.nome;
    end if;
    execute v_def;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 9) Inativar / reativar
  -- ---------------------------------------------------------------------------
  create function public.inativar_eventos(p_ids bigint[], p_motivo text, p_por text default 'manual')
  returns table (id_evento bigint, id_deal text, tipo_evento text, data_evento timestamptz, resultado text)
  language plpgsql security definer
  set search_path = public, pg_temp
  as $fn$
  #variable_conflict use_column
  declare
    v_deal text;
  begin
    if p_motivo is null or btrim(p_motivo) = '' then
      raise exception 'Informe o motivo da inativação';
    end if;
    -- mesma trava por deal da sincronização (processar_deal_evento / registrar_stage_history)
    for v_deal in
      select distinct e.id_deal from public.deal_eventos e where e.id_evento = any(p_ids) order by 1
    loop
      perform pg_advisory_xact_lock(hashtextextended('deal:' || v_deal, 42));
    end loop;

    return query
      with feito as (
        update public.deal_eventos e
           set ativo = false,
               inativado_em = now(),
               inativado_por = coalesce(nullif(btrim(p_por), ''), 'manual'),
               inativado_motivo = btrim(p_motivo)
         where e.id_evento = any(p_ids) and e.ativo
        returning e.id_evento, e.id_deal, e.tipo_evento, e.data_evento)
      select f.id_evento, f.id_deal, f.tipo_evento, f.data_evento, 'inativado'::text from feito f
      union all
      select x.id, e.id_deal, e.tipo_evento, e.data_evento,
             case when e.id_evento is null then 'não existe' else 'já estava inativo' end
        from unnest(p_ids) as x(id)
        left join public.deal_eventos e on e.id_evento = x.id
       where e.id_evento is null or not e.ativo;
  end
  $fn$;
  comment on function public.inativar_eventos(bigint[], text, text) is
    'Tira eventos de todas as contas sem apagar. Motivo obrigatório. Desfaz com reativar_eventos().';

  create function public.reativar_eventos(p_ids bigint[], p_por text default 'manual')
  returns table (id_evento bigint, id_deal text, tipo_evento text, data_evento timestamptz, resultado text)
  language plpgsql security definer
  set search_path = public, pg_temp
  as $fn$
  #variable_conflict use_column
  declare
    v_deal text;
  begin
    for v_deal in
      select distinct e.id_deal from public.deal_eventos e where e.id_evento = any(p_ids) order by 1
    loop
      perform pg_advisory_xact_lock(hashtextextended('deal:' || v_deal, 42));
    end loop;

    return query
      with feito as (
        update public.deal_eventos e
           set ativo = true, inativado_em = null, inativado_por = null, inativado_motivo = null
         where e.id_evento = any(p_ids) and not e.ativo
        returning e.id_evento, e.id_deal, e.tipo_evento, e.data_evento)
      select f.id_evento, f.id_deal, f.tipo_evento, f.data_evento, 'reativado'::text from feito f
      union all
      select x.id, e.id_deal, e.tipo_evento, e.data_evento,
             case when e.id_evento is null then 'não existe' else 'já estava ativo' end
        from unnest(p_ids) as x(id)
        left join public.deal_eventos e on e.id_evento = x.id
       where e.id_evento is null or e.ativo;
  end
  $fn$;
  comment on function public.reativar_eventos(bigint[], text) is
    'Volta eventos inativados para as contas. Perda reativada pode bater com outra perda ativa do mesmo dia (erro, nada muda).';

  revoke all on function public.inativar_eventos(bigint[], text, text) from public, anon, authenticated;
  revoke all on function public.reativar_eventos(bigint[], text) from public, anon, authenticated;
  grant execute on function public.inativar_eventos(bigint[], text, text) to service_role;
  grant execute on function public.reativar_eventos(bigint[], text) to service_role;
end
$mig$;
