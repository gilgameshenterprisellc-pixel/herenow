# HereNow — Claude Code Project Context

## What HereNow Is

A location-aware social layer for the real world. Users check into venues (zones), set their Social Mode and Mood, see who else is there right now, and connect IRL via the We Met handshake system which unlocks DMs.

**NOT a dating app. NOT a feed app. An IRL presence layer.**

Repo: `gilgameshenterprisellc-pixel/herenow`
Live preview: `herenow-pi.vercel.app`
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
| Animations | React Native `Animated` API (orbs, pill spring) + react-native-reanimated (entrance) |
| Storage | AsyncStorage (onboarding seen state, session prefs) |
| Maps | react-native-maps 1.14.0 |

---

## SDK Strategy — Important Note

**Current:** Expo SDK 52 — compatible with the **stable Expo Go app** (no extra installs). Anyone with Expo Go can scan a QR and run. This is intentional for Jacob's practice venue run — lowest friction for testers.

**Future (app store):** When ready to submit to Google Play and Apple App Store:
1. Upgrade to the latest Expo SDK (likely 53+)
2. Switch to **EAS Build** (Expo Application Services) — produces a real signed APK/IPA
3. Remove the Expo Go dependency entirely — real app installs via the stores like any other app
4. Add push notification credentials (FCM for Android, APNs for iOS) via EAS
5. Configure `app.json` with real bundle IDs, signing certs, store metadata

The upgrade is a 1-2 day process when the time comes. Do not start until Jacob's test run is complete and the core features are validated on real hardware.

react-native-maps is currently **shimmed for web** (web gets a placeholder). The real map component is backed up as `NearbyMap.tsx.bak` and will be restored when EAS native build starts.

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

## What's Built — Full Inventory (as of June 21, 2026)

### Screens (22 files)

| File | What it does |
|---|---|
| `app/(auth)/login.tsx` | Premium electric auth — animated neon orb bloom clusters, glowing card, Person/Venue toggle with `onLayout` pixel-perfect pill |
| `app/(auth)/signup.tsx` | Premium electric auth — same orb design, Person fields (displayName/username/email/pw), Venue fields (name/type pill grid/email/pw), no zone insert on signup |
| `app/(tabs)/index.tsx` | Nearby map tab — dark tile map, venue pins, geofence circles |
| `app/(tabs)/feed.tsx` | Global feed tab |
| `app/(tabs)/notifications.tsx` | Notifications tab |
| `app/(tabs)/profile.tsx` | Profile tab |
| `app/profile/edit.tsx` | Full profile editor — display name, bio, age range (pill selector), 16 interest tags (grid), kickoff prompt (templates + free text), avatar upload (web only via Supabase Storage), routes to `/(tabs)` on save |
| `app/zone/[id].tsx` | Zone detail — 4 tabs: People / Pulse / Chat / Events |
| `app/zone/create.tsx` | Create a new venue zone |
| `app/zone/event/create.tsx` | Create an event inside a zone |
| `app/check-in/[zoneId].tsx` | Check-in flow — Social Mode + Mood Mode selection |
| `app/we-met.tsx` | We Met mutual handshake screen |
| `app/messages/index.tsx` | DM thread list |
| `app/messages/[wemetId].tsx` | DM thread view |
| `app/afterglow/[sessionId].tsx` | Post-checkout recap (duration, people, connections) |
| `app/badges.tsx` | Badges collection screen |
| `app/venue/dashboard.tsx` | Venue owner dashboard — live check-in counter (pulsing dot), aggregate age range bars, top interest tags, quick actions (Edit / Add Event / Share QR / Analytics), edit button → `/venue/edit` |
| `app/venue/edit.tsx` | Venue setup/edit — GPS "Use My Location" button (web geolocation API, PostgREST WKT format `POINT(lng lat)`), radius picker (Small 80m / Medium 150m / Large 300m), venue name + description, handles both INSERT (new) and UPDATE (existing) zone |
| `app/index.tsx` | Root redirect |
| `app/_layout.tsx` | Root layout — SessionProvider, StatusBar, full Stack with all routes registered |
| `app/(auth)/_layout.tsx` | Auth group layout |
| `app/(tabs)/_layout.tsx` | Floating tab bar layout |

### Components (14)

