-- Lisô Laser sem SDR: metas V6 de outubro e SDR pela distribuição (27/10/2026)
-- (JÁ APLICADO no Supabase de Expansão. Rodar de novo publicaria uma V7.)
--
-- 1. Metas de outubro V6 (meta_versao id 20, ativa): cópia da V5 (id 19) com a Lisô Laser sem
--    meta de SDR. Etapas SAL, Reunião Realizada, Reunião Agendada SQL, MQL e Ligações da Lisô
--    em 'desligado', Xayane fora do time da Lisô (pessoa, linha do espelho e semanas). Closer
--    (Bruna, 1 venda, R$ 39.900) e as outras 6 marcas idênticos à V5 (md5 de etapas, pessoas e
--    semanas conferido). DB_Metas_Performance de outubro: 15 → 14 linhas, as 14 idênticas.
--    O realizado da Xayane na Lisô não depende da meta (vem dos deals): 80 MQL, 4 SQL, 1 Diag,
--    1 SAL em outubro, iguais antes e depois.
--    Efeito colateral: ativar versão reinicia o contador da distribuição das marcas que seguem a
--    meta (só pesa na Eletrovias, 50/50, no máximo 1 lead).

with v as (select * from meta_versao where id = 19),
p as (select jsonb_build_object(
 'mesReferencia', '2026-10-01',
 'rotulo', 'v6 outubro · Lisô sem meta de SDR',
 'motivo', 'Lisô Laser sem SDR desde 27/10/2026: leads da marca vão para a Bruna (Closer) por decisão do Brunno e do chefe do Junior. Sem meta de SDR da Lisô em outubro; o realizado da Xayane na Lisô continua contando.',
 'diaViradaSemana', (select dia_virada_semana from v),
 'linhasEspelho', (select jsonb_agg(x order by ord) from v, jsonb_array_elements(v.linhas_espelho) with ordinality t(x, ord)
                    where not (x->>'marca' = 'Lisô Laser' and x->>'funcao' = 'SDR')),
 'semanas', (select jsonb_agg(jsonb_build_object('numero', numero, 'inicio', data_inicio, 'fim', data_fim) order by numero)
               from meta_semana where meta_versao_id = 19),
 'marcas', (select jsonb_agg(jsonb_build_object('marca', m.marca, 'ticketMedio', m.ticket_medio,
     'etapas', (select jsonb_agg(case when m.marca = 'Lisô Laser' and e.etapa in ('SAL', 'Reunião Realizada', 'Reunião Agendada SQL', 'MQL', 'Ligações')
                 then jsonb_build_object('etapa', e.etapa, 'modo', 'desligado', 'valorFixo', null, 'etapaOrigem', null, 'taxa', null, 'taxaOrigem', null)
                 else jsonb_build_object('etapa', e.etapa, 'modo', e.modo, 'valorFixo', e.valor_fixo, 'etapaOrigem', e.etapa_origem, 'taxa', e.taxa, 'taxaOrigem', e.taxa_origem) end
                 order by e.id) from meta_marca_etapa e where e.meta_marca_id = m.id),
     'pessoas', (select coalesce(jsonb_agg(jsonb_build_object('nome', pp.nome, 'funcao', pp.funcao, 'peso', pp.peso) order by pp.id), '[]'::jsonb)
                   from meta_pessoa pp where pp.meta_marca_id = m.id and not (m.marca = 'Lisô Laser' and pp.funcao = 'SDR'))
   ) order by m.id) from meta_marca m where m.meta_versao_id = 19),
 'distribuicaoSemanal', (select jsonb_agg(jsonb_build_object('marca', mm.marca, 'nomePessoa', pp.nome, 'etapa', s.etapa, 'semanaNumero', ms.numero, 'valor', s.valor) order by s.id)
     from meta_pessoa_semana s join meta_pessoa pp on pp.id = s.meta_pessoa_id join meta_marca mm on mm.id = pp.meta_marca_id
     join meta_semana ms on ms.id = s.meta_semana_id
     where mm.meta_versao_id = 19 and not (mm.marca = 'Lisô Laser' and pp.funcao = 'SDR'))
) j)
select public.publicar_meta_versao(p.j, 'Junior (via Claude Code)', true) from p;

-- 2. vw_deal_ciclo: fonte nova de SDR 'distribuicao', no fim da cadeia (só preenche SDR vazio).
--    Ciclo 1 de deal criado pela distribuição = quem recebeu o lead (distribuicao_atribuicao,
--    resultado 'atribuido'). Caso que motivou: a Bruna (cargo Closer) recebe o lead da Lisô e
--    também fecha; a fonte 'posse' descartava o nome dela por ser igual ao Closer eleito, e o
--    deal ficava "Sem SDR". Conferido: 0 diferenças nos 11.204 ciclos ao aplicar (todos os 398
--    deals distribuídos já tinham SDR). Versão anterior em _backup_viewdefs
--    (vw_deal_ciclo_pre_sdr_distribuicao_20261027).

do $$
declare
  d text := pg_get_viewdef('public.vw_deal_ciclo'::regclass);
  n text;
begin
  insert into public._backup_viewdefs (nome, criado_em, def)
  values ('vw_deal_ciclo_pre_sdr_distribuicao_20261027', now(), d);

  n := regexp_replace(d, 'cr\.sdr_rd\s+FROM', 'cr.sdr_rd, (SELECT da.nome_sdr FROM distribuicao_atribuicao da WHERE da.id_deal = d_1.id_deal AND d_1.ciclo = 1 AND da.resultado = ''atribuido'' AND da.nome_sdr IS NOT NULL ORDER BY da.recebido_em LIMIT 1) AS sdr_dist FROM');
  if n = d then raise exception 'troca 1 (sdr_dist no pre) não aplicou'; end if;
  d := n;
  n := regexp_replace(d, 'END\) AS sdr_ciclo', 'END, pre.sdr_dist) AS sdr_ciclo');
  if n = d then raise exception 'troca 2 (coalesce) não aplicou'; end if;
  d := n;
  n := replace(d, 'THEN ''posse_final''::text', 'THEN ''posse_final''::text WHEN (pre.sdr_dist IS NOT NULL) THEN ''distribuicao''::text');
  if n = d then raise exception 'troca 3 (sdr_fonte) não aplicou'; end if;

  execute 'create or replace view public.vw_deal_ciclo as ' || n;
end $$;

refresh materialized view mv_deal_ciclo_enriquecido;
