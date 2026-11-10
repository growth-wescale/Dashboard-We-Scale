-- Supabase de Marketing. A habilitação vale também para futuros usuários desse papel.
insert into public.acesso_papel_permissoes (papel_id, permissao)
select id, 'aba.gastos-whatsapp'
from public.acesso_papeis
where nome = 'Acesso total (legado)' and sistema and not acesso_total
on conflict (papel_id, permissao) do nothing;
