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
| Multi-part venue (patio + interior) | `building_polygon` is single POLYGON | **Recommendation below** |
| Invalid OSM polygon (self-intersecting) | no `ST_MakeValid` on insert | **Recommendation below** |
| Wide default fallback radius | `auto_approve_venue` defaults 75m | **Recommendation below** |

## What changed (this pass)

- **False-eviction on a server error is fixed.** `checkUserInZone` now returns `boolean | null` (`null` when the RPC itself fails) instead of collapsing an error to `false`. The presence verifier maps `null` to `'unknown'`, which never evicts. This is the exact class of bug called out in `fix_user_in_zone_srid.sql` (an SRID error once booted people); now *any* transient RPC error is safe.
- **The eviction rule lives in one tested place.** `lib/presence.ts` (`applyPresenceReading`, `presenceFromFix`, `EVICT_STRIKES`) is pure and imported by both `sessions.ts` and `SessionContext.tsx`. The rule (2 consecutive confirmed-outside reads; inside/unknown reset; unknown never evicts) can no longer be changed by accident without a test noticing.
- **Presence check-in no longer wastes an RPC on an untrusted fix** and treats a genuine RPC error as unknown.

## What was tested, and how

Zero-dependency harness runnable with `npm test` (Node's built-in test runner, native TypeScript):

- `test/presence.test.ts` - unit tests for the eviction rule and the trust gate.
- `test/geo-model.ts` - a model of the PostGIS containment semantics (haversine, ray-cast point-in-polygon, distance-to-polygon) plus a seeded, noisy GPS-trace simulator.
- `test/geofence-sim.test.ts` - end-to-end simulated traces asserting the matrix above (no false eviction, no flapping, degraded-accuracy safety, RPC-error safety, real-departure eviction timing, adjacent-venue non-bleed, concave handling, edge tolerance, radius fallback).
- `supabase/geofence_tests.sql` - server-side assertions (run in Supabase; writes nothing, raises on failure) proving boundary-inclusive containment, the two margins, clearly-outside rejection, and concave correctness on real PostGIS.

26 client tests pass; app `tsc --noEmit` is clean.

## Recommended server-side hardening (review + test before running)

I could not execute PostGIS in this environment, so these are proposed, not applied. Test on a staging copy first.

1. **Repair OSM polygons on insert** (guards against self-intersecting/invalid geometry giving wrong containment). In `admin_setup_zone` and `auto_approve_venue`, replace `ST_GeogFromText(p_polygon_wkt)` with:
   ```sql
   ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeogFromText(p_polygon_wkt)::geometry), 3))::geography
   ```
2. **Support multi-part venues** (patio + interior, upstairs/downstairs). Change the column and let `user_in_zone` keep working unchanged (`ST_DWithin` accepts multipolygons):
   ```sql
   ALTER TABLE zones
     ALTER COLUMN building_polygon TYPE geography(MULTIPOLYGON,4326)
     USING ST_Multi(building_polygon::geometry)::geography;
   ```
   (Judgment call: a schema migration. Do it only if multi-part venues are actually needed for the soft launch.)
3. **Tighten the default fallback radius.** `auto_approve_venue` defaults to 75m, which is wide for dense blocks and is the main adjacent-venue-bleed risk for venues with no polygon. Prefer a real polygon at approval; if a circle is unavoidable, default to ~30-40m.

## Honest open items (not yet closed)

- **Background-task GPS reliability.** `verifyZonePresence` uses `getBestCoords` (a brief watch). In a headless background task, watch behavior differs by OS/device and is hard to simulate; this needs real-device testing (backgrounded, phone in pocket) at Martha's, not just the simulator.
- **PostGIS assertions are unrun here.** `supabase/geofence_tests.sql` is written to be correct but has not been executed against a live PostGIS in this pass. Run it once in Supabase to confirm.
- **Polygon coverage.** The strongest guarantee (no adjacent-venue bleed, tight edges) comes from every venue having a real footprint polygon. Coverage of the actual soft-launch venues should be verified.
- **Real-world margin tuning.** The 15m/30m defaults are reasonable but should be confirmed against the actual Martha's building, then per-venue tuned where needed (the #215 control).
```
