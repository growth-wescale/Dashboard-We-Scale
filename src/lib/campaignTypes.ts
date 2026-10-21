import type { AdCreativePreview } from '@/hooks/useAdCreatives'

export interface Ad { id: string; name: string; attributionOnly?: boolean; commercialAttribution?: boolean; type?: string; spend: number; impressions: number; clicks: number; ctr: number; mql: number; cpmql: number; hue: number; preview?: AdCreativePreview }
export interface AdSet { id: string; name: string; attributionOnly?: boolean; commercialAttribution?: boolean; publico: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; mql: number; sql: number; cpmql: number; freq: number; ads: Ad[] }
export interface Campaign { id: string; name: string; attributionOnly?: boolean; commercialAttribution?: boolean; status: string; objetivo: string; spend: number; impressions: number; clicks: number; ctr: number; cpm: number; cpc: number; lpv: number; leads: number; mql: number; sql: number; cpmql: number; cpsql: number; adsets: AdSet[] }
