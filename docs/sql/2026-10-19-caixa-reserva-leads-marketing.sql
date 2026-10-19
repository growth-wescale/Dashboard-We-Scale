-- =====================================================================================
-- Caixa reserva da distribuição de leads — roda no Supabase de MARKETING (jmuluoksnlqrvzbcltim).
-- 19/10/2026, OK do Gabriel via Junior. Motivo: a API do Supabase de Expansão ficou 14 h fora
-- (18–19/10) e o RD Marketing não reenvia webhook. Um 2º webhook do RD manda cada conversão
-- também para a Edge Function caixa-reserva-leads (deste projeto), que só guarda. Quem entrega é a
-- repassar-caixa-reserva (Expansão), que busca aqui a cada 2 min. A distribuir-lead ignora conversão
-- já recebida, então o repasse nunca duplica deal. Nada aqui toca tabela existente do Marketing, e
-- nenhum segredo de Expansão fica neste projeto.
-- =====================================================================================

create table if not exists public.lead_caixa_reserva (
  id                   bigserial primary key,
  recebido_em          timestamptz not null default now(),
  corpo                jsonb,                 -- corpo do webhook do RD como chegou
  corpo_texto          text,                  -- só quando o corpo não era JSON
  identificadores      text[] not null default '{}',
  status               text not null default 'pendente' check (status in ('pendente', 'entregue', 'descartado')),
  tentativas           int not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  ultimo_status        int,
  ultimo_erro          text,
  entregue_em          timestamptz
);
create index if not exists lead_caixa_reserva_pendentes on public.lead_caixa_reserva (proxima_tentativa_em) where status = 'pendente';
alter table public.lead_caixa_reserva enable row level security;   -- sem policy: só service_role
comment on table public.lead_caixa_reserva is 'Caixa reserva da distribuição de leads (Expansão): 2º webhook do RD Marketing, entregue à distribuir-lead pela repassar-caixa-reserva. Ver docs/sql/2026-10-19-caixa-reserva-leads-marketing.sql no repo do dashboard.';

-- Chave da caixa (vai na URL do 2º webhook e é copiada para o Vault de Expansão).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'caixa_reserva_chave') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'caixa_reserva_chave');
  end if;
end $$;

create or replace function public.caixa_reserva_segredo(p_nome text)
returns text language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome and p_nome = 'caixa_reserva_chave'
$$;
revoke all on function public.caixa_reserva_segredo(text) from public, anon, authenticated;
grant execute on function public.caixa_reserva_segredo(text) to service_role;

-- Limpeza diária: o que já foi entregue há mais de 30 dias.
select cron.schedule('caixa_reserva_limpeza', '50 4 * * *',
  $c$delete from public.lead_caixa_reserva where status <> 'pendente' and recebido_em < now() - interval '30 days'$c$);

-- Conferência:
-- select status, count(*), min(recebido_em), max(recebido_em) from public.lead_caixa_reserva group by 1;
-- select id, recebido_em, identificadores, tentativas, ultimo_status, ultimo_erro
--   from public.lead_caixa_reserva where status = 'pendente' order by recebido_em limit 20;
