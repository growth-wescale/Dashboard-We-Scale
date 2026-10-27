-- 27/10/2026 — Limpeza da cadência: não encerrar a execução recém-criada quando o snapshot está atrasado.
-- Aplicado no Supabase de Expansão (migration cadencia_limpeza_trava_snapshot_atrasado).
-- Versão anterior guardada em public._backup_viewdefs ('cadencia.v_execucoes_a_encerrar_pre_trava_snapshot_20261027').
--
-- Problema: o Ingresso cria a execução assim que o RD avisa a mudança de etapa, mas o deal_snapshot
-- (espelho/wf_5) leva alguns minutos para mostrar a etapa nova. A Limpeza (n8n, */15 8–19) lia o
-- snapshot antigo, achava que o deal "saiu da etapa" e encerrava a execução que acabou de nascer.
-- Em 30 dias: 88 execuções encerradas em menos de 1 h sem o deal ter mudado de etapa
-- (81 da cadência 13 "Conexão", 4 da 3 "Odonto Legacy", 3 da 6 "SDR").
--
-- Trava: "saiu_da_etapa" não vale enquanto a execução tem menos de 1 h E o snapshot é mais velho que
-- ela (data_atualizacao = updated_at do RD; o Ingresso cria tarefas no RD logo depois, então o snapshot
-- já atualizado fica com data_atualizacao >= criação da execução). "deal_fechado" segue sem trava.

create or replace view cadencia.v_execucoes_a_encerrar as
 SELECT e.id AS execucao_id,
    e.deal_id,
    e.deal_name,
    e.marca,
    e.cadencia_id,
    e.cadencia_nome,
    ds.id_funil,
    ds.id_etapa,
    ds.nome_etapa,
    ds.status AS status_deal,
        CASE
            WHEN ds.status = ANY (ARRAY['lost'::text, 'won'::text]) THEN 'deal_fechado'::text
            ELSE 'saiu_da_etapa'::text
        END AS motivo
   FROM public.cadencia_execucoes e
     JOIN public.cadencias c ON c.id = e.cadencia_id
     JOIN public.deal_snapshot ds ON ds.id_deal = e.deal_id AND ds.deleted_at IS NULL
  WHERE e.status = 'ativa'::text AND c.encerrar_tarefas = true
    AND (
      (ds.status = ANY (ARRAY['lost'::text, 'won'::text]))
      OR (
        NOT (EXISTS ( SELECT 1
               FROM public.cadencia_etapas ce
              WHERE ce.cadencia_id = e.cadencia_id AND ce.pipeline_id = ds.id_funil AND ce.stage_id = ds.id_etapa))
        AND NOT (
          e.criado_em > now() - interval '1 hour'
          AND ds.data_atualizacao < e.criado_em - interval '2 minutes'
        )
      )
    );
