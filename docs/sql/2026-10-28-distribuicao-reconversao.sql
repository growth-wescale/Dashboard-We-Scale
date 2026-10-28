-- 2026-10-28 — Distribuição de leads: lead que já tem deal aberto (reconversão)
-- Pedido do Junior depois da queixa dos SDRs de deals duplicados (ver CLAUDE.md, entrada de 28/10).
--
-- Regra: conversão de lead que já tem deal ABERTO (qualquer marca, qualquer funil), achado por
-- e-mail ou telefone, continua criando deal novo, mas
--   1. com o SDR que atendeu esse lead antes (SDR do deal aberto mais recente que tenha SDR
--      elegível: ativo, com user_id, cargo SDR ou SDR/Closer, fora da lista de disponibilidade);
--      sem SDR elegível → rodízio normal;
--   2. o deal_pronto leva `reconversao` (deals abertos + como cada um foi achado), e a Edge Function
--      escreve a anotação no deal novo;
--   3. a Edge Function liga o deal ao contato que já existe no RD (por e-mail), em vez de criar outro.
-- O lead entra na contagem do rodízio do SDR (o contador conta toda linha 'atribuido' da marca);
-- se o SDR não é do time da marca, não mexe na cota dos outros (distribuicao_escolher só olha o time).
-- Barreira e bloqueio de 10 min continuam valendo antes disso.

-- 1. Chave de telefone: só dígitos, sem o 55 do país, DDD + últimos 8 dígitos (ignora o 9 extra).
create or replace function public.distribuicao_tel_chave(p text)
returns text language sql immutable parallel safe as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x),
       e as (select case when length(x) >= 12 and left(x, 2) = '55' then substr(x, 3) else x end as x from d)
  select case when length(x) in (10, 11) then left(x, 2) || right(x, 8) end from e
$$;

create index if not exists ix_deal_contatos_email_lower on public.deal_contatos (lower(btrim(email)));
create index if not exists ix_deal_contatos_tel_chave on public.deal_contatos (public.distribuicao_tel_chave(telefone));

-- 2. Colunas novas no registro
alter table public.distribuicao_atribuicao add column if not exists reconversao jsonb;
alter table public.distribuicao_atribuicao add column if not exists contato_rd text;
alter table public.distribuicao_atribuicao add column if not exists contato_reaproveitado boolean;

-- 3. Deals abertos do lead, do mais novo pro mais velho
create or replace function public.distribuicao_deals_abertos(p_email text, p_telefone text)
returns jsonb language sql stable security definer set search_path = public as $$
  with alvo as (
    select nullif(lower(btrim(p_email)), '') as email, public.distribuicao_tel_chave(p_telefone) as tel
  ), achados as (
    select c.id_deal, true as por_email, false as por_tel
    from alvo a join public.deal_contatos c on lower(btrim(c.email)) = a.email
    union all
    select c.id_deal, false, true
    from alvo a join public.deal_contatos c on public.distribuicao_tel_chave(c.telefone) = a.tel
    union all
    -- deal que a própria distribuição criou há pouco e o espelho ainda não trouxe
    select x.id_deal, true, false
    from alvo a join public.distribuicao_atribuicao x on x.lead_email = a.email
    where x.id_deal is not null and x.resultado in ('atribuido', 'fallback')
      and not exists (select 1 from public.deal_snapshot s where s.id_deal = x.id_deal)
  ), base as (
    select id_deal, bool_or(por_email) as por_email, bool_or(por_tel) as por_tel from achados group by id_deal
  ), det as (
    select b.id_deal, b.por_email, b.por_tel,
      coalesce(nullif(s.payload->>'_nome_negociacao', ''), at.deal_pronto->>'name') as nome,
      coalesce(s.marca, at.deal_pronto->>'marca_rd') as marca,
      coalesce(s.nome_funil, fe.pipeline_nome) as funil,
      coalesce(s.nome_etapa, fe.stage_nome) as etapa,
      coalesce(s.responsavel, at.nome_sdr) as responsavel,
      coalesce((s.payload->>'_created_at')::timestamptz, at.recebido_em) as criado,
      coalesce(mv.nome_sdr, at.nome_sdr,
               case when ncf.cargo in ('SDR', 'SDR/Closer') then s.responsavel end) as nome_sdr
    from base b
    left join public.deal_snapshot s on s.id_deal = b.id_deal
    left join lateral (select * from public.distribuicao_atribuicao x where x.id_deal = b.id_deal order by x.id desc limit 1) at on true
    left join public.rd_funis_etapas fe on fe.stage_id = at.deal_pronto->>'deal_stage_id'
    left join lateral (select m.nome_sdr from public.mv_deal_ciclo_enriquecido m where m.id_lead = b.id_deal and m.eh_ciclo_atual limit 1) mv on true
    left join public.nome_cargo_foto ncf on ncf.nome = s.responsavel
    where (s.id_deal is null and at.id_deal is not null)
       or (s.status in ('open', 'ongoing') and s.deleted_at is null)
  )
  select coalesce(jsonb_agg(to_jsonb(det) order by criado desc nulls last), '[]'::jsonb) from det
