# Geofence Reliability Audit (Jul 28, 2026)

First pass of the geofencing reliability review. Covers the full path: client
location handling, the PostGIS RPC, the radius fallback, the multi-read
verification, and the eviction/hysteresis rules.

## The path, end to end

1. **Check-in** (`app/check-in/[zoneId].tsx` -> `SessionContext.checkIn` -> `lib/sessions.checkIn`): `getBestCoords` samples GPS up to 15s and takes the tightest fix; an accuracy gate (`MAX_CHECKIN_ACCURACY_M = 60`, soft band to 90 if the center is inside) rejects fuzzy fixes; then `checkUserInZone(..., checkinMargin)` calls the PostGIS RPC.
2. **Presence keep-alive / eviction** (`SessionContext.verifyPresenceOrCheckout` on a 3-min timer + on foreground -> `lib/sessions.verifyZonePresence`): re-samples GPS, same accuracy bar, `checkUserInZone(..., presenceMargin)`, maps to a reading, and folds it into a strike count.
3. **Background exit** (`hooks/useGeofenceTask.ts`): the OS geofence is a ~150m wake ring only. On Exit it re-verifies with an accuracy-gated fix before checkout; on Enter it just marks presence. It never decides containment on its own.
4. **PostGIS** (`supabase/geofence_margin.sql`, current live `user_in_zone`): polygon-first `ST_DWithin(building_polygon, pt, margin_m)` on geography (boundary-inclusive, true meters, concave-safe), radius fallback `ST_DWithin(center, pt, radius + margin_m)`.
5. **Per-venue tuning** (`zones.checkin_margin_m` / `presence_margin_m`, #215): `getZoneMargins` overrides the global `CHECKIN_MARGIN_M = 15` / `PRESENCE_MARGIN_M = 30`.

## Edge-case matrix

| Case | Current behavior | Verdict |
|---|---|---|
| Stationary inside, noisy GPS | inside reads, strikes stay 0 | OK (tested) |
| Stationary at the wall, jitter crosses boundary | within 30m presence margin -> inside | OK (tested) |
| Pacing across the boundary (flapping) | stays within presence margin -> no flap | OK (tested) |
| Single outside spike then back | strike resets on inside | OK (tested) |
| Genuinely walked out (>30m) | 2 consecutive outside -> evict | OK (tested) |
| Degraded accuracy (>60m) | untrusted -> unknown -> never evict | OK (tested) |
| **RPC / DB error mid-presence** | **was: false -> outside -> could evict** | **FIXED** |
| Adjacent/nearby venue | containment is per active zone; carousel is by `session.zone_id`, not live GPS | OK (tested); see radius note |
| Concave / L-shaped footprint | geography `ST_DWithin` is concave-correct | OK (tested) |
| Check-in edge tolerance vs false check-in | 15m in / 30m out hysteresis band | OK (tested) |
| Cold GPS fix on old iPhones | `getBestCoords` waits up to 15s for convergence | OK (pre-existing) |
| Background OS Exit while still inside | re-verifies with an accuracy-gated fix; checks out ONLY on confirmed 'outside' | OK (rule named + tested) |
| Multi-part venue (patio + interior) | `building_polygon` was single POLYGON | FIXED via `geofence_hardening.sql` (generic geography) |
| Invalid OSM polygon (self-intersecting) | no repair on insert | FIXED via `geofence_hardening.sql` (ST_MakeValid trigger) |
| Wide default fallback radius | `auto_approve_venue` defaults 75m | Recommendation (see below) |

## What changed (this pass)

- **False-eviction on a server error is fixed.** `checkUserInZone` now returns `boolean | null` (`null` when the RPC itself fails) instead of collapsing an error to `false`. The presence verifier maps `null` to `'unknown'`, which never evicts. This is the exact class of bug called out in `fix_user_in_zone_srid.sql` (an SRID error once booted people); now *any* transient RPC error is safe.
- **The eviction rule lives in one tested place.** `lib/presence.ts` (`applyPresenceReading`, `presenceFromFix`, `EVICT_STRIKES`) is pure and imported by both `sessions.ts` and `SessionContext.tsx`. The rule (2 consecutive confirmed-outside reads; inside/unknown reset; unknown never evicts) can no longer be changed by accident without a test noticing.
- **Presence check-in no longer wastes an RPC on an untrusted fix** and treats a genuine RPC error as unknown.
- **The background auto-checkout rule is named and test-locked.** `useGeofenceTask` now calls `shouldBackgroundCheckout(presence)` (only `'outside'` checks out); a future edit can't regress it into booting on `'unknown'`. Its containment decision already runs through the same tested `verifyZonePresence`.
- **Server-side hardening is applied** in `supabase/geofence_hardening.sql`: `building_polygon` widened to generic geography (multi-part venues) + a repair-on-write trigger (`ST_MakeValid`), with no RPC or `user_in_zone` change. Run it once, then re-run `geofence_tests.sql`.

## What was tested, and how

Zero-dependency harness runnable with `npm test` (Node's built-in test runner, native TypeScript):

- `test/presence.test.ts` - unit tests for the eviction rule and the trust gate.
- `test/geo-model.ts` - a model of the PostGIS containment semantics (haversine, ray-cast point-in-polygon, distance-to-polygon) plus a seeded, noisy GPS-trace simulator.
- `test/geofence-sim.test.ts` - end-to-end simulated traces asserting the matrix above (no false eviction, no flapping, degraded-accuracy safety, RPC-error safety, real-departure eviction timing, adjacent-venue non-bleed, concave handling, edge tolerance, radius fallback).
- `supabase/geofence_tests.sql` - server-side assertions (run in Supabase; writes nothing, raises on failure) proving boundary-inclusive containment, the two margins, clearly-outside rejection, and concave correctness on real PostGIS.

32 client tests pass; app `tsc --noEmit` is clean.

## Server-side hardening (migration provided)

`supabase/geofence_hardening.sql` is written to be run once in Supabase. It is
constructed to be low-risk and idempotent, and it changes no RPC body and no
`user_in_zone` logic:

1. **Widen `building_polygon` to generic `geography`** so multi-part footprints
   (patio + interior) are allowed. Generic geography accepts both polygons and
   multipolygons, so the existing insert RPCs keep working with no type-mismatch.
2. **Repair-on-write trigger** (`ST_MakeValid` + `ST_CollectionExtract(...,3)`) so
   a self-intersecting/invalid OSM outline can never reach the containment check.
3. **Coverage query** listing active venues with no polygon (circle fallback).

Still a recommendation, not in the migration: **tighten the 75m default fallback
radius** in `auto_approve_venue` (change the `p_radius int DEFAULT 75` default to
~30-40m). Left out to avoid reproducing the RPC body; it only affects venues
approved with neither an explicit radius nor a polygon.

## Confidence + open items

Confident (closed in code + tests): the entire client-side decision path. No
false eviction (server error, bad accuracy, jitter, spikes, flapping, cold-fix
warm-up, phone-in-pocket), correct real-departure timing, adjacent-venue
non-bleed, concave footprints, edge tolerance, and the background auto-checkout
rule. Covered by the harness (`npm test`, 32 passing) and, on the server, by the
PostGIS assertion script.

Server side is confirmed on production (Jul 29, 2026): `geofence_tests.sql` ran
green ("all assertions passed") and `geofence_hardening.sql` was applied
(building_polygon widened to generic geography, repair trigger installed). The
coverage query returned no rows, so no active venue is on the circle fallback.

One thing genuinely cannot be closed from code. It needs a phone:

- **OS background-delivery timing.** The background decision is tested, but
  whether iOS actually fires the geofence Exit event promptly and delivers a fix
  in the background window (phone in pocket, app killed) is a real-device test.
  Do one walk-out at a venue with the app closed.

Still worth doing before soft launch: **margin tuning** (confirm 15m/30m against
the real venue buildings; per-venue tune via #215) and keeping **polygon
coverage** at 100% as venues are added (re-run the coverage query). Still a
recommendation, not applied: tighten the 75m default fallback radius in
`auto_approve_venue`.
```
