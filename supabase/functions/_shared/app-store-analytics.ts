// App Store Connect Analytics Reports for the Pilot Dashboard: everything that
// does not touch the network or the database directly. The app-store-analytics
// Edge Function (Deno) wires in real HTTP and Supabase calls; the node tests in
// test/app-store-analytics.test.ts wire in fakes. So this file uses web-standard
// APIs only (WebCrypto, DecompressionStream, Blob, Response, atob/btoa).
//
// Apple docs this follows, all read Oct 18, 2026:
//   Generating Tokens for API Requests
//     https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests
//   Downloading Analytics Reports
//     https://developer.apple.com/documentation/appstoreconnectapi/downloading-analytics-reports
//   Analytics Reports (catalog), Data Completeness and Corrections, Privacy
//     https://developer.apple.com/documentation/analytics-reports
//     https://developer.apple.com/documentation/analytics-reports/data-completeness-corrections
//     https://developer.apple.com/documentation/analytics-reports/privacy
//   App Store Downloads / App Store Discovery and Engagement (field lists)
//     https://developer.apple.com/documentation/analytics-reports/app-download
//     https://developer.apple.com/documentation/analytics-reports/app-store-discovery-and-engagement

export const ASC_API = 'https://api.appstoreconnect.apple.com'

// ── Auth: ES256 JWT ──────────────────────────────────────────────────────────
// Header { alg: ES256, kid, typ: JWT }, payload { iss, iat, exp, aud }. Apple
// rejects a token whose exp is more than 20 minutes after iat for these
// endpoints, so the default is 15 and anything over 20 throws.

export interface AscKey {
  issuerId: string
  keyId: string
  privateKey: string  // the contents of AuthKey_<KEY ID>.p8
}

export const MAX_TOKEN_SECONDS = 20 * 60

export function pemToPkcs8(pem: string): Uint8Array {
  // A secret set through a CLI or a dashboard can arrive with literal "\n",
  // with its newlines turned into spaces, or with the BEGIN/END lines missing.
  // Only the base64 body matters, so strip everything else.
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END)[A-Z ]*-----/g, '')
    .replace(/\s+/g, '')
  if (!body) throw new Error('APP_STORE_CONNECT_PRIVATE_KEY is empty')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function makeAscToken(
  key: AscKey,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  lifetimeSeconds: number = 15 * 60,
): Promise<string> {
  if (lifetimeSeconds > MAX_TOKEN_SECONDS) throw new Error('Apple rejects tokens that live longer than 20 minutes')
  const enc = new TextEncoder()
  const header = { alg: 'ES256', kid: key.keyId, typ: 'JWT' }
  const payload = { iss: key.issuerId, iat: nowSeconds, exp: nowSeconds + lifetimeSeconds, aud: 'appstoreconnect-v1' }
  const signingInput =
    `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(payload)))}`
  // .buffer of a freshly built array is exactly the key bytes (no offset).
  const der = pemToPkcs8(key.privateKey).buffer as ArrayBuffer
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  // WebCrypto returns the raw r||s signature, which is exactly what JWS ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, enc.encode(signingInput)))
  return `${signingInput}.${base64url(sig)}`
}

// ── Report files ─────────────────────────────────────────────────────────────
// Each segment is a gzipped, tab-delimited text file with a header row. Apple
// says to read columns by name, never by position, and that values are not
// case sensitive.

export async function gunzipText(bytes: Uint8Array): Promise<string> {
  const gzipped = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  if (!gzipped) return new TextDecoder().decode(bytes)
  // slice() copies into a fresh buffer, so .buffer holds exactly these bytes.
  const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

// "App Apple Identifier" -> "app apple identifier", "Pre-Order" -> "pre order"
export const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// "First-time Download" -> "firsttimedownload"
export const normValue = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export type ReportRow = Record<string, string>

// One line into fields. A field that starts with a double quote runs to the
// closing quote ("" is a literal quote); quotes anywhere else are plain text.
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let i = 0
  while (i <= line.length) {
    if (line[i] === '"') {
      let val = ''
      i++
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2 }
        else if (line[i] === '"') { i++; break }
        else { val += line[i]; i++ }
      }
      const next = line.indexOf(delim, i)
      val += next === -1 ? line.slice(i) : line.slice(i, next)
      out.push(val)
      if (next === -1) break
      i = next + 1
    } else {
      const next = line.indexOf(delim, i)
      out.push(next === -1 ? line.slice(i) : line.slice(i, next))
      if (next === -1) break
      i = next + 1
    }
  }
  return out
}

