import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import {
  makeAscToken, pemToPkcs8, gunzipText, parseReport, summarizeDownloads, summarizeEngagement,
  mergeInstance, reportKind, runSync, emptyDay, AscError, MAX_TOKEN_SECONDS,
  type DayRow, type SyncDeps,
} from '../supabase/functions/_shared/app-store-analytics.ts'

// The Pilot Dashboard's App Store rows (Oct 2026). Jacob's launch flyer QR goes
// straight to the App Store, so Apple's download numbers are the only record of
// what it did. Nothing here can be checked against Apple from a laptop, so these
// pin every rule from Apple's docs that the sync depends on.

const APP_ID = '6787771014'

// ── JWT ──────────────────────────────────────────────────────────────────────

async function testKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const b64 = Buffer.from(pkcs8).toString('base64').replace(/(.{64})/g, '$1\n')
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`
  return { pem, publicKey: pair.publicKey }
}

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

test('the token is an ES256 JWT with the header and claims Apple asks for', async () => {
  const { pem, publicKey } = await testKey()
  const token = await makeAscToken({ issuerId: 'issuer-123', keyId: 'KEY1234567', privateKey: pem }, 1_800_000_000)
  const [h, p, s] = token.split('.')
  assert.deepEqual(JSON.parse(fromB64url(h).toString()), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' })
  assert.deepEqual(JSON.parse(fromB64url(p).toString()), {
    iss: 'issuer-123', iat: 1_800_000_000, exp: 1_800_000_000 + 15 * 60, aud: 'appstoreconnect-v1',
  })
  // A JWS ES256 signature is the raw 64-byte r||s, and it must verify.
  const sig = fromB64url(s)
  assert.equal(sig.length, 64)
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, publicKey, sig, new TextEncoder().encode(`${h}.${p}`),
  )
  assert.equal(ok, true)
})

test('a token may not live longer than the 20 minutes Apple accepts', async () => {
  const { pem } = await testKey()
  await assert.rejects(makeAscToken({ issuerId: 'i', keyId: 'k', privateKey: pem }, 0, MAX_TOKEN_SECONDS + 1))
  await assert.doesNotReject(makeAscToken({ issuerId: 'i', keyId: 'k', privateKey: pem }, 0, MAX_TOKEN_SECONDS))
})

test('the .p8 key still reads when a secret tool mangled its newlines', async () => {
  const { pem } = await testKey()
  const clean = pemToPkcs8(pem)
  assert.deepEqual(pemToPkcs8(pem.replace(/\n/g, '\\n')), clean)  // literal \n
  assert.deepEqual(pemToPkcs8(pem.replace(/\n/g, ' ')), clean)    // newlines became spaces
  assert.deepEqual(pemToPkcs8(pem.replace(/-----[A-Z ]+-----/g, '')), clean)  // no BEGIN/END lines
  assert.throws(() => pemToPkcs8('  \n '))
})

// ── Files ────────────────────────────────────────────────────────────────────

// Columns exactly as Apple's "App Store Downloads" field list names them.
const DL_HEADER = ['Date', 'App Name', 'App Apple Identifier', 'Download Type', 'App Version', 'Device',
  'Platform Version', 'Source Type', 'Page Type', 'Pre-Order', 'Territory', 'Counts']
const dl = (date: string, type: string, source: string, counts: number | string, appId = APP_ID) =>
  [date, 'HereNow Social', appId, type, '1.0.0', 'iPhone', 'iOS 26.0', source, 'Product page', 'No', 'US', String(counts)]

// Columns as Apple's "App Store Discovery and Engagement" field list names them.
const EN_HEADER = ['Date', 'App Name', 'App Apple Identifier', 'Event', 'Page Type', 'Source Type',
  'Engagement Type', 'Device', 'Platform Version', 'Territory', 'Counts', 'Unique Counts']
const en = (date: string, event: string, pageType: string, source: string, counts: number) =>
  [date, 'HereNow Social', APP_ID, event, pageType, source, '', 'iPhone', 'iOS 26.0', 'US', String(counts), '1']

const tsv = (header: string[], rows: string[][]) =>
  [header, ...rows].map((r) => r.join('\t')).join('\n') + '\n'

test('a gzipped segment comes back as text, and a plain one passes through', async () => {
  const text = tsv(DL_HEADER, [dl('2026-10-15', 'First-time download', 'Web referrer', 3)])
  assert.equal(await gunzipText(new Uint8Array(gzipSync(text))), text)
  assert.equal(await gunzipText(new TextEncoder().encode(text)), text)
})

test('rows are read by column name: tabs, CRLF, a BOM and quotes all parse', () => {
  const text = '﻿Date\tApp Apple Identifier\tPage Title\tCounts\r\n' +
    '2026-10-15\t6787771014\t"Nashville, ""after dark"""\t4\r\n\r\n'
  const rows = parseReport(text)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    'date': '2026-10-15', 'app apple identifier': '6787771014', 'page title': 'Nashville, "after dark"', 'counts': '4',
  })
})

test('column order does not matter, and commas are a fallback when there are no tabs', () => {
  const shuffled = 'Counts\tDownload Type\tDate\n5\tFirst-time download\t2026-10-15\n'
  assert.equal(summarizeDownloads(parseReport(shuffled))['2026-10-15'].first_downloads, 5)
  const csv = 'Date,Download Type,Counts\n2026-10-15,"First-time download",2\n'
  assert.equal(summarizeDownloads(parseReport(csv))['2026-10-15'].first_downloads, 2)
  assert.deepEqual(parseReport(''), [])
})

// ── What gets counted ────────────────────────────────────────────────────────

test('downloads: new people and reinstalls are counted apart, updates and restores not at all', () => {
  const rows = parseReport(tsv(DL_HEADER, [
    dl('2026-10-15', 'First-time download', 'Web referrer', 3),
    dl('2026-10-15', 'FIRST-TIME DOWNLOAD', 'App Store search', 2),  // values are not case sensitive
    dl('2026-10-15', 'Redownload', 'Web referrer', 1),
    dl('2026-10-15', 'Auto-update', 'Unavailable', 40),
    dl('2026-10-15', 'Manual update', 'Unavailable', 7),
    dl('2026-10-15', 'Restore', 'Unavailable', 2),
    dl('2026-10-16', 'Auto-update', 'Unavailable', 9),                // only updates that day
    dl('2026-10-15', 'First-time download', 'Web referrer', 99, '1111111111'),  // another app
  ]))
  const days = summarizeDownloads(rows, APP_ID)
  assert.deepEqual(days['2026-10-15'], {
    first_downloads: 5,
    redownloads: 1,
    by_source: {
      'Web referrer': { first_downloads: 3, redownloads: 1 },
      'App Store search': { first_downloads: 2, redownloads: 0 },
    },
  })
  // A day Apple reported with only updates is written as zero new people,
  // so a restated day can drop back to zero instead of keeping an old number.
  assert.deepEqual(days['2026-10-16'], { first_downloads: 0, redownloads: 0, by_source: {} })
})

test('page views: only views of the product page, every view counted', () => {
  const rows = parseReport(tsv(EN_HEADER, [
    en('2026-10-15', 'Page view', 'Product page', 'Web referrer', 6),
    en('2026-10-15', 'Page View', 'Product Page', 'App Store search', 4),
    en('2026-10-15', 'Impression', 'No page', 'App Store search', 120),
    en('2026-10-15', 'Tap', 'Product page', 'App Store search', 3),
    en('2026-10-15', 'Page view', 'In-app event', 'App Store browse', 8),
    en('2026-10-15', 'Page view', 'Product page', '', 1),  // no source -> Unavailable
  ]))
  assert.deepEqual(summarizeEngagement(rows, APP_ID)['2026-10-15'], {
    page_views: 11,
    by_source: {
      'Web referrer': { page_views: 6 },
      'App Store search': { page_views: 4 },
      'Unavailable': { page_views: 1 },
    },
  })
})

test('a renamed column fails loudly instead of reading as zero', () => {
  const rows = parseReport('Date\tDownload Kind\tCounts\n2026-10-15\tFirst-time download\t3\n')
  assert.throws(() => summarizeDownloads(rows), /missing column\(s\) download type/)
  assert.throws(() => summarizeEngagement(parseReport('Date\tCounts\n2026-10-15\t3\n')), /event, page type/)
})

test('only the Standard reports are read; Detailed ones hide counts under five', () => {
  assert.equal(reportKind('App Store Downloads Standard'), 'downloads')
  assert.equal(reportKind('App Store Discovery and Engagement Standard'), 'engagement')
  assert.equal(reportKind('app store discovery and engagement  standard'), 'engagement')
  assert.equal(reportKind('App Store Downloads Detailed'), null)
  assert.equal(reportKind('App Store Discovery and Engagement Detailed'), null)
  assert.equal(reportKind('App Sessions Standard'), null)
})

// ── Restatements ─────────────────────────────────────────────────────────────

test('a later report file replaces a day; it is never added to the earlier one', () => {
  const rows = new Map<string, DayRow>()
  const day = (n: number) => ({ '2026-10-15': { first_downloads: n, redownloads: 0, by_source: { 'Web referrer': { first_downloads: n, redownloads: 0 } } } })
  mergeInstance(rows, 'downloads', day(2), '2026-10-16')  // partial
  mergeInstance(rows, 'downloads', day(3), '2026-10-17')  // complete
  assert.equal(rows.get('2026-10-15')!.first_downloads, 3)
  assert.equal(rows.get('2026-10-15')!.downloads_processing_date, '2026-10-17')
  // An older file arriving late changes nothing.
  assert.deepEqual(mergeInstance(rows, 'downloads', day(9), '2026-10-16'), [])
  assert.equal(rows.get('2026-10-15')!.first_downloads, 3)
})

test('downloads and page views come from separate reports and never overwrite each other', () => {
  const rows = new Map<string, DayRow>()
  mergeInstance(rows, 'downloads', { '2026-10-15': { first_downloads: 4, redownloads: 1, by_source: {} } }, '2026-10-17')
  mergeInstance(rows, 'engagement', { '2026-10-15': { page_views: 12, by_source: {} } }, '2026-10-16')
  assert.deepEqual(rows.get('2026-10-15'), {
    ...emptyDay('2026-10-15'),
    first_downloads: 4, redownloads: 1, downloads_processing_date: '2026-10-17',
    page_views: 12, views_processing_date: '2026-10-16',
  })
})

// ── The whole run, against a fake Apple ──────────────────────────────────────

interface FakeApple {
  requests: any[]
  reports: Record<string, { id: string; name: string; category: string }[]>         // by request id
  instances: Record<string, { id: string; processingDate: string }[]>               // by report id
  segments: Record<string, { url: string; body: string; size?: number }[]>          // by instance id
  posts: any[]
  failPost?: (accessType: string) => AscError | null
}

function deps(apple: FakeApple, opts: { ingested?: string[]; max?: number } = {}) {
  const db = new Map<string, DayRow>()
  const ingested = new Set(opts.ingested ?? [])
  const files = new Map<string, Uint8Array>()
  for (const segs of Object.values(apple.segments)) {
    for (const s of segs) files.set(s.url, new Uint8Array(gzipSync(s.body)))
  }
  const page = (data: any[], url: string) => {
    // Two items per page, so pagination is exercised everywhere.
    const u = new URL(url, 'https://x')
    const start = Number(u.searchParams.get('cursor') ?? 0)
    u.searchParams.set('cursor', String(start + 2))
    return { data: data.slice(start, start + 2), links: start + 2 < data.length ? { next: u.pathname + u.search } : {} }
  }
  const d: SyncDeps = {
    appId: APP_ID,
    maxInstances: opts.max,
    get: async (raw) => {
      // Apple's links.next URLs encode the brackets (filter%5Bgranularity%5D), as
      // in its own examples. The sync passes them through untouched.
      const path = decodeURIComponent(raw)
      let m
      if ((m = /^\/v1\/apps\/(\d+)\/analyticsReportRequests/.exec(path))) {
        assert.equal(m[1], APP_ID)
        return page(apple.requests, path)
      }
      if ((m = /^\/v1\/analyticsReportRequests\/([^/]+)\/reports\?filter\[category\]=([A-Z_]+)/.exec(path))) {
        const list = (apple.reports[m[1]] ?? []).filter((r) => r.category === m![2])
        return page(list.map((r) => ({ id: r.id, attributes: { name: r.name, category: r.category } })), path)
      }
      if ((m = /^\/v1\/analyticsReports\/([^/]+)\/instances\?filter\[granularity\]=DAILY/.exec(path))) {
        const list = apple.instances[m[1]] ?? []
        return page(list.map((i) => ({ id: i.id, attributes: { granularity: 'DAILY', processingDate: i.processingDate } })), path)
      }
      if ((m = /^\/v1\/analyticsReportInstances\/([^/]+)\/segments/.exec(path))) {
        const list = apple.segments[m[1]] ?? []
        return page(list.map((s, i) => ({
          id: `${m![1]}-seg${i}`,
          attributes: { url: s.url, sizeInBytes: s.size ?? files.get(s.url)!.length, checksum: 'x' },
        })), path)
      }
      throw new Error(`unexpected GET ${path}`)
    },
    post: async (path, body: any) => {
      assert.equal(path, '/v1/analyticsReportRequests')
      const accessType = body.data.attributes.accessType
      const err = apple.failPost?.(accessType)
      if (err) throw err
      apple.posts.push(body)
      const created = { id: `req-${accessType}`, attributes: { accessType, stoppedDueToInactivity: false } }
      return { data: created }
    },
    download: async (url) => files.get(url)!,
    ingestedInstanceIds: async () => new Set(ingested),
    loadDays: async (days) => days.filter((x) => db.has(x)).map((x) => db.get(x)!),
    saveDays: async (rows) => { for (const r of rows) db.set(r.day, r) },
    markIngested: async (rec) => { ingested.add(rec.instance_id) },
  }
  return { d, db, ingested }
}

const DL_STD = 'App Store Downloads Standard'
const EN_STD = 'App Store Discovery and Engagement Standard'

test('first run: makes the ongoing request and a history snapshot, then waits for Apple', async () => {
  const apple: FakeApple = { requests: [], reports: {}, instances: {}, segments: {}, posts: [] }
  const { d } = deps(apple)
  const r = await runSync(d)
  assert.deepEqual(r.created, ['ONGOING', 'ONE_TIME_SNAPSHOT'])
  // The exact body from Apple's "Request Reports" example.
  assert.deepEqual(apple.posts[0], {
    data: {
      type: 'analyticsReportRequests',
      attributes: { accessType: 'ONGOING' },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  })
  assert.equal(r.instancesIngested, 0)
  assert.match(r.notes.join(' '), /one to two days/)
})

test('a request stopped for inactivity is replaced; a live one is reused', async () => {
  const stopped: FakeApple = {
    requests: [{ id: 'old', attributes: { accessType: 'ONGOING', stoppedDueToInactivity: true } }],
    reports: {}, instances: {}, segments: {}, posts: [],
  }
  assert.deepEqual((await runSync(deps(stopped).d)).created, ['ONGOING', 'ONE_TIME_SNAPSHOT'])
  const live: FakeApple = {
    requests: [{ id: 'cur', attributes: { accessType: 'ONGOING', stoppedDueToInactivity: false } }],
    reports: {}, instances: {}, segments: {}, posts: [],
  }
  assert.deepEqual((await runSync(deps(live).d)).created, [])
  assert.equal(live.posts.length, 0)
})

test('a key without the Admin role gets a message that says so', async () => {
  const apple: FakeApple = {
    requests: [], reports: {}, instances: {}, segments: {}, posts: [],
    failPost: () => new AscError(403, 'POST /v1/analyticsReportRequests -> 403 FORBIDDEN_ERROR'),
  }
  await assert.rejects(runSync(deps(apple).d), /Admin role/)
})

test('if the monthly snapshot is refused, the ongoing request still stands', async () => {
  const apple: FakeApple = {
    requests: [], reports: {}, instances: {}, segments: {}, posts: [],
    failPost: (t) => (t === 'ONE_TIME_SNAPSHOT' ? new AscError(409, 'one snapshot per month') : null),
  }
  const r = await runSync(deps(apple).d)
  assert.deepEqual(r.created, ['ONGOING'])
  assert.match(r.notes.join(' '), /snapshot not created.*one snapshot per month/)
})

function liveApple(): FakeApple {
  return {
    requests: [
      { id: 'ongoing', attributes: { accessType: 'ONGOING', stoppedDueToInactivity: false } },
      { id: 'snap', attributes: { accessType: 'ONE_TIME_SNAPSHOT', stoppedDueToInactivity: false } },
    ],
    reports: {
      ongoing: [
        { id: 'r-dl', name: DL_STD, category: 'COMMERCE' },
        { id: 'r-dl-detail', name: 'App Store Downloads Detailed', category: 'COMMERCE' },
        { id: 'r-purch', name: 'App Store Purchases Standard', category: 'COMMERCE' },
        { id: 'r-en', name: EN_STD, category: 'APP_STORE_ENGAGEMENT' },
      ],
      snap: [{ id: 's-dl', name: DL_STD, category: 'COMMERCE' }],
    },
    instances: {
      'r-dl': [
        { id: 'i-dl-17', processingDate: '2026-10-17' },
        { id: 'i-dl-16', processingDate: '2026-10-16' },
        { id: 'i-dl-18', processingDate: '2026-10-18' },
      ],
      'r-en': [{ id: 'i-en-17', processingDate: '2026-10-17' }],
      's-dl': [{ id: 'i-snap', processingDate: '2026-10-16' }],
      'r-dl-detail': [{ id: 'i-detail', processingDate: '2026-10-18' }],
    },
    segments: {
      // Launch week, from the history snapshot.
      'i-snap': [{ url: 'https://s3/snap.gz', body: tsv(DL_HEADER, [
        dl('2026-10-14', 'First-time download', 'App Store search', 2),
        dl('2026-10-15', 'First-time download', 'Web referrer', 1),
      ]) }],
      // Same processing date as the snapshot: the ongoing file wins for 10-15.
      'i-dl-16': [{ url: 'https://s3/16.gz', body: tsv(DL_HEADER, [
        dl('2026-10-15', 'First-time download', 'Web referrer', 2),
      ]) }],
      // Restates 10-15 (now complete) and starts 10-16. Split over two segments.
      'i-dl-17': [
        { url: 'https://s3/17a.gz', body: tsv(DL_HEADER, [dl('2026-10-15', 'First-time download', 'Web referrer', 4)]) },
        { url: 'https://s3/17b.gz', body: tsv(DL_HEADER, [dl('2026-10-16', 'Redownload', 'Unavailable', 1)]) },
      ],
      'i-dl-18': [{ url: 'https://s3/18.gz', body: tsv(DL_HEADER, [
        dl('2026-10-16', 'First-time download', 'App Store browse', 3),
        dl('2026-10-17', 'First-time download', 'Web referrer', 1),
      ]) }],
      'i-en-17': [{ url: 'https://s3/en17.gz', body: tsv(EN_HEADER, [
        en('2026-10-15', 'Page view', 'Product page', 'Web referrer', 9),
        en('2026-10-16', 'Page view', 'Product page', 'App Store search', 5),
      ]) }],
      'i-detail': [{ url: 'https://s3/detail.gz', body: 'never read' }],
    },
    posts: [],
  }
}

test('a full run reads every new file once, oldest first, and lands on the latest numbers', async () => {
  const apple = liveApple()
  const { d, db, ingested } = deps(apple)
  const r = await runSync(d)
  assert.deepEqual(r.created, [])
  assert.deepEqual(r.reportsFound.sort(), ['downloads', 'engagement'])
  assert.equal(r.instancesIngested, 5)  // the Detailed report is never touched
  assert.equal(ingested.has('i-detail'), false)

  assert.equal(db.get('2026-10-14')!.first_downloads, 2)                      // only in the snapshot
  assert.equal(db.get('2026-10-15')!.first_downloads, 4)                      // 1, then 2, then 4: replaced, never summed
  assert.equal(db.get('2026-10-15')!.page_views, 9)
  assert.deepEqual(db.get('2026-10-16')!, {
    ...emptyDay('2026-10-16'),
    first_downloads: 3, redownloads: 0,                                          // the 10-18 file restated 10-16
    downloads_by_source: { 'App Store browse': { first_downloads: 3, redownloads: 0 } },
    downloads_processing_date: '2026-10-18',
    page_views: 5, views_by_source: { 'App Store search': { page_views: 5 } }, views_processing_date: '2026-10-17',
  })
  assert.equal(db.get('2026-10-17')!.first_downloads, 1)

  // Nothing new on the next run: no file is read twice.
  const again = await runSync(d)
  assert.equal(again.instancesIngested, 0)
  assert.equal(again.daysWritten, 0)
})

test('a backlog is read a few files per run, oldest first, so one run never overruns', async () => {
  const apple = liveApple()
  const { d, db } = deps(apple, { max: 2 })
  const first = await runSync(d)
  assert.equal(first.instancesIngested, 2)
  assert.equal(first.pending, 3)
  assert.match(first.notes.join(' '), /3 more report files/)
  // Oldest processing date first: the two 10-16 files, snapshot before ongoing.
  assert.equal(db.get('2026-10-15')!.first_downloads, 2)
  await runSync(d)
  await runSync(d)
  assert.equal(db.get('2026-10-15')!.first_downloads, 4)
  assert.equal((await runSync(d)).pending, 0)
})

test('a segment that arrives short is an error, not a smaller number', async () => {
  const apple = liveApple()
  apple.segments['i-snap'][0].size = 999_999
  await assert.rejects(runSync(deps(apple).d), /Apple says 999999/)
})
