-- Histórico da configuração das cadências (Supabase de Expansão, 27/10/2026)
--
-- Até aqui só a troca de template por marca ficava registrada (cadencia.templates_historico).
-- Criar, mudar ou apagar cadência, passo, etapa, condição, template, freio do disparador,
-- carteira do RD Conversas, feriado ou acesso não deixava rastro.
--
-- Agora todo INSERT/UPDATE/DELETE nessas tabelas grava uma linha em cadencia.config_historico
-- com o antes, o depois, os campos que mudaram, quem fez e por onde:
--   - pelo app de cadências (sessão do Supabase de Expansão): autor_id + autor_email;
--   - pelo n8n / Edge Function (service_role) ou direto no banco: autor_papel + origem.
-- Mudança feita direto no banco pode se identificar na mesma transação:
--   select set_config('cadencia.autor', 'Junior (via Claude Code)', true),
--          set_config('cadencia.motivo', 'por que mudou', true);
--
-- O histórico é só de acréscimo: UPDATE e DELETE nele são recusados.
-- Na criação, cada linha existente ganhou um registro ESTADO_INICIAL (a foto de 27/10).

create table if not exists cadencia.config_historico (
  id               bigint generated always as identity primary key,
  alterado_em      timestamptz not null default now(),
  tabela           text not null,
  operacao         text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE', 'ESTADO_INICIAL')),
  registro_id      text,
  cadencia_id      bigint,
  marca            text,
  campos_alterados text[],
  antes            jsonb,
  depois           jsonb,
  autor_id         uuid,
  autor_email      text,
  autor_papel      text,
  origem           text,
  motivo           text,
  transacao        bigint not null default txid_current()
);

create index if not exists config_historico_tabela_idx   on cadencia.config_historico (tabela, alterado_em desc);
create index if not exists config_historico_cadencia_idx on cadencia.config_historico (cadencia_id, alterado_em desc) where cadencia_id is not null;

comment on table cadencia.config_historico is
  'Histórico (só acréscimo) de toda mudança na configuração das cadências. Gravado por trigger; ver docs/sql/2026-10-27-cadencia-historico-config.sql.';

-- Identificação de uma linha qualquer das tabelas auditadas
create or replace function cadencia.historico_registro_id(p_tabela text, p_linha jsonb)
returns text language sql immutable set search_path = '' as $$
  select case p_tabela
    when 'cadencia.acesso_papel_permissoes' then (p_linha->>'papel_id') || ':' || (p_linha->>'permissao')
    when 'cadencia.sdr_carteiras'           then p_linha->>'rd_user_id'
    when 'cadencia.acesso_usuarios'         then p_linha->>'user_id'
    when 'cadencia.feriados'                then p_linha->>'data'
    else p_linha->>'id'
  end
$$;

create or replace function cadencia.registrar_historico_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabela  text := tg_table_schema || '.' || tg_table_name;
  v_antes   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois  jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_linha   jsonb := coalesce(v_depois, v_antes);
  v_campos  text[];
  v_jwt     jsonb;
  v_ua      text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
      from jsonb_object_keys(v_depois) k
     where k not in ('atualizado_em')
       and (v_antes->k) is distinct from (v_depois->k);
    if v_campos is null then
      return new;  -- só o carimbo de atualização mudou
    end if;
  end if;

  begin
    v_jwt := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then v_jwt := null;
  end;
  begin
    v_ua := nullif(current_setting('request.headers', true), '')::jsonb->>'user-agent';
  exception when others then v_ua := null;
  end;

  insert into cadencia.config_historico
    (tabela, operacao, registro_id, cadencia_id, marca, campos_alterados, antes, depois,
     autor_id, autor_email, autor_papel, origem, motivo)
  values
    (v_tabela, tg_op, cadencia.historico_registro_id(v_tabela, v_linha),
     case when v_tabela = 'public.cadencias' then (v_linha->>'id')::bigint
          else (v_linha->>'cadencia_id')::bigint end,
     v_linha->>'marca',
     v_campos, v_antes, v_depois,
     nullif(v_jwt->>'sub', '')::uuid,
     coalesce(nullif(current_setting('cadencia.autor', true), ''), v_jwt->>'email'),
     coalesce(v_jwt->>'role', session_user::text),
     concat_ws(' | ', nullif(current_setting('application_name', true), ''), left(v_ua, 120)),
     nullif(current_setting('cadencia.motivo', true), ''));

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- Histórico não se edita nem se apaga
create or replace function cadencia.config_historico_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'cadencia.config_historico é só de acréscimo (% recusado)', tg_op;
end
$$;