`ZoneCard`, `PersonCard`, `PostCard`, `PulsePostCard`, `ChatMessage`, `DmBubble`, `WemetCard`, `EventCard`, `BadgeCard`, `MoodBadge`, `SocialModeBadge`, `HeatBar`, `ExpiryLabel`, `OnboardingModal`, `NearbyMap`, `AvatarImage`

### Lib / Data Layer (12)

`zones`, `sessions`, `posts`, `pulse`, `chat`, `messages`, `weMet`, `notifications`, `badges`, `blocks`, `reports`, `events`

### Hooks (8)

`useAuth`, `useGeofenceTask`, `useLocation`, `useMessages`, `useNotifications`, `usePulse`, `useSession`, `useVenueChat`, `useWeMet`

### Contexts

`SessionContext` — wraps the whole app, exposes session state + `checkOut()`

---

## Auth UI — Implementation Details

Both login and signup use the same electric premium design:

**Background:** `backgroundColor: '#020810'` (near-black) with 4 layered `Animated.View` orb pairs:
- Each pair = large low-opacity outer bloom (350-420px) + small bright core (130-160px) at the same position
- 4 independent `Animated.loop` values with staggered delays (0 / 600-700 / 900-1400 / 500ms) and durations (2700-4400ms) using `Easing.inOut(Easing.sin)` — they never all pulse at once
- Login: top-right + bottom-left clusters + left-center accent + top-center subtle
- Signup: top-left + bottom-right clusters + right-center accent + top-center subtle

**Card:** `backgroundColor: '#060D1A'`, `borderColor: 'rgba(41,182,246,0.2)'`, `borderRadius: 28`
- Web: `boxShadow: '0 0 0 1px rgba(41,182,246,0.4), 0 0 40px ..., 0 0 90px ..., 0 0 160px ...'`
- Native: `shadowColor: '#29B6F6', shadowOpacity: 0.55, shadowRadius: 40`

**Toggle pill — pixel-perfect alignment:**
- Container uses `onLayout` to measure exact pixel width → stored in `useState(0)`
- Pill rendered only after `toggleWidth > 0` to prevent flash
- `width: toggleWidth / 2 - 4` — exactly half minus 2px margins on each side
- `translateX` spring: `[2, toggleWidth / 2]` — 2px left margin for Person, right-half for Venue
- Pill has its own cyan `boxShadow` / `shadowColor` glow

**Signup venue flow:** On venue registration, profile is inserted (`is_venue_owner: true`), then routes to `/venue/dashboard`. Zone is set up separately at `/venue/edit` — no `lat:0, lng:0` placeholder inserts.

---

## Routing Map

```
/(auth)/login       → Person: /(tabs) | Venue: /venue/dashboard (checks is_venue_owner)
/(auth)/signup      → Person: /profile/edit | Venue: /venue/dashboard
/venue/dashboard    → hub for venue owners (live stats, quick actions)
/venue/edit         → GPS pin drop + radius + name/desc (insert or update)
/profile/edit       → display name, bio, age range, interests, kickoff, avatar → /(tabs)
/(tabs)             → main app (Nearby / Feed / Notifications / Profile)
```

---

## Known TypeScript Patterns

- Supabase join returns arrays for related tables. Cast with `as unknown as TargetType[]`.
- `supabase.rpc()` returns `PostgrestFilterBuilder` — do NOT call `.catch()`. Use `const { error } = await rpc(...) ; if (error)` pattern.
- `expo-task-manager` background tasks must be defined at module root (not inside components).
- `(auth)` in file paths causes PowerShell to break — always use Bash (Git Bash) for `git add` on auth files. Never use `git add app/(auth)/...` in PowerShell.
- `react-native-maps` is shimmed for web — restoring native map requires `.bak` file and EAS build.

---

## PR History

| PR | Branch | What shipped |
|---|---|---|
| #1 | feat/premium-ui-profiles | Premium UI — floating tab bar, live pulse cards, real avatar photos, email confirm flow |
| #2 | feat/animated-auth-venue-dashboard | Premium animated auth screens, venue owner path, venue dashboard |
| #3 | feat/venue-edit-page | Venue edit page — GPS pin drop, radius picker, create/update zone |
| #4 | feat/premium-auth-ui | First attempt at electric orb UI — had duplicate import merge artifact, superseded by PR #5 |
| #5 | feat/premium-auth-v2 | **Current** — clean electric orb auth, pixel-perfect toggle, premium signup with venue type grid. Vercel Preview: Ready. **Pending merge to main for production.** |

---

## Seeding a Test Venue (SQL)

