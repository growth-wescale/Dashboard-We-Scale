-- Libera a aba "Linha do Tempo" pros papéis que já veem a Visão Macro.
-- Rodar no SQL Editor do Supabase de MARKETING (é lá que vive o controle de acesso).
-- Administrador (acesso_total) já vê a aba sem isto.
insert into public.acesso_papel_permissoes (papel_id, permissao)
select pp.papel_id, 'aba.linha-do-tempo'
  from public.acesso_papel_permissoes pp
 where pp.permissao = 'aba.visao-macro'
on conflict do nothing;

-- Conferir:
-- select p.nome, count(*) filter (where pp.permissao='aba.linha-do-tempo') as tem
--   from public.acesso_papeis p
--   left join public.acesso_papel_permissoes pp on pp.papel_id = p.id
--  group by p.nome order by p.nome;