drop trigger if exists config_historico_imutavel on cadencia.config_historico;
create trigger config_historico_imutavel
  before update or delete on cadencia.config_historico
  for each row execute function cadencia.config_historico_imutavel();

-- Triggers nas tabelas de configuração
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.cadencias', 'public.cadencia_passos', 'public.cadencia_etapas', 'public.cadencia_condicoes',
    'cadencia.templates', 'cadencia.disparo_controle', 'cadencia.motor_config', 'cadencia.sdr_carteiras',
    'cadencia.feriados', 'cadencia.acesso_usuarios', 'cadencia.acesso_papeis', 'cadencia.acesso_papel_permissoes'
  ] loop
    execute format('drop trigger if exists zz_historico_config on %s', t);
    execute format('create trigger zz_historico_config after insert or update or delete on %s
                    for each row execute function cadencia.registrar_historico_config()', t);
  end loop;
end
$$;

-- Foto do estado atual (uma linha por registro existente)
do $$
declare
  t text;
begin
  if exists (select 1 from cadencia.config_historico where operacao = 'ESTADO_INICIAL') then
    return;
  end if;
  foreach t in array array[
    'public.cadencias', 'public.cadencia_passos', 'public.cadencia_etapas', 'public.cadencia_condicoes',
    'cadencia.templates', 'cadencia.disparo_controle', 'cadencia.motor_config', 'cadencia.sdr_carteiras',
    'cadencia.feriados', 'cadencia.acesso_usuarios', 'cadencia.acesso_papeis', 'cadencia.acesso_papel_permissoes'
  ] loop
    execute format($f$
      insert into cadencia.config_historico
        (tabela, operacao, registro_id, cadencia_id, marca, depois, autor_papel, origem, motivo)
      select %1$L, 'ESTADO_INICIAL', cadencia.historico_registro_id(%1$L, j),
             case when %1$L = 'public.cadencias' then (j->>'id')::bigint else (j->>'cadencia_id')::bigint end,
             j->>'marca', j, 'sistema', 'criação do histórico',
             'Estado no momento em que o histórico foi criado (27/10/2026)'
        from (select to_jsonb(x) j from %2$s x) s
    $f$, t, t);
  end loop;
end
$$;

-- Leitura: só pelo app (RLS); escrita só pelo trigger
alter table cadencia.config_historico enable row level security;
revoke all on cadencia.config_historico from anon, authenticated;
grant select on cadencia.config_historico to authenticated;

drop policy if exists leitura_config_historico on cadencia.config_historico;
create policy leitura_config_historico on cadencia.config_historico
  for select to authenticated
  using (
    (select cadencia.tem_acesso_total())
    or cadencia_id = any ((select cadencia.cadencias_visiveis())::bigint[])
    or (marca is not null and cadencia.pode_ver_marca(marca))
  );

-- Visão legível: no UPDATE mostra só o que mudou
create or replace view cadencia.v_config_historico with (security_invoker = true) as
select h.id,
       (h.alterado_em at time zone 'America/Sao_Paulo') as alterado_em_brasilia,
       h.tabela,
       h.operacao,
       h.registro_id,
       h.cadencia_id,
       c.nome as cadencia_nome,
       h.marca,
       coalesce(h.autor_email, h.autor_papel) as quem,
       h.origem,
       h.motivo,
       h.campos_alterados,
       case when h.operacao = 'UPDATE'
            then (select jsonb_object_agg(k, h.antes->k) from unnest(h.campos_alterados) k)
            else h.antes end as antes,
       case when h.operacao = 'UPDATE'
            then (select jsonb_object_agg(k, h.depois->k) from unnest(h.campos_alterados) k)
            else h.depois end as depois
  from cadencia.config_historico h
  left join public.cadencias c on c.id = h.cadencia_id;

revoke all on cadencia.v_config_historico from anon;
grant select on cadencia.v_config_historico to authenticated;