Run this in Supabase SQL editor after applying the schema:

```sql
INSERT INTO zones (name, description, center, radius_meters, created_by, owner_id, is_active)
VALUES (
  'Test Venue',
  'First HereNow test venue for Jacob''s run',
  ST_GeomFromText('POINT(-86.1581 39.7684)', 4326),  -- replace with actual lng lat (lng first in WKT)
  200,
  (SELECT id FROM profiles LIMIT 1),  -- replace with actual user id after first signup
  (SELECT id FROM profiles LIMIT 1),
  true
);
```

---

## What's Still Needed — In Priority Order

### Before Jacob's Test Run

1. **Merge PR #5** — `feat/premium-auth-v2` is Ready in Vercel preview. Merge to main → goes to production at `herenow-pi.vercel.app`.

2. **Apply SQL to Supabase** — Nothing works until all 3 SQL files are run:
   - `supabase/schema.sql`
   - `supabase/phase2.sql`
   - `supabase/safety.sql`
   Run in that order via Supabase SQL editor at `orxtyreipavkrdiycpht.supabase.co`.

3. **Seed Jacob's venue** — After Joshua signs up as a venue owner and the SQL is applied, run the seed SQL above with the real lat/lng of Jacob's location.

4. **Push notifications** — `expo-notifications` package + Expo Push Service (free). Without it, We Met requests and DM notifications are invisible on device.

5. **Real device testing** — GPS and background geofencing behavior cannot be validated in simulator or browser. Must run on actual Android or iOS hardware via Expo Go.

### Near-Term Feature Gaps

6. **`/venue/dashboard` — Events tab and QR share** — "Add Event" and "Share QR" quick actions currently show `Alert('Coming soon')`. Build these when venue testing validates the core flow.

7. **Analytics for venue owners** — `/venue/dashboard` quick action stub. After Jacob's run, build real analytics (check-in count over time, peak hours, social mode breakdown).

8. **We Met `checkOut()` afterglow** — `SessionContext.checkOut()` should create an afterglow row after checkout. Verify this is wired correctly — was an unverified gap.

9. **Zone [id] screen tabs** — `app/zone/[id].tsx` has 4 tabs (People / Pulse / Chat / Events). Confirm each tab is fully functional against the live Supabase schema after SQL is applied.

10. **Onboarding modal** — `components/OnboardingModal.tsx` (5 slides: Welcome, Social Mode, Mood Mode, We Met, Afterglow). Confirm it shows only on first launch (AsyncStorage gate).

### Before App Store Launch

11. **Expo SDK upgrade** — SDK 52 → latest (53+). Required for EAS Build.
12. **EAS Build setup** — Signed APK (Android) and IPA (iOS). Google Play and Apple App Store.
13. **FCM + APNs push credentials** — Set up via EAS after SDK upgrade.
14. **Restore native maps** — `NearbyMap.tsx.bak` → `NearbyMap.tsx` for native builds (shimmed for web).
15. **App store metadata** — Bundle IDs, icons, screenshots, store descriptions.

### Longer Roadmap (V2+)

- **Venue claiming flow** — non-owner venues can be claimed by real owners
- **Premium venue tiers** — analytics dashboard, branded check-in pages, event promotion
- **Stripe integration** — venue subscriptions for premium features
- **Group We Met** — multiple people in a group connect at once
- **Session privacy levels** — "ghost mode" (visible to We Met connections only)
- **Content DNA / Pulse templates** — suggested pulse posts based on venue type
- **Venue QR code** — scannable code that deep-links directly to check-in flow

---

## Coding Rules

- Mobile first always — 44px min touch targets, safe area insets on all modals and bottom bars
- No hardcoded user IDs or zone IDs — always fetch from context/auth
- RLS is enforced — never bypass or disable it
- Realtime subscriptions must be cleaned up in `useEffect` returns
- Background geofencing: task defined at module root in `hooks/useGeofenceTask.ts`
- Do not add V2/V3 features until V1 is validated on real hardware with Jacob
- **Never use `git add app/(auth)/...` in PowerShell** — use Bash. Parentheses break PowerShell argument parsing.
- Auth files: login.tsx and signup.tsx now have the premium electric UI. Do not revert to the plain version. The toggle uses `onLayout` — do not replace with a hardcoded translateX value.
- PostgREST WKT for geography columns: `POINT(${lng} ${lat})` — longitude first, then latitude. Not the other way.
