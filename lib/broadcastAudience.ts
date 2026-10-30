// Who sees a venue's broadcast in Updates (Jacob, Oct 29):
//
//   Followers    see the venue's broadcasts wherever they are, unless they muted it.
//   Subscribers  are followers who also get the "subscribers only" ones.
//   Checked in   people see tonight's announcements and the venue's live
//                promotions while they're there, follow or not.
//
// Someone who fits more than one of these sees each broadcast once: the feed
// fetches one row per broadcast and this decides whether to keep it.
//
// Pure (no Supabase) so it can be tested with node --test.

export interface BroadcastViewer {
  /** Venues followed and not muted. */
  following: ReadonlySet<string>
  /** Venues where the viewer is a subscriber (muted or not). */
  subscribed: ReadonlySet<string>
  /** The venue the viewer is checked in to right now, if any. */
  checkedInZone: string | null
  /** Start of tonight (lib/nights.ts nightStart), in ms. */
  nightStartMs: number
}

export interface BroadcastRow {
  zone_id: string
  audience?: string | null
  /** When it went out: an announcement's publish time. Unused for promotions,
   *  whose start/end window is already applied by the query. */
  at?: string | null
}

export function seesBroadcast(
  kind: 'announcement' | 'promotion',
  row: BroadcastRow,
  viewer: BroadcastViewer,
): boolean {
  if (row.audience === 'subscribers' && !viewer.subscribed.has(row.zone_id)) return false
  if (viewer.following.has(row.zone_id)) return true
  if (viewer.checkedInZone !== row.zone_id) return false
  if (kind === 'promotion') return true
  const at = row.at ? new Date(row.at).getTime() : NaN
  return Number.isFinite(at) && at >= viewer.nightStartMs
}

/** The venues whose broadcasts are worth fetching for this viewer. */
export function broadcastZoneIds(viewer: BroadcastViewer): string[] {
  const ids = new Set(viewer.following)
  if (viewer.checkedInZone) ids.add(viewer.checkedInZone)
  return Array.from(ids)
}
