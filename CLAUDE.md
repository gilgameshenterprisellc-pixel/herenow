# HereNow — Claude Code Project Context

## What HereNow Is

A location-aware social layer for the real world. Users check into venues (zones), set their Social Mode and Mood, see who else is there right now, and connect IRL via the We Met handshake system which unlocks DMs.

**NOT a dating app. NOT a feed app. An IRL presence layer.**

Repo: `gilgameshenterprisellc-pixel/herenow`
Owner: Joshua Bostic (Gilgamesh Enterprise LLC)
Partner: Jacob (practice venue run in progress)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Expo SDK 52 + Expo Router v4 |
| Language | TypeScript |
| UI | React Native 0.76, React 18 |
| Database | Supabase (PostgreSQL + PostGIS) |
| Realtime | Supabase Realtime (chat, pulse, notifications) |
| Location | expo-location + expo-task-manager (background geofencing) |
| Storage | AsyncStorage (onboarding seen state, session prefs) |
| Maps | react-native-maps 1.14.0 |

---

## SDK Strategy — Important Note

**Current:** Expo SDK 52 — compatible with the **stable Expo Go app** (no extra installs). Anyone with Expo Go can scan a QR and run. This is intentional for Jacob's practice venue run — lowest friction for testers.

**Future (app store):** When ready to submit to Google Play and Apple App Store, we need to:
1. Upgrade to the latest Expo SDK (likely 53+)
2. Switch to **EAS Build** (Expo Application Services) — produces a real signed APK/IPA
3. Remove the Expo Go dependency entirely — real app installs via the stores like any other app
4. Add push notification credentials (FCM for Android, APNs for iOS) via EAS
5. Configure `app.json` with real bundle IDs, signing certs, store metadata

The upgrade is a 1-2 day process when the time comes. Do not start until Jacob's test run is complete and the core features are validated on real hardware.

---

## Core Concepts

- **Zone** — a venue (bar, coffee shop, event space) with a GPS center + radius in meters
- **Session** — a check-in. User picks Social Mode + Mood Mode on entry.
- **Social Mode** — Dating / Friends / Networking / Just Vibes (why you're out)
- **Mood Mode** — Open / Selective / Not Today (how approachable you are)
- **Pulse Post** — ephemeral in-venue post, visible only to checked-in users, expires in 12h
- **Venue Chat** — ephemeral 24h group chat for everyone checked in, via Supabase Realtime
- **We Met** — mutual IRL confirmation (both tap). Unlocks 72h DMs. Expires 4h after either leaves.
- **Afterglow** — auto-generated recap when user checks out (duration, people count, connections)
- **Heat Bar** — visual busyness indicator (how many active sessions in zone right now)

---

## Database (Supabase)

**Schema files (must be applied in order):**
1. `supabase/schema.sql` — Phase 1: profiles, zones, zone_members, zone_posts, post_likes, post_comments, `zones_near()` RPC, `user_in_zone()` RPC
2. `supabase/phase2.sql` — Phase 2: sessions, pulse_posts, venue_chat, we_met, direct_messages, afterglow, badges, user_badges, venue_events, event_rsvps, notifications, `active_sessions_in_zone()` RPC
3. `supabase/safety.sql` — safety_reports, user_blocks

**Status: SQL has NOT been applied to the live Supabase project yet.** This is the first thing that must happen before any real device testing. Apply all 3 files in order via the Supabase SQL editor.

Supabase project: `https://orxtyreipavkrdiycpht.supabase.co`

**RLS:** Enabled on every table. Do not bypass.

**Realtime enabled on:** venue_chat, pulse_posts, sessions, we_met, direct_messages, notifications

---

## Known TypeScript Patterns

- Supabase join returns arrays for related tables, but our types expect single objects. Cast with `as unknown as TargetType[]` when Supabase join is used.
- `supabase.rpc()` returns `PostgrestFilterBuilder` — do NOT call `.catch()` on it. Use `const { error } = await rpc(...)` + `if (error)` pattern.
- `expo-task-manager` background tasks must be defined at module root (not inside components).

---

## What's Built (MVP Scope)

All V1 features are coded. No V2/V3 scope creep in the codebase.

**Screens (17):** Auth (login/signup), Nearby map, Feed, Notifications, Profile, Edit Profile, Zone Detail (4 tabs: People/Pulse/Chat/Events), Check-In, We Met, Messages list, DM thread, Afterglow, Badges, Create Venue, Create Event

**Components:** ZoneCard, PersonCard, PostCard, PulsePostCard, ChatMessage, DmBubble, WemetCard, EventCard, BadgeCard, MoodBadge, SocialModeBadge, HeatBar, ExpiryLabel, OnboardingModal

**Libraries:** zones, sessions, posts, pulse, chat, messages, weMet, notifications, badges, blocks, reports, events

---

## What's Still Needed for Jacob's Test Run

In priority order:

1. **Apply SQL to Supabase** — nothing works until the 3 SQL files are run
2. **Seed one venue** — insert a row into `zones` manually in Supabase SQL editor
3. **Profile photos** — image picker + Supabase Storage upload. People list shows initials only right now. Needs `avatars` Storage bucket + upload route.
4. **Push notifications** — expo-notifications package, Expo Push Service (free). Without it, We Met requests and DM notifications are invisible.
5. **Real device testing** — GPS and geofencing behavior cannot be validated in simulator. Must run on actual Android/iOS hardware.

**Already done (no SQL required):**
- SDK 52 downgrade (Expo Go compatible)
- Map view with dark tiles, venue pins, geofence circles
- Onboarding modal (5 slides: Welcome, Social Mode, Mood Mode, We Met, Afterglow)

---

## Seeding a Test Venue (SQL)

Run this in Supabase SQL editor after applying the schema:

```sql
INSERT INTO zones (name, description, center, radius_meters, created_by)
VALUES (
  'Test Venue',
  'First HereNow test venue for Jacob''s run',
  ST_GeomFromText('POINT(-86.1581 39.7684)', 4326),  -- replace with actual lng/lat
  200,
  (SELECT id FROM profiles LIMIT 1)  -- replace with actual user id after first signup
);
```

---

## Coding Rules

- Mobile first always — 44px min touch targets, safe area insets
- No hardcoded user IDs or zone IDs — always fetch from context/auth
- RLS is enforced — never bypass or disable it
- Realtime subscriptions must be cleaned up in `useEffect` returns
- Background geofencing: task defined at module root in `hooks/useGeofenceTask.ts`
- Do not add V2/V3 features (venue claiming, premium DMs, Stripe, analytics) until V1 is validated
