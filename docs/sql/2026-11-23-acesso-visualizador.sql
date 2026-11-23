-- 2026-11-23 — Supabase de MARKETING (jmuluoksnlqrvzbcltim): "Acesso total (legado)" vira "Visualizador".
-- Rodar no SQL Editor: https://supabase.com/dashboard/project/jmuluoksnlqrvzbcltim/sql/new
--
-- É um tipo padrão (sistema = true) e o gatilho acesso_papeis_protege não deixa renomear tipo padrão,
-- nem pela tela. O bloco desliga o gatilho só durante o UPDATE, dentro da mesma transação: falhou,
-- nada muda. Confere antes que o tipo não tem nenhuma ação marcada (senão o nome "Visualizador"
-- enganaria). Em 23/11 ele tinha 11 telas e nenhuma ação, 33 pessoas.
do $$
declare
  v_id    uuid;
  v_acoes int;
begin
  select id into v_id from public.acesso_papeis
   where nome = 'Acesso total (legado)' and sistema and not acesso_total;
  if v_id is null then
    raise exception 'Tipo "Acesso total (legado)" não encontrado (já foi renomeado?)';
  end if;

  select count(*) into v_acoes from public.acesso_papel_permissoes
   where papel_id = v_id and permissao like 'acao.%';
  if v_acoes > 0 then
    raise exception 'O tipo tem % ação(ões) marcada(s). Tire as ações antes de chamá-lo de Visualizador.', v_acoes;
  end if;

  alter table public.acesso_papeis disable trigger acesso_papeis_protege;
  update public.acesso_papeis
     set nome = 'Visualizador',
         descricao = 'Só vê as telas marcadas, sem ações de edição, publicação ou administração. Quem já tinha conta antes do controle de acessos começou aqui.'
   where id = v_id;
  alter table public.acesso_papeis enable trigger acesso_papeis_protege;
end $$;

-- Conferência: 1 linha, sistema = true, gatilho ligado de novo.
select p.nome, p.descricao, p.sistema,
       (select count(*) from public.acesso_usuarios u where u.papel_id = p.id) as pessoas,
       (select tgenabled from pg_trigger where tgname = 'acesso_papeis_protege') as gatilho  -- 'O' = ligado
  from public.acesso_papeis p
 where p.nome = 'Visualizador';
