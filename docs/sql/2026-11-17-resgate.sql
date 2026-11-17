-- 2026-11-17 — Resgate: negócio perdido e reaberto num dia diferente do dia da perda.
--
-- Regra (decisão do Junior, 17/11): linha de vw_funil_vendas com ciclo > 1 e dia
-- (Brasília) do início do ciclo (data_criacao_negociacao) posterior ao dia da perda
-- que fechou o ciclo anterior. Reabertura no mesmo dia da perda não é resgate (o banco
-- abre ciclo novo quando o negócio é perdido de novo em outro dia). Ciclo > 1 sem
-- perda anterior ou sem início do ciclo conta como resgate. Fonte Macro "Resgate" de
-- ciclo 1 NÃO é resgate. Usada pelos pop-ups de deal e pelos 2 pts da Corrida.
--
-- data_perda_anterior = data_perdido do ciclo anterior, lida da fonte
-- (vw_deal_ciclo_enriquecido, índice único id_lead+ciclo), não de vw_funil_vendas,
-- que filtra linhas. Colunas no FIM da view e em dash_colunas('vendas'), na mesma
-- transação do dash_sincronizar(true).

begin;

insert into public._backup_viewdefs (nome, criado_em, def)
values ('vw_funil_vendas_pre_resgate_20261117', now(), pg_get_viewdef('public.vw_funil_vendas'::regclass, true));

create or replace view public.vw_funil_vendas as
 SELECT d.id_lead,
    d.ciclo,
    d.eh_reciclagem,
    d.eh_ciclo_atual,
    COALESCE(NULLIF(s.marca, ''::text), NULLIF(d.marca, ''::text),
        CASE
            WHEN s.id_funil = '68b84341646c55001ed64e4f'::text THEN 'Odonto Legacy'::text
            ELSE NULL::text
        END) AS marca,
    d.nome_funil,
    d.etapa_funil,
    d.status_atual,
    d.nome_sdr,
    d.nome_closer,
    d.fonte_macro,
    d.sub_fonte,
    d.utm_source,
    d.utm_medium,
    d.utm_campaign,
    d.valor_contrato,
    d.quantidade_unidades,
    d.motivo_perda,
    d.data_criacao_negociacao,
    d.data_criacao_original,
    d.data_novo_mql,
    d.data_tentando_contato,
    d.data_contato_efetivo,
    d.data_interesse_reuniao,
    d.data_conexao,
    d.data_agendamento_reuniao_sql,
    d.data_reuniao_realizada,
    d.data_no_show,
    d.data_sal,
    d.data_oportunidade,
    d.data_comite,
    d.data_pre_contrato,
        CASE
            WHEN d.data_venda IS NULL AND d.status_atual = 'Ganho'::text AND d.eh_ciclo_atual AND NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone > d.data_criacao_negociacao THEN NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone
            ELSE d.data_venda
        END AS data_venda,
        CASE
            WHEN d.data_perdido IS NULL AND d.status_atual = 'Perdido'::text AND d.eh_ciclo_atual AND NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone > d.data_criacao_negociacao THEN NULLIF(btrim(s.payload ->> '_closed_at'::text), ''::text)::timestamp with time zone
            ELSE d.data_perdido
        END AS data_perdido,
    d.nome_negociacao,
    COALESCE(o.origem_comercial, 'Inbound'::text) AS origem_comercial,
    NULLIF(btrim(s.payload ->> 'Sub-Fonte'::text), ''::text) AS sub_fonte_crm,
    s.id_etapa AS id_etapa_atual,
    COALESCE(NULLIF(NULLIF(regexp_replace(COALESCE(s.payload ->> '_valor_contrato'::text, ''::text), '[^0-9.]'::text, ''::text, 'g'::text), ''::text)::numeric, 0::numeric), d.valor_contrato) AS valor_produto,
        CASE
            WHEN upper(btrim(COALESCE(s.payload ->> 'Tipo de R1'::text, ''::text))) = 'LIVE'::text THEN 'LIVE'::text
            ELSE 'Individual'::text
        END AS tipo_r1,
    pa.data_perdido AS data_perda_anterior,
    d.ciclo > 1 AND (pa.data_perdido IS NULL OR d.data_criacao_negociacao IS NULL
      OR (d.data_criacao_negociacao AT TIME ZONE 'America/Sao_Paulo'::text)::date
       > (pa.data_perdido AT TIME ZONE 'America/Sao_Paulo'::text)::date) AS eh_resgate
   FROM vw_deal_ciclo_enriquecido d
     LEFT JOIN vw_deal_origem_comercial o ON o.id_deal = d.id_lead
     LEFT JOIN deal_snapshot s ON s.id_deal = d.id_lead
     LEFT JOIN vw_deal_ciclo_enriquecido pa ON pa.id_lead = d.id_lead AND pa.ciclo = (d.ciclo - 1)
  WHERE ((d.nome_funil = ANY (ARRAY['SDR'::text, 'Closer'::text, 'Prospecção Ativa'::text, 'Odonto Scale'::text, 'Odonto Legacy'::text])) OR d.id_funil = '6a99b60d62f84e00234789da'::text) AND (d.marca IS NOT NULL AND d.marca <> ''::text OR s.id_funil = '68b84341646c55001ed64e4f'::text) AND d.status_atual IS DISTINCT FROM 'Excluído'::text AND s.deleted_at IS NULL AND (d.nome_negociacao IS NULL OR lower(d.nome_negociacao) !~~ '%test%'::text) AND NOT (EXISTS ( SELECT 1
           FROM dashboard_deal_oculto oc
          WHERE oc.id_deal = d.id_lead AND oc.liberado_em IS NULL));

create or replace function public.dash_colunas(p_base text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_base
    when 'vendas' then array[
      'id_lead', 'ciclo', 'eh_reciclagem', 'eh_ciclo_atual',
      'marca', 'nome_funil', 'etapa_funil', 'id_etapa_atual', 'status_atual',
      'nome_sdr', 'nome_closer', 'nome_negociacao',
      'fonte_macro', 'sub_fonte', 'sub_fonte_crm', 'utm_source', 'utm_medium', 'utm_campaign',
      'valor_contrato', 'quantidade_unidades', 'valor_produto', 'motivo_perda',
      'data_criacao_negociacao', 'data_criacao_original',
      'data_novo_mql', 'data_tentando_contato', 'data_contato_efetivo',
      'data_interesse_reuniao', 'data_conexao',
      'data_agendamento_reuniao_sql', 'data_reuniao_realizada', 'data_no_show',
      'data_sal', 'data_oportunidade', 'data_comite', 'data_pre_contrato',
      'data_venda', 'data_perdido', 'origem_comercial', 'tipo_r1',
      'data_perda_anterior', 'eh_resgate']
    when 'etapas' then array[
      'id_evento', 'id_deal', 'dia', 'etapa_canonica', 'id_etapa', 'nome_funil',
      'ciclo', 'rn_deal_etapa_mes', 'marca_deal', 'origem_comercial']
  end
$$;

select public.dash_sincronizar(true);

select public.dash_sincronizar(true);

commit;

-- Conferência:
-- select count(*) filter (where eh_resgate) resgates, count(*) filter (where ciclo > 1) reabertos,
--        count(*) filter (where ciclo = 1 and eh_resgate) ciclo1_resgate from vw_funil_vendas;
