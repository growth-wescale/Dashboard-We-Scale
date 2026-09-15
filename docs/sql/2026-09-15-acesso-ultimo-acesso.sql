-- Controle de acessos — "Último acesso" passa a considerar a atividade da sessão.
-- Rodar no SQL Editor do Supabase de MARKETING (jmuluoksnlqrvzbcltim), uma vez.
--
-- auth.users.last_sign_in_at só muda quando a pessoa digita e-mail e senha. Quem
-- fica logado (o normal) só renova a sessão, e a data congelava: Junior aparecia
-- "há 29 dias" usando o dashboard todo dia. Agora vale a mais recente entre o
-- login e a última renovação de sessão (a cada ~1h com o dashboard aberto).

create or replace function public.acesso_listar_usuarios()
returns table (usuario_id uuid, email text, criado_em timestamptz, ultimo_login timestamptz,
               convite_pendente boolean, papel_id uuid, papel_nome text, marcas text[], ativo boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.tem_permissao('acao.usuarios-gerenciar') then
    raise exception 'sem permissão para gerenciar usuários' using errcode = '42501';
  end if;
  return query
    select au.id, au.email::text, au.created_at,
           greatest(au.last_sign_in_at,
                    (select max(greatest(s.updated_at, s.refreshed_at)) from auth.sessions s where s.user_id = au.id)),
           (au.last_sign_in_at is null),
           acc.papel_id, p.nome, acc.marcas, coalesce(acc.ativo, false)
    from auth.users au
    left join public.acesso_usuarios acc on acc.user_id = au.id
    left join public.acesso_papeis p on p.id = acc.papel_id
    order by lower(au.email::text);
end $$;
