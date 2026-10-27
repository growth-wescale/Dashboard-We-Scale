-- Distribuição de leads: time próprio da regra vale mesmo com meta publicada (27/10/2026)
--
-- Pedido do Brunno: leads novos da Lisô Laser só para a Bruna (Closer). A distribuição pegava o
-- time da meta do mês (Lisô = Xayane 100%) e só usava o time_proprio da regra em marca sem meta.
-- Publicar uma versão nova das metas resolveria, mas zera o contador de TODAS as marcas e muda a
-- meta da Xayane. Em vez disso a ordem passa a ser:
--   1. time_proprio da regra vigente, quando preenchido (vale com ou sem meta);
--   2. versão ativa das metas do mês;
--   3. última versão ativa da marca;
--   4. nenhum (responsável padrão).
-- Nenhuma marca com meta tinha time_proprio em 27/10 (conferido), então só a Lisô muda.
-- Para voltar a Lisô para a meta: publicar a regra com o time próprio vazio.

insert into public._backup_viewdefs (nome, criado_em, def)
select 'fn_distribuicao_time_da_marca_pre_time_proprio_prioritario_20261027', now(),
       pg_get_functiondef('public.distribuicao_time_da_marca'::regproc);

create or replace function public.distribuicao_time_da_marca(p_marca text, p_em timestamp with time zone default now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mes_ini    timestamptz := date_trunc('month', p_em at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_mes        date := (date_trunc('month', p_em at time zone 'America/Sao_Paulo'))::date;
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
  select * into v_regra from public.distribuicao_regra where marca = p_marca and vigente_ate is null;

  if v_regra.time_proprio is not null and jsonb_typeof(v_regra.time_proprio) = 'array' and jsonb_array_length(v_regra.time_proprio) > 0 then
    -- 27/10/2026: time fixado na regra vence a meta
    v_fonte := 'time_proprio';
    v_time := v_regra.time_proprio;
    v_versao_id := null;
    v_reinicio := greatest(v_regra.vigente_de, v_mes_ini);
  else
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

    if v_fonte is null then
      return jsonb_build_object('fonte', 'nenhum', 'meta_versao_id', null, 'reinicio_em', v_mes_ini,
                                'sdrs', '[]'::jsonb, 'inelegiveis', '[]'::jsonb);
    end if;

    select jsonb_agg(jsonb_build_object('nome', mp.nome, 'peso', mp.peso) order by mp.nome) into v_time
    from public.meta_pessoa mp
    join public.meta_marca mm on mm.id = mp.meta_marca_id
    where mm.meta_versao_id = v_versao_id and mm.marca = p_marca and mp.funcao = 'SDR' and mp.peso > 0;
    v_reinicio := greatest(coalesce(v_ativada, '-infinity'::timestamptz), v_mes_ini);
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
    select unnest(case when d.tipo = 'fora_agora'
                       then array[d.criado_em, d.encerrado_em]
                       else array[case when d.inicio <= p_em then d.inicio end,
                                  case when d.fim <= p_em then d.fim end,
                                  case when d.encerrado_em is not null and d.encerrado_em >= d.inicio then d.encerrado_em end]
                  end) as x
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
end $function$;

-- Lisô Laser v5: igual à v4, com time próprio = Bruna 100%
-- (JÁ APLICADO em 27/10/2026 → regra id 60. Rodar de novo publicaria uma v6.)
select public.distribuicao_publicar_regra(
  (select to_jsonb(r) - 'id' - 'versao' - 'vigente_de' - 'vigente_ate' - 'criado_por' - 'criado_em'
          || jsonb_build_object(
               'time_proprio', jsonb_build_array(jsonb_build_object('nome', 'Bruna', 'peso', 100)),
               'barreira_valores_barrados', to_jsonb(r.barreira_valores_barrados),
               'motivo', 'Pedido do Brunno (27/10/2026): leads novos da Lisô Laser só para a Bruna, mesmo ela sendo Closer. Cadência da Lisô sem WhatsApp automático.')
     from public.distribuicao_regra r where r.marca = 'Lisô Laser' and r.vigente_ate is null),
  'Junior (via Claude Code)');
