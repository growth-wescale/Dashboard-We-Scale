-- 2026-11-23 (2) - Supabase de MARKETING (jmuluoksnlqrvzbcltim). Rodar no SQL Editor.
-- 1) Corrige a descricao do Visualizador (o texto colado antes perdeu os acentos).
-- 2) Exclui a conta validacao.dashboard@wescale.com.br e o tipo "Validacao Dashboard - Somente leitura",
--    a pedido do Junior. Apagar a conta em auth.users apaga junto o acesso, as sessoes e o login dela.
-- Tudo num bloco so: se qualquer conferencia falhar, nada muda.
-- Os acentos estao escritos como \u00XX de proposito, para a copia nao estragar o texto.
do $$
declare
  v_user  uuid;
  v_papel uuid;
  v_outros int;
begin
  update public.acesso_papeis
     set descricao = E'S\u00f3 v\u00ea as telas marcadas, sem a\u00e7\u00f5es de edi\u00e7\u00e3o, publica\u00e7\u00e3o ou administra\u00e7\u00e3o. Quem j\u00e1 tinha conta antes do controle de acessos come\u00e7ou aqui.'
   where nome = 'Visualizador' and sistema;
  if not found then raise exception 'Tipo Visualizador nao encontrado'; end if;

  select id into v_user from auth.users where lower(email) = 'validacao.dashboard@wescale.com.br';
  if v_user is null then raise exception 'Conta validacao.dashboard@wescale.com.br nao encontrada'; end if;

  select id into v_papel from public.acesso_papeis
   where nome = E'Valida\u00e7\u00e3o Dashboard - Somente leitura' and not sistema and not acesso_total;
  if v_papel is null then raise exception 'Tipo de acesso de validacao nao encontrado'; end if;

  select count(*) into v_outros from public.acesso_usuarios where papel_id = v_papel and user_id <> v_user;
  if v_outros > 0 then raise exception 'Ha % outra(s) pessoa(s) com o tipo de validacao; nada foi apagado', v_outros; end if;

  delete from auth.users where id = v_user;            -- leva junto acesso_usuarios, sessoes e identidades
  delete from public.acesso_papeis where id = v_papel; -- leva junto as permissoes do tipo
end $$;

-- Conferencia: descricao com acento certo, e os dois contadores em 0.
select (select descricao from public.acesso_papeis where nome = 'Visualizador') as descricao_visualizador,
       (select count(*) from auth.users where lower(email) = 'validacao.dashboard@wescale.com.br') as conta_validacao,
       (select count(*) from public.acesso_papeis where nome like 'Valida%') as tipo_validacao;
