-- Preview interno dos criativos da Meta.
-- A mídia permanece privada; o dashboard gera URLs assinadas de curta duração.

alter table public.ad_creatives
  add column if not exists preview_media_type text,
  add column if not exists preview_storage_path text,
  add column if not exists preview_thumbnail_path text,
  add column if not exists preview_status text not null default 'pending',
  add column if not exists preview_attempts integer not null default 0,
  add column if not exists preview_error text,
  add column if not exists preview_updated_at timestamptz;

alter table public.ad_creatives
  drop constraint if exists ad_creatives_preview_media_type_check;

alter table public.ad_creatives
  add constraint ad_creatives_preview_media_type_check
  check (preview_media_type is null or preview_media_type in ('image', 'video'));

alter table public.ad_creatives
  drop constraint if exists ad_creatives_preview_status_check;

alter table public.ad_creatives
  add constraint ad_creatives_preview_status_check
  check (preview_status in ('pending', 'ready', 'unavailable', 'error'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-creative-media',
  'ad-creative-media',
  false,
  209715200,
  array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can read ad creative media" on storage.objects;
create policy "Authenticated users can read ad creative media"
on storage.objects for select
to authenticated
using (bucket_id = 'ad-creative-media');

comment on column public.ad_creatives.preview_storage_path is
  'Caminho privado da imagem ou vídeo arquivado no bucket ad-creative-media.';
comment on column public.ad_creatives.preview_thumbnail_path is
  'Caminho privado da capa do criativo no bucket ad-creative-media.';