$$;

-- 4. distribuicao_processar com a reconversão (base: versão em produção em 28/10)
create or replace function public.distribuicao_processar(p_payload jsonb, p_recebido_em timestamp with time zone default now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_evento     text  := p_payload->>'event_identifier';
  v_contact    jsonb := coalesce(p_payload->'contact', '{}'::jsonb);
  v_email      text  := nullif(lower(btrim(v_contact->>'email')), '');
  v_telefone   text  := coalesce(nullif(v_contact->>'mobile_phone', ''), nullif(v_contact->>'personal_phone', ''));
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
  v_chave      text;
  v_novas      int;
  v_abertos    jsonb;
  v_reconv     jsonb;
  v_rec_nome   text;
  v_rec_user   text;
  v_rec_deal   text;
  v_rec_inel   text[] := '{}';
  v_ab         jsonb;
  v_cad        record;
begin
  if v_evento is null then
    return jsonb_build_object('resultado', 'ignorado', 'motivo', 'sem event_identifier');
  end if;
  -- Mesma conversão chegando de novo (caminho reserva, reenvio): lead + evento + horário da conversão.
  if nullif(v_contact->>'uuid', '') is not null and nullif(v_contact->'last_conversion'->>'created_at', '') is not null then
    v_chave := (v_contact->>'uuid') || '|' || v_evento || '|' || (v_contact->'last_conversion'->>'created_at');
    insert into public.distribuicao_conversao_vista (chave) values (v_chave) on conflict do nothing;
    get diagnostics v_novas = row_count;
    if v_novas = 0 then
      return jsonb_build_object('resultado', 'ignorado', 'motivo', 'conversão já recebida', 'chave', v_chave);
    end if;
  end if;

  select * into v_regra from public.distribuicao_regra where evento_identificador = v_evento and vigente_ate is null limit 1;
  if not found then
    insert into public.distribuicao_evento_ignorado as e (identificador, cf_marca_ultima)
    values (left(v_evento, 200), left(v_contact->>'cf_marca', 100))
    on conflict (identificador) do update set ultima_vez = now(), ocorrencias = e.ocorrencias + 1,
      cf_marca_ultima = coalesce(excluded.cf_marca_ultima, e.cf_marca_ultima);
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

  -- Reconversão: deals abertos do lead (e-mail ou telefone) e o SDR que já atendeu
  v_abertos := public.distribuicao_deals_abertos(v_email, v_telefone);
  if jsonb_array_length(v_abertos) > 0 then
    for v_ab in select e from jsonb_array_elements(v_abertos) e loop
      continue when nullif(v_ab->>'nome_sdr', '') is null;
      select n.user_id, n.ativo, n.cargo into v_cad from public.nome_cargo_foto n where n.nome = v_ab->>'nome_sdr' limit 1;
      if not found then
        v_rec_inel := v_rec_inel || ((v_ab->>'nome_sdr') || ' sem cadastro');
      elsif v_cad.user_id is null then
        v_rec_inel := v_rec_inel || ((v_ab->>'nome_sdr') || ' sem user_id do RD');
      elsif coalesce(v_cad.ativo, false) = false then
        v_rec_inel := v_rec_inel || ((v_ab->>'nome_sdr') || ' inativo');
      elsif coalesce(v_cad.cargo, '') not in ('SDR', 'SDR/Closer') then
        v_rec_inel := v_rec_inel || ((v_ab->>'nome_sdr') || ' não é SDR');
      elsif exists (
        select 1 from public.distribuicao_disponibilidade d
        where d.nome_sdr = v_ab->>'nome_sdr' and d.encerrado_em is null and d.inicio <= p_recebido_em and (d.fim is null or d.fim > p_recebido_em)
      ) then
        v_rec_inel := v_rec_inel || ((v_ab->>'nome_sdr') || ' fora (disponibilidade)');
      else
        v_rec_nome := v_ab->>'nome_sdr';
        v_rec_user := v_cad.user_id;
        v_rec_deal := v_ab->>'id_deal';
        exit;
      end if;
    end loop;
    v_reconv := jsonb_build_object(
      'deals', v_abertos,
      'sdr', v_rec_nome,
      'deal_do_sdr', v_rec_deal,
      'sdr_inelegiveis', to_jsonb(v_rec_inel));
  end if;

  v_time := public.distribuicao_time_da_marca(v_regra.marca, p_recebido_em);
  v_sdrs := coalesce(v_time->'sdrs', '[]'::jsonb);
  if v_rec_nome is not null then
    v_nome := v_rec_nome;
    v_user := v_rec_user;
    v_resultado := case when v_regra.modo = 'sombra' then 'simulado' else 'atribuido' end;
    v_motivo := 'lead com deal aberto: mesmo SDR do deal ' || v_rec_deal;
    -- contagem do time só pra registro ("Contagem na hora"); não decide nada aqui
    v_contar := case when v_regra.modo = 'sombra' then array['simulado'] else array['atribuido', 'erro'] end;
    select coalesce(jsonb_object_agg(nome_sdr, n), '{}'::jsonb) into v_cont
    from (
      select nome_sdr, count(*) as n
      from public.distribuicao_atribuicao
      where marca = v_regra.marca and resultado = any(v_contar) and nome_sdr is not null
        and recebido_em >= (v_time->>'reinicio_em')::timestamptz and recebido_em < p_recebido_em
      group by nome_sdr
    ) x;
    select coalesce(jsonb_object_agg(s->>'nome', jsonb_build_array(coalesce((v_cont->>(s->>'nome'))::int, 0), (s->>'peso')::numeric)), '{}'::jsonb) into v_cont_out
    from jsonb_array_elements(v_sdrs) s;
  elsif jsonb_array_length(v_sdrs) = 0 then
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
    if v_reconv is not null then
      v_motivo := v_motivo || ' (lead com deal aberto, ' ||
        case when cardinality(v_rec_inel) > 0 then array_to_string(v_rec_inel, ', ') else 'deal anterior sem SDR' end || ')';
    end if;
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
    'contato', jsonb_build_object('nome', v_nome_lead, 'email', v_email, 'telefone', v_telefone),
    'utm', jsonb_build_object(
      'source',   coalesce(v_contact->>'utm_source',   v_contact->>'cf_utm_source'),
      'medium',   coalesce(v_contact->>'utm_medium',   v_contact->>'cf_utm_medium'),
      'campaign', coalesce(v_contact->>'utm_campaign', v_contact->>'cf_utm_campaign'),
      'term',     coalesce(v_contact->>'utm_term',     v_contact->>'cf_utm_term'),
      'content',  coalesce(v_contact->>'utm_content',  v_contact->>'cf_utm_content')),
    'cidade', v_contact->>'city',
    'estado', coalesce(v_contact->>'state', v_contact->>'cf_estado'),
    'capital', v_valor_txt,
    'conversao_cof', v_regra.conversao_cof,
    'nota', case when v_regra.nota_deal is null then null else
       replace(replace(replace(v_regra.nota_deal, '{nome}', coalesce(v_nome_lead, '')), '{email}', coalesce(v_email, '')), '{sdr}', coalesce(v_nome, 'responsável padrão')) end,
    'tarefa', v_regra.tarefa,
    'reconversao', v_reconv,
    'campos_extra', (
      select coalesce(jsonb_object_agg(ce.value, v_contact->ce.key), '{}'::jsonb)
      from jsonb_each_text(coalesce(v_regra.campos_extra, '{}'::jsonb)) ce
      where v_contact ? ce.key
    )
  );

  insert into public.distribuicao_atribuicao
    (recebido_em, marca, evento_identificador, regra_id, lead_email, lead_uuid, lead_nome, payload, resultado, motivo,
     barreira_valor_lido, fonte_time, meta_versao_id, reinicio_em, nome_sdr, user_id, contadores, inelegiveis, deal_pronto, reconversao)
  values
    (p_recebido_em, v_regra.marca, v_evento, v_regra.id, v_email, v_contact->>'uuid', v_contact->>'name', p_payload, v_resultado, v_motivo,
     v_valor_txt, v_time->>'fonte', (v_time->>'meta_versao_id')::bigint, (v_time->>'reinicio_em')::timestamptz, v_nome, v_user, v_cont_out, v_time->'inelegiveis', v_deal, v_reconv)
  returning id into v_id;

  return jsonb_build_object(
    'atribuicao_id', v_id, 'resultado', v_resultado, 'motivo', v_motivo,
    'marca', v_regra.marca, 'regra_id', v_regra.id, 'modo', v_regra.modo,
    'nome_sdr', v_nome, 'user_id', v_user, 'fallback', v_fallback, 'deal', v_deal
  );
end $function$;

-- 5. A view do log expõe a reconversão e o contato (a tela mostra "mesmo SDR" e "contato reaproveitado")
create or replace view public.vw_distribuicao_atribuicoes as
 select id, recebido_em, marca, evento_identificador, regra_id, lead_email, lead_uuid, lead_nome, resultado, motivo,
    barreira_valor_lido, fonte_time, meta_versao_id, reinicio_em, nome_sdr, user_id, contadores, inelegiveis, id_deal,
    tentativas, erro_rd, reprocessado_em, reprocessado_por, cof_enviada_em, cof_erro, extras_erro,
    (reconversao is not null) as reconversao,
    reconversao->>'sdr' as reconversao_sdr,
    contato_reaproveitado
   from public.distribuicao_atribuicao;

-- 6. Configuração legível pela tela (seção "Como a distribuição funciona" mostra os valores reais)
create or replace view public.vw_distribuicao_config as
  select chave, valor, descricao from public.distribuicao_config;
grant select on public.vw_distribuicao_config to anon, authenticated;
