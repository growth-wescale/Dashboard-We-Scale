import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = 'ad-creative-media';
const ARCHIVE_LIMIT = 6;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MARCA_MAP: Record<string, string> = {
  '24763396173316651': 'Oral Unic', '1545632780625614': 'Oral Unic',
  '987872747563639': 'Inpot', '2162801761122744': 'Lisô Laser',
  '847556143491366': 'Viva', '2424035941347251': 'Eletrovias',
  '1780151219244829': 'B2Case', '2633223773786713': 'Odonto Scale',
  '655039566905092': 'We Scale',
};

interface AdCreative {
  effective_object_story_id?: string;
  instagram_permalink_url?: string;
  thumbnail_url?: string;
  image_url?: string;
  object_story_spec?: {
    video_data?: { video_id?: string; image_url?: string };
    link_data?: { picture?: string };
    photo_data?: { url?: string };
  };
  asset_feed_spec?: {
    videos?: Array<{ video_id?: string }>;
    images?: Array<{ url?: string }>;
  };
}
interface MetaAd { id: string; name: string; account_id?: string; effective_status?: string; creative?: AdCreative }
interface AdRow {
  ad_id: string; ad_name: string; account_id: string; marca: string;
  page_id: string | null; post_id: string | null; post_url: string | null;
  effective_object_story_id: string | null; instagram_permalink_url: string | null;
}

function storyIdToPostUrl(storyId?: string) {
  if (!storyId) return { page_id: null, post_id: null, post_url: null };
  const idx = storyId.indexOf('_');
  if (idx < 1) return { page_id: null, post_id: null, post_url: null };
  const page_id = storyId.slice(0, idx), post_id = storyId.slice(idx + 1);
  return { page_id, post_id, post_url: `https://www.facebook.com/${page_id}/posts/${post_id}` };
}
function toRow(ad: MetaAd, accountId: string): AdRow {
  const storyId = ad.creative?.effective_object_story_id || null;
  const igUrl = ad.creative?.instagram_permalink_url || null;
  const { page_id, post_id, post_url: fbUrl } = storyIdToPostUrl(storyId ?? undefined);
  return { ad_id: ad.id, ad_name: ad.name, account_id: accountId, marca: MARCA_MAP[accountId] || accountId,
    page_id, post_id, post_url: fbUrl ?? igUrl, effective_object_story_id: storyId, instagram_permalink_url: igUrl };
}
function slug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function videoId(creative?: AdCreative) { return creative?.object_story_spec?.video_data?.video_id ?? creative?.asset_feed_spec?.videos?.[0]?.video_id ?? null; }
function imageUrl(creative?: AdCreative) {
  return creative?.image_url ?? creative?.object_story_spec?.video_data?.image_url ?? creative?.object_story_spec?.link_data?.picture
    ?? creative?.object_story_spec?.photo_data?.url ?? creative?.asset_feed_spec?.images?.[0]?.url ?? creative?.thumbnail_url ?? null;
}
function extension(contentType: string, kind: 'image' | 'video') {
  if (contentType.includes('quicktime')) return 'mov';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return kind === 'video' ? 'mp4' : 'jpg';
}

