# App Store numbers on the Pilot Dashboard: setup

The `app-store-analytics` Edge Function pulls HereNow's daily App Store numbers
from Apple every 6 hours: first-time downloads, redownloads, product page views,
and where each came from (App Store search, web referrer, and so on). They show
on the Pilot Dashboard as two funnel rows between QR scans and Accounts created.

All the code is in the repo. These steps need your App Store Connect and Supabase
logins. About 15 minutes. Never paste the key file or its contents into a chat.

## 1. Make the API key in App Store Connect

This needs an **Admin** on the HereNow App Store Connect team (Jacob as Account
Holder, or you if he gave you the Admin role). If you don't see a Generate button
in step 4, you don't have Admin: ask Jacob to make the key or to give you Admin.

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) and open **Users and Access**.
2. Open the **Integrations** tab.
3. In the left column, pick **App Store Connect API**, then the **Team Keys** tab.
4. Click **Generate API Key** (or the **+** button).
5. Name: `HereNow dashboard sync`. Access: **Admin**. Click **Generate**.
6. Write down two values from that page:
   - **Issuer ID**: near the top of the page, with a Copy button.
   - **Key ID**: in the key's row (hover it for Copy Key ID).
7. Click **Download API Key** in the key's row. You get a file named like
   `AuthKey_2X9R4HXF34.p8` in Downloads. **Apple lets you download it once.**
   Keep it out of the repo folder.

Why Admin: Apple only lets an Admin key create the report request, which the
function does on its first run. After the first run succeeds you can swap to a
safer key, see step 6.

## 2. Run the SQL

Supabase dashboard, SQL editor: run `supabase/app_store_daily.sql`. It creates the
tables (admin-only read), a random secret in Vault for the scheduler, the
every-6-hours schedule, and the dashboard function `admin_app_store_overview`.

If the `pg_net` or `pg_cron` line errors, turn that extension on in
**Database, Extensions**, then run the file again. It is safe to re-run.

## 3. Set the three secrets

In Git Bash, from the herenow folder. Log in once with `npx supabase login` if the
CLI asks. Put your own Issuer ID and Key ID in the first command, and your file
name in the second.

```bash
npx supabase secrets set --project-ref orxtyreipavkrdiycpht APP_STORE_CONNECT_ISSUER_ID=your-issuer-id APP_STORE_CONNECT_KEY_ID=your-key-id
```

```bash
npx supabase secrets set --project-ref orxtyreipavkrdiycpht APP_STORE_CONNECT_PRIVATE_KEY="$(cat ~/Downloads/AuthKey_2X9R4HXF34.p8)"
```

The second command reads the key straight from the file, so it never appears on
screen. (Or add all three in the Supabase dashboard under Edge Functions,
Secrets: paste the whole .p8 file as the private key's value.)

After this you can delete the .p8 from Downloads, or keep it in a password
manager. Apple will not give it to you again.

## 4. Deploy the function

```bash
npx supabase functions deploy app-store-analytics --no-verify-jwt --project-ref orxtyreipavkrdiycpht
```

`--no-verify-jwt` is required: the caller is the database scheduler, not a signed
in user. The function checks its own secret instead (the one step 2 put in Vault).

## 5. Run it once and check

In the SQL editor:

```sql
select app_store_sync_now();
```

Wait 30 seconds, then:

```sql
select ran_at, ok, message from app_store_sync_runs order by ran_at desc limit 5;
```

The first run should say `ok = true` and "Apple has not generated the reports
yet". It has asked Apple for the daily reports plus a one-time snapshot of the
days since launch. Apple takes one to two days to make the first ones. After
that the schedule picks them up on its own, and the dashboard shows the numbers.

| Message | What to do |
|---|---|
| `secrets are not set` | Step 3 didn't take. `npx supabase secrets list --project-ref orxtyreipavkrdiycpht` should show all three names. |
| `401 NOT_AUTHORIZED` | Issuer ID, Key ID and .p8 file don't belong together, or the key was revoked. Redo step 3 with the matching values. |
| `403` and "Admin role" | The key isn't Admin. Make an Admin key (step 1) for the first run. |
| No row at all | Check the scheduler: `select status, return_message from cron.job_run_details order by start_time desc limit 5;` and the function logs in the Supabase dashboard. |

## 6. Optional, after the first run works: swap to a safer key

An Admin key can do a lot in App Store Connect. Once the first run has succeeded,
a **Sales and Reports** key is enough to keep reading:

1. Make a second key the same way as step 1, with Access **Sales and Reports**.
2. Redo step 3 with the new Key ID and file (same Issuer ID).
3. Revoke the Admin key in App Store Connect.

If Apple ever stops the report request (it does after a long time without reads,
which the schedule prevents), the dashboard will show "403 ... Admin role" and
you'd need an Admin key again for one run.

## How it works

- Apple docs it follows are listed at the top of
  `supabase/functions/_shared/app-store-analytics.ts`.
- It reads the **Standard** reports "App Store Downloads" and "App Store Discovery
  and Engagement". Apple applies small-count hiding and noise only to the
  Detailed versions, so Standard is right for an app this size.
- Apple restates the last couple of days in later files. A later file replaces a
  day, it is never added on top, so the numbers don't double count.
- Each Apple file is read once (`app_store_report_instances`). Every run writes a
  row to `app_store_sync_runs`, and a failed run shows on the dashboard.
- Cost: free. A few Apple API calls and one tiny function run every 6 hours.
