import { supabase } from './supabase'

// QR attribution for the Neighborhood Pilot (Jacob's Admin Portal spec, Jul 2026).
// Every physical placement gets its OWN code, so we can tell which material
// actually converts — not just "someone came from Martha My Dear," but "the
// coaster at Martha My Dear."

export const QR_PLACEMENTS: { slug: string; label: string }[] = [
  { slug: 'window_decal',    label: 'Window decal' },
  { slug: 'front_door',      label: 'Front door sign' },
  { slug: 'host_stand',      label: 'Host stand' },
  { slug: 'table_tent',      label: 'Table tent' },
  { slug: 'bar_top',         label: 'Bar top display' },
  { slug: 'coaster',         label: 'Coaster' },
  { slug: 'bathroom_mirror', label: 'Bathroom mirror' },
  { slug: 'flyer',           label: 'Flyer' },
  { slug: 'other',           label: 'Other' },
]

export function placementLabel(slug: string): string {
  return QR_PLACEMENTS.find((p) => p.slug === slug)?.label ?? slug
}

// The host a printed QR points at. The /q/[code] route lives in the web app, so
// this is the public web origin. Use herenowsocial.com once its DNS is live;
// herenow-pi.vercel.app serves the same deployment in the meantime, so codes
// printed against either host resolve to the same redirect route.
export const QR_BASE_URL = 'https://herenowsocial.com'

export interface QrCode {
  id:         string
  zone_id:    string
  placement:  string
  label:      string | null
  code:       string
  is_active:  boolean
  created_at: string
}

export function qrUrl(code: string): string {
  return `${QR_BASE_URL}/q/${code}`
}

// Printable QR image. qrserver renders the PNG from the URL; the admin downloads
// it once and hands it to the printer. No app-runtime dependency.
export function qrImageUrl(code: string, size = 600): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(qrUrl(code))}`
}

function genCode(): string {
  // 8 url-safe chars. ~2.8e12 space; the UNIQUE constraint catches a rare clash.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

export async function listQrCodes(zoneId: string): Promise<QrCode[]> {
  const { data } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: false })
  return (data as QrCode[]) ?? []
}

export async function createQrCode(zoneId: string, placement: string, label: string): Promise<QrCode | null> {
  const { data, error } = await supabase
    .from('qr_codes')
    .insert({ zone_id: zoneId, placement, label: label.trim() || placementLabel(placement), code: genCode() })
    .select('*')
    .single()
  if (error) {
    console.warn('[qr] createQrCode error:', error.message)
    return null
  }
  return data as QrCode
}

export async function setQrActive(id: string, isActive: boolean): Promise<void> {
  await supabase.from('qr_codes').update({ is_active: isActive }).eq('id', id)
}

// Scan counts per code for a venue, in one query (admin RLS permits the select).
export async function qrScanCounts(zoneId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('qr_scans')
    .select('qr_code_id')
    .eq('zone_id', zoneId)
  const counts: Record<string, number> = {}
  for (const row of (data as { qr_code_id: string }[]) ?? []) {
    counts[row.qr_code_id] = (counts[row.qr_code_id] ?? 0) + 1
  }
  return counts
}