async function fetchAllAds(accountId: string, token: string): Promise<MetaAd[]> {
  // A listagem de contas grandes precisa ser leve. Os campos volumosos do
  // criativo são buscados individualmente apenas para o pequeno lote arquivado.
  const fields = 'id,name,account_id,effective_status,creative{effective_object_story_id,instagram_permalink_url}';
  const params = new URLSearchParams({ fields, limit: '200', access_token: token });
  const ads: MetaAd[] = [];
  let next: string | null = `https://graph.facebook.com/v22.0/act_${accountId}/ads?${params}`;
  for (let page = 0; next && page < 100; page++) {
    const resp = await fetch(next, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`Meta API ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    const data = await resp.json();
    if (Array.isArray(data.data)) ads.push(...data.data);
    next = data.paging?.next || null;
  }
  return ads;
}

async function fetchAdDetails(adId: string, token: string): Promise<MetaAd> {
  const fields = 'id,name,creative{effective_object_story_id,instagram_permalink_url,thumbnail_url,image_url,object_story_spec,asset_feed_spec}';
  const url = new URL(`https://graph.facebook.com/v22.0/${adId}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Meta ad ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return await response.json();
}

async function uploadRemote(supabase: ReturnType<typeof createClient>, remoteUrl: string, basePath: string, kind: 'image' | 'video') {
  const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_FILE_BYTES) throw new Error('arquivo excede 200 MB');
  const blob = await response.blob();
  if (blob.size > MAX_FILE_BYTES) throw new Error('arquivo excede 200 MB');
  const contentType = blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const path = `${basePath}.${extension(contentType, kind)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

async function archiveAd(supabase: ReturnType<typeof createClient>, ad: MetaAd, accountId: string, token: string) {
  const detailed = await fetchAdDetails(ad.id, token);
  const creative = detailed.creative;
  const vid = videoId(creative);
  let mediaType: 'image' | 'video' | null = null;
  let mediaSource: string | null = null;
  let thumbnailSource = creative?.thumbnail_url ?? imageUrl(creative);
  if (vid) {
    const url = new URL(`https://graph.facebook.com/v22.0/${vid}`);
    url.searchParams.set('fields', 'source,picture'); url.searchParams.set('access_token', token);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Meta video ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const video = await response.json();
    mediaType = 'video'; mediaSource = video.source ?? null; thumbnailSource = video.picture ?? thumbnailSource;
  } else {
    mediaSource = imageUrl(creative); mediaType = mediaSource ? 'image' : null;
  }
  if (!mediaType || !mediaSource) {
    await supabase.from('ad_creatives').update({ preview_status: 'unavailable', preview_error: 'Criativo sem mídia acessível', preview_updated_at: new Date().toISOString() }).eq('ad_id', ad.id);
    return 'unavailable';
  }
  const base = `${slug(MARCA_MAP[accountId] || accountId)}/${ad.id}`;
  const mediaPath = await uploadRemote(supabase, mediaSource, `${base}/media`, mediaType);
  const thumbnailPath = thumbnailSource ? await uploadRemote(supabase, thumbnailSource, `${base}/thumbnail`, 'image').catch(() => null) : null;
  const { error } = await supabase.from('ad_creatives').update({ preview_media_type: mediaType, preview_storage_path: mediaPath,
    preview_thumbnail_path: thumbnailPath, preview_status: 'ready', preview_error: null, preview_updated_at: new Date().toISOString() }).eq('ad_id', ad.id);
  if (error) throw error;
  return 'ready';
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: token, error: secretErr } = await supabase.rpc('get_secret', { secret_name: 'META_ACCESS_TOKEN' });
  if (secretErr || !token) return jsonError(500, 'vault:META_ACCESS_TOKEN', secretErr);
  const summary: Array<{ account_id: string; marca: string; ads?: number; error?: string }> = [], allAds: Array<{ ad: MetaAd; accountId: string }> = [];
  for (const accountId of Object.keys(MARCA_MAP)) {
    try {
      const ads = await fetchAllAds(accountId, token as string);
      allAds.push(...ads.map(ad => ({ ad, accountId })));
      summary.push({ account_id: accountId, marca: MARCA_MAP[accountId], ads: ads.length });
    } catch (e) { summary.push({ account_id: accountId, marca: MARCA_MAP[accountId], error: String((e as Error)?.message || e) }); }
  }
  const unique = new Map<string, { ad: MetaAd; accountId: string }>();
  for (const item of allAds) unique.set(item.ad.id, item);
  const items = [...unique.values()], rows = items.map(({ ad, accountId }) => toRow(ad, accountId));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('ad_creatives').upsert(rows.slice(i, i + 500), { onConflict: 'ad_id' });
    if (error) return jsonError(500, 'upsert ad_creatives', error);
  }
  const activeIds = items.filter(({ ad }) => ad.effective_status === 'ACTIVE').map(({ ad }) => ad.id);
  const statusById = new Map<string, string>();
  for (let i = 0; i < activeIds.length; i += 200) {
    const { data } = await supabase.from('ad_creatives').select('ad_id,preview_status').in('ad_id', activeIds.slice(i, i + 200));
    for (const row of data ?? []) statusById.set(row.ad_id, row.preview_status);
  }
  const candidates = items.filter(({ ad }) => ad.effective_status === 'ACTIVE' && statusById.get(ad.id) !== 'ready').slice(0, ARCHIVE_LIMIT);
  let ready = 0, unavailable = 0, failed = 0;
  for (const { ad, accountId } of candidates) {
    try { (await archiveAd(supabase, ad, accountId, token as string)) === 'ready' ? ready++ : unavailable++; }
    catch (e) {
      failed++;
      await supabase.from('ad_creatives').update({ preview_status: 'error', preview_error: String((e as Error)?.message || e).slice(0, 500), preview_updated_at: new Date().toISOString() }).eq('ad_id', ad.id);
    }
  }
  return new Response(JSON.stringify({ ok: true, total_ads: rows.length, archived: { attempted: candidates.length, ready, unavailable, failed }, per_account: summary, generated_at: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } });
});
function jsonError(status: number, msg: string, err?: unknown) { return new Response(JSON.stringify({ ok: false, error: msg, details: err }), { status, headers: { 'Content-Type': 'application/json' } }); }
