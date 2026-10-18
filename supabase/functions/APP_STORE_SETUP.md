# App Store downloads on the Pilot Dashboard: setup

The `app-store-analytics` Edge Function pulls HereNow's daily App Store numbers
from Apple every 6 hours: first-time downloads, reinstalls, product page views,
and where downloads came from (App Store search, web referrer, and so on).
Downloads are the top of the Pilot Dashboard funnel and a headline card. The
pilot has no per-venue QR codes (the one flyer links straight to the App Store),
so the QR parts of the dashboard are hidden.

All the code is in the repo. These steps need the two key files and your
Supabase login. About 15 minutes.

**Never paste a key file or its contents into a chat, an email or the repo.**
Every command below reads the file directly and never prints it.

## The two keys

Jacob made both in App Store Connect, because HereNow is on his developer
account and the Integrations page won't open for anyone else. He sends the two
`.p8` files over Signal; save them in a folder on your desktop called
`HereNow API Keys`.

| Key name | Role | Used for |
|---|---|---|
| HereNow Dashboard | Sales and Reports | Every run, for good. Reads the reports. |
| HereNow Report SetUp | Admin | The first run only. Apple only lets an Admin key create the report request. Revoked right after. |

Jacob also sends the Issuer ID and the two Key IDs. Those aren't secret. Apple
names each file `AuthKey_<Key ID>.p8`.

Your desktop is synced to OneDrive, so the files get copied there too. Delete
them once step 6 is done.

## 1. Run the SQL

Supabase dashboard, SQL editor: run `supabase/app_store_daily.sql`. It creates
the tables (admin-only read), a random secret in Vault for the scheduler, the
every-6-hours schedule, and the dashboard function `admin_app_store_overview`.

If the `pg_net` or `pg_cron` line errors, turn that extension on in
**Database, Extensions**, then run the file again. It is safe to re-run.

## 2. Set the secrets

In Git Bash. Log in once with `npx supabase login` if the CLI asks. Put in the
Issuer ID and Key IDs Jacob sent:

```bash
npx supabase secrets set --project-ref orxtyreipavkrdiycpht APP_STORE_CONNECT_ISSUER_ID=ISSUER_ID APP_STORE_CONNECT_KEY_ID=DASHBOARD_KEY_ID APP_STORE_CONNECT_ADMIN_KEY_ID=SETUP_KEY_ID
```

Then the two private keys, straight from the files. `tr` drops the line breaks
so the value passes cleanly through the command line; the function reads the
key either way.

```bash
npx supabase secrets set --project-ref orxtyreipavkrdiycpht APP_STORE_CONNECT_PRIVATE_KEY="$(tr -d '\r\n' < "$HOME/OneDrive/Desktop/HereNow API Keys/AuthKey_DASHBOARD_KEY_ID.p8")"
```

```bash
npx supabase secrets set --project-ref orxtyreipavkrdiycpht APP_STORE_CONNECT_ADMIN_PRIVATE_KEY="$(tr -d '\r\n' < "$HOME/OneDrive/Desktop/HereNow API Keys/AuthKey_SETUP_KEY_ID.p8")"
```

Check all five names are there (it shows names and fingerprints, not values):

```bash
npx supabase secrets list --project-ref orxtyreipavkrdiycpht
```

## 3. Deploy the function

```bash
npx supabase functions deploy app-store-analytics --no-verify-jwt --project-ref orxtyreipavkrdiycpht
```

`--no-verify-jwt` is required: the caller is the database scheduler, not a
signed-in user. The function checks its own secret instead (the one step 1 put
in Vault).

## 4. Run it once

In the SQL editor:

```sql
select app_store_sync_now();
```

## 5. Check it

Wait 30 seconds, then:

```sql
select ran_at, ok, message from app_store_sync_runs order by ran_at desc limit 5;
```

You want `ok = true` and a message that starts "Asked Apple for daily reports"
and says the Admin key is no longer needed. It asked Apple for the daily
reports plus a one-time snapshot of the days since launch. Apple takes one to
two days to make the first ones; the schedule picks them up on its own.

## 6. Retire the Admin key

Only after step 5 says the Admin key is no longer needed:

```bash
npx supabase secrets unset --project-ref orxtyreipavkrdiycpht APP_STORE_CONNECT_ADMIN_KEY_ID APP_STORE_CONNECT_ADMIN_PRIVATE_KEY
```

Then ask Jacob to revoke **HereNow Report SetUp** in App Store Connect (Users
and Access, Integrations, App Store Connect API, Team Keys). Leave "Jacob
HereNow Key" alone: Codemagic uses it. Delete `AuthKey_SETUP_KEY_ID.p8` from
the desktop folder.

Run `select app_store_sync_now();` once more and check step 5 again. It should
still say `ok = true`, now using only the Sales and Reports key.

## If something goes wrong

| Message in app_store_sync_runs | What to do |
|---|---|
| `secrets are not set` | Step 2 didn't take. Check with `secrets list`. |
| `401 NOT_AUTHORIZED` | An Issuer ID, Key ID and file don't belong together, or the key was revoked. Redo step 2 with matching values. |
| `Only an Admin key can create it` | The report request doesn't exist yet (or Apple stopped it). Ask Jacob for a fresh Admin key and repeat steps 2, 4, 5 and 6 with it. |
| No row at all | Check the scheduler: `select status, return_message from cron.job_run_details order by start_time desc limit 5;` and the function logs in the Supabase dashboard. |

Apple stops a report request only after a long time without reads, which the
6-hour schedule prevents.

## How it works

- Apple docs it follows are listed at the top of
  `supabase/functions/_shared/app-store-analytics.ts`.
- It reads the **Standard** reports "App Store Downloads" and "App Store
  Discovery and Engagement". Apple applies small-count hiding and noise only to
  the Detailed versions, so Standard is right for an app this size.
- Apple restates the last couple of days in later files. A later file replaces
  a day, it is never added on top, so nothing double counts.
- Report request ids are saved in `app_store_report_requests`, so the Sales and
  Reports key keeps working even if Apple only lets an Admin key list requests.
- Each Apple file is read once (`app_store_report_instances`). Every run writes
  a row to `app_store_sync_runs`, and a failed run shows on the dashboard.
- Cost: free. A few Apple API calls and one tiny function run every 6 hours.