export function parseReport(text: string): ReportRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  let h = 0
  while (h < lines.length && lines[h].trim() === '') h++
  if (h >= lines.length) return []
  // Apple documents tab-delimited files. Fall back to commas only if the header
  // has no tab at all, so a format change fails soft instead of silently.
  const delim = lines[h].includes('\t') ? '\t' : ','
  const cols = splitLine(lines[h], delim).map(normKey)
  const rows: ReportRow[] = []
  for (let i = h + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    const fields = splitLine(lines[i], delim)
    const row: ReportRow = {}
    cols.forEach((c, j) => { row[c] = (fields[j] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

function requireColumns(rows: ReportRow[], needed: string[], report: string) {
  if (rows.length === 0) return
  const have = Object.keys(rows[0])
  const missing = needed.filter((c) => !have.includes(c))
  if (missing.length > 0) {
    // Fail loudly: a renamed column must not turn into a dashboard of zeros.
    throw new Error(`${report} report is missing column(s) ${missing.join(', ')}. Columns: ${have.join(', ')}`)
  }
}

const SOURCE_LABELS: Record<string, string> = {
  appstoresearch: 'App Store search',
  appstorebrowse: 'App Store browse',
  appreferrer: 'App referrer',
  webreferrer: 'Web referrer',
  appclip: 'App Clip',
  notification: 'Notification',
  institutionalpurchase: 'Institutional purchase',
  unavailable: 'Unavailable',
}
export const sourceLabel = (raw: string | undefined) =>
  SOURCE_LABELS[normValue(raw)] ?? (raw && raw.trim() ? raw.trim() : 'Unavailable')

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

function count(raw: string | undefined): number {
  const n = Number((raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

export interface DownloadDay {
  first_downloads: number
  redownloads: number
  by_source: Record<string, { first_downloads: number; redownloads: number }>
}

export interface ViewDay {
  page_views: number
  by_source: Record<string, { page_views: number }>
}

// "App Store Downloads Standard": first-time downloads and redownloads per day.
// Updates and restores are not new people and are left out. Every date in the
// file gets an entry, even one with only updates, so a day Apple restated to
// zero is written as zero instead of keeping an older number.
export function summarizeDownloads(rows: ReportRow[], appId?: string): Record<string, DownloadDay> {
  requireColumns(rows, ['date', 'download type', 'counts'], 'Downloads')
  const days: Record<string, DownloadDay> = {}
  for (const r of rows) {
    if (!isDate(r['date'])) continue
    if (appId && r['app apple identifier'] && r['app apple identifier'] !== appId) continue
    const d = (days[r['date']] ??= { first_downloads: 0, redownloads: 0, by_source: {} })
    const type = normValue(r['download type'])
    const isFirst = type === 'firsttimedownload'
    const isRe = type === 'redownload'
    if (!isFirst && !isRe) continue
    const n = count(r['counts'])
    const src = (d.by_source[sourceLabel(r['source type'])] ??= { first_downloads: 0, redownloads: 0 })
    if (isFirst) { d.first_downloads += n; src.first_downloads += n }
    else { d.redownloads += n; src.redownloads += n }
  }
  return days
}

// "App Store Discovery and Engagement Standard": product page views per day.
// Event "Page view" on Page Type "Product page", summed over Counts (every
// view, not unique viewers: unique counts can't be added across rows).
export function summarizeEngagement(rows: ReportRow[], appId?: string): Record<string, ViewDay> {
  requireColumns(rows, ['date', 'event', 'page type', 'counts'], 'Discovery and Engagement')
  const days: Record<string, ViewDay> = {}
  for (const r of rows) {
    if (!isDate(r['date'])) continue
    if (appId && r['app apple identifier'] && r['app apple identifier'] !== appId) continue
    const d = (days[r['date']] ??= { page_views: 0, by_source: {} })
    if (normValue(r['event']) !== 'pageview' || normValue(r['page type']) !== 'productpage') continue
    const n = count(r['counts'])
    d.page_views += n
    const src = (d.by_source[sourceLabel(r['source type'])] ??= { page_views: 0 })
    src.page_views += n
  }
  return days
}

// ── One row per day in app_store_daily ───────────────────────────────────────
// The two reports arrive separately, each with its own processing date. Apple:
// an instance with a later processingDate replaces an earlier one for the same
// Date, and the two must never be added together. So each half of a row keeps
// the processing date it came from, and only a same-or-later one may replace it.

export interface DayRow {
  day: string
  first_downloads: number
  redownloads: number
  downloads_by_source: Record<string, { first_downloads: number; redownloads: number }>
  downloads_processing_date: string | null
  page_views: number
  views_by_source: Record<string, { page_views: number }>
  views_processing_date: string | null
}

export const emptyDay = (day: string): DayRow => ({
  day,
  first_downloads: 0, redownloads: 0, downloads_by_source: {}, downloads_processing_date: null,
  page_views: 0, views_by_source: {}, views_processing_date: null,
})

export type ReportKind = 'downloads' | 'engagement'

export function mergeInstance(
  existing: Map<string, DayRow>,
  kind: ReportKind,
  days: Record<string, DownloadDay> | Record<string, ViewDay>,
  processingDate: string,
): DayRow[] {
  const changed: DayRow[] = []
  for (const [day, v] of Object.entries(days)) {
    const row = { ...(existing.get(day) ?? emptyDay(day)) }
    if (kind === 'downloads') {
      if (row.downloads_processing_date && row.downloads_processing_date > processingDate) continue
      const d = v as DownloadDay
      row.first_downloads = d.first_downloads
      row.redownloads = d.redownloads
      row.downloads_by_source = d.by_source
      row.downloads_processing_date = processingDate
    } else {
      if (row.views_processing_date && row.views_processing_date > processingDate) continue
      const d = v as ViewDay
      row.page_views = d.page_views
      row.views_by_source = d.by_source
      row.views_processing_date = processingDate
    }
    existing.set(day, row)
    changed.push(row)
  }
  return changed
}

// Report names come back as "<report> Standard" / "<report> Detailed", for
// example "App Store Discovery and Engagement Standard". Standard has no
// small-count thresholding or noise (Apple applies both to Detailed only),
// which is what an app this size needs.
export function reportKind(name: string): ReportKind | null {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n.endsWith(' standard')) return null
  if (n.startsWith('app store downloads')) return 'downloads'
  if (n.startsWith('app store discovery and engagement')) return 'engagement'
  return null
}

// ── The sync run ─────────────────────────────────────────────────────────────

export class AscError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Instance {
  id: string
  kind: ReportKind
  processingDate: string
  accessType: string
}

export interface SyncDeps {
  appId: string
  get: (pathOrUrl: string) => Promise<any>          // JSON:API GET; throws AscError on non-2xx
  post: (path: string, body: unknown) => Promise<any>
  download: (url: string) => Promise<Uint8Array>   // a presigned segment URL (valid 5 minutes)
  ingestedInstanceIds: () => Promise<Set<string>>
  loadDays: (days: string[]) => Promise<DayRow[]>
  saveDays: (rows: DayRow[]) => Promise<void>
  markIngested: (rec: {
    instance_id: string; report_kind: ReportKind; access_type: string; processing_date: string; days: number
  }) => Promise<void>
  log?: (msg: string) => void
  maxInstances?: number
}

export interface SyncResult {
  created: string[]           // report requests created this run ('ONGOING', 'ONE_TIME_SNAPSHOT')
  reportsFound: ReportKind[]
  instancesIngested: number
  daysWritten: number
  pending: number             // new instances left for the next run
  notes: string[]
}

// Every page of a JSON:API list. Apple returns links.next until the last page.
export async function getAll(get: SyncDeps['get'], first: string): Promise<any[]> {
  const out: any[] = []
  let url: string | undefined = first
  for (let guard = 0; url && guard < 50; guard++) {
    const page: any = await get(url)
    out.push(...(page?.data ?? []))
    url = page?.links?.next
  }
  return out
}

export function requestBody(appId: string, accessType: 'ONGOING' | 'ONE_TIME_SNAPSHOT') {
  return {
    data: {
      type: 'analyticsReportRequests',
      attributes: { accessType },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  }
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const log = deps.log ?? (() => {})
  const max = deps.maxInstances ?? 25
  const result: SyncResult = { created: [], reportsFound: [], instancesIngested: 0, daysWritten: 0, pending: 0, notes: [] }

  // 1. Report requests. Apple generates nothing until one exists.
  let requests = await getAll(deps.get, `/v1/apps/${deps.appId}/analyticsReportRequests?limit=200`)
  const live = requests.filter((r) =>
    r?.attributes?.accessType === 'ONGOING' && r?.attributes?.stoppedDueToInactivity !== true)
  if (live.length === 0) {
    try {
      const created = await deps.post('/v1/analyticsReportRequests', requestBody(deps.appId, 'ONGOING'))
      requests = [...requests, created.data]
      result.created.push('ONGOING')
      log('created ONGOING report request')
    } catch (e) {
      if (e instanceof AscError && e.status === 403) {
        throw new AscError(403,
          'Apple refused to create the report request (403). Creating it needs a Team API key with the Admin role. ' +
          'After the first successful run a Sales and Reports key is enough.')
      }
      throw e
    }
    // An ONGOING request only reports from now on. A one-time snapshot fills in
    // the days before it (Apple allows one per month), so the launch days count.
    try {
      const snap = await deps.post('/v1/analyticsReportRequests', requestBody(deps.appId, 'ONE_TIME_SNAPSHOT'))
      requests = [...requests, snap.data]
      result.created.push('ONE_TIME_SNAPSHOT')
      log('created ONE_TIME_SNAPSHOT report request')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.notes.push(`History snapshot not created: ${msg}`)
    }
  }

  // 2. The two reports we read, from every request (ongoing and snapshot).
  const reports: { id: string; kind: ReportKind; accessType: string }[] = []
  for (const req of requests) {
    if (!req?.id) continue
    for (const category of ['COMMERCE', 'APP_STORE_ENGAGEMENT']) {
      const list = await getAll(deps.get,
        `/v1/analyticsReportRequests/${req.id}/reports?filter[category]=${category}&limit=200`)
      for (const rep of list) {
        const kind = reportKind(rep?.attributes?.name ?? '')
        if (kind) reports.push({ id: rep.id, kind, accessType: req?.attributes?.accessType ?? '' })
      }
    }
  }
  result.reportsFound = Array.from(new Set(reports.map((r) => r.kind)))
  if (reports.length === 0) {
    result.notes.push('Apple has not generated the reports yet. The first ones take one to two days after the request.')
    return result
  }

  // 3. Daily instances not ingested yet, oldest processing date first, so a
  //    newer restatement of a day always lands after an older one.
  const done = await deps.ingestedInstanceIds()
  const fresh: Instance[] = []
  for (const rep of reports) {
    const list = await getAll(deps.get, `/v1/analyticsReports/${rep.id}/instances?filter[granularity]=DAILY&limit=200`)
    for (const inst of list) {
      const pd = inst?.attributes?.processingDate
      if (!inst?.id || typeof pd !== 'string' || done.has(inst.id)) continue
      fresh.push({ id: inst.id, kind: rep.kind, processingDate: pd, accessType: rep.accessType })
    }
  }
  fresh.sort((a, b) =>
    a.processingDate.localeCompare(b.processingDate) ||
    // On the same processing date, let the ongoing report win over the snapshot.
    (a.accessType === 'ONGOING' ? 1 : 0) - (b.accessType === 'ONGOING' ? 1 : 0) ||
    a.kind.localeCompare(b.kind))
  const batch = fresh.slice(0, max)
  result.pending = fresh.length - batch.length

  // 4. Download every segment of an instance, then write its days.
  for (const inst of batch) {
    const segments = await getAll(deps.get, `/v1/analyticsReportInstances/${inst.id}/segments?limit=200`)
    const rows: ReportRow[] = []
    for (const seg of segments) {
      const url = seg?.attributes?.url
      if (!url) continue
      const bytes = await deps.download(url)
      const size = seg?.attributes?.sizeInBytes
      if (typeof size === 'number' && size !== bytes.length) {
        throw new Error(`segment ${seg.id} of instance ${inst.id} is ${bytes.length} bytes, Apple says ${size}`)
      }
      rows.push(...parseReport(await gunzipText(bytes)))
    }
    const days = inst.kind === 'downloads'
      ? summarizeDownloads(rows, deps.appId)
      : summarizeEngagement(rows, deps.appId)
    const dayKeys = Object.keys(days)
    if (dayKeys.length > 0) {
      const existing = new Map((await deps.loadDays(dayKeys)).map((r) => [r.day, r] as [string, DayRow]))
      const changed = mergeInstance(existing, inst.kind, days, inst.processingDate)
      if (changed.length > 0) await deps.saveDays(changed)
      result.daysWritten += changed.length
    }
    await deps.markIngested({
      instance_id: inst.id, report_kind: inst.kind, access_type: inst.accessType,
      processing_date: inst.processingDate, days: dayKeys.length,
    })
    result.instancesIngested++
    log(`ingested ${inst.kind} ${inst.processingDate} (${dayKeys.length} days)`)
  }
  if (result.pending > 0) result.notes.push(`${result.pending} more report files will be read on the next run.`)
  return result
}
