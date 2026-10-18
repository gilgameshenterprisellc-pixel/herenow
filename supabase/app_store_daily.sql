-- App Store downloads and product page views on the Pilot Dashboard (Oct 2026).
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- Why: the launch flyer's QR links straight to the App Store, so its scans never
-- reach HereNow. Apple's own download numbers are the only way to see what it
-- did. The app-store-analytics Edge Function pulls them daily from the App Store
-- Connect Analytics Reports API into app_store_daily; the dashboard reads them
-- through admin_app_store_overview() below. Setup steps and secrets:
-- supabase/functions/APP_STORE_SETUP.md.
--
-- The Apple numbers have their own RPC instead of new keys on
-- admin_pilot_overview(): the build already in the App Store calls that one, and
-- a missing or failing Apple sync must never be able to break it.

-- ── 1. One row per day, from Apple ───────────────────────────────────────────
-- Each half of a row records the processing date of the Apple report it came
-- from. Apple restates recent days in later report files, and a later file
-- replaces an earlier one for the same day (never added together).
CREATE TABLE IF NOT EXISTS app_store_daily (
  day                       date PRIMARY KEY,
  first_downloads           int  NOT NULL DEFAULT 0,  -- "First-time download"
  redownloads               int  NOT NULL DEFAULT 0,  -- "Redownload"
  downloads_by_source       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"Web referrer": {"first_downloads": 3, "redownloads": 0}}
  downloads_processing_date date,
  page_views                int  NOT NULL DEFAULT 0,  -- product page views (every view, not unique people)
  views_by_source           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"App Store search": {"page_views": 9}}
  views_processing_date     date,
  updated_at                timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_store_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin reads app_store_daily" ON app_store_daily;
CREATE POLICY "admin reads app_store_daily" ON app_store_daily FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Apple report files already read, so each is read once.
CREATE TABLE IF NOT EXISTS app_store_report_instances (
  instance_id     text PRIMARY KEY,
  report_kind     text NOT NULL,   -- 'downloads' | 'engagement'
  access_type     text,            -- 'ONGOING' | 'ONE_TIME_SNAPSHOT'
  processing_date date NOT NULL,
  days            int  NOT NULL DEFAULT 0,
  ingested_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_store_report_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin reads app_store_report_instances" ON app_store_report_instances;
CREATE POLICY "admin reads app_store_report_instances" ON app_store_report_instances FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Every run, success or failure, so a broken sync is visible.
CREATE TABLE IF NOT EXISTS app_store_sync_runs (
  id      bigserial PRIMARY KEY,
  ran_at  timestamptz NOT NULL DEFAULT now(),
  ok      boolean NOT NULL,
  message text,
  details jsonb
);
ALTER TABLE app_store_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin reads app_store_sync_runs" ON app_store_sync_runs;
CREATE POLICY "admin reads app_store_sync_runs" ON app_store_sync_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX IF NOT EXISTS app_store_sync_runs_ran_at_idx ON app_store_sync_runs (ran_at DESC);

-- Writes come only from the Edge Function's service role, which bypasses RLS.
-- No insert/update policies, so nobody else can write.

-- ── 2. The secret the scheduler uses to call the function ────────────────────
-- A random value, made here and kept in Vault. Nobody has to see or copy it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'herenow_app_store_sync_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'herenow_app_store_sync_secret',
      'Lets pg_cron call the app-store-analytics Edge Function'
    );
  END IF;
END $$;

-- The Edge Function asks this whether a caller's secret is right. Service role only.
CREATE OR REPLACE FUNCTION app_store_sync_secret_ok(p_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'herenow_app_store_sync_secret' AND decrypted_secret = p_secret
  )
$$;
REVOKE ALL ON FUNCTION app_store_sync_secret_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_store_sync_secret_ok(text) TO service_role;

-- ── 3. Run the sync: on a schedule, or now with SELECT app_store_sync_now(); ─
-- pg_net sends the request in the background; the function answers at once and
-- writes its result to app_store_sync_runs a few seconds later.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION app_store_sync_now()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_post(
    url     := 'https://orxtyreipavkrdiycpht.supabase.co/functions/v1/app-store-analytics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'herenow_app_store_sync_secret')
    ),
    body    := '{}'::jsonb
  )
$$;
REVOKE ALL ON FUNCTION app_store_sync_now() FROM PUBLIC, anon, authenticated;

-- Every 6 hours. Apple publishes once a day at no fixed hour; a run with nothing
-- new costs a handful of API calls and reads nothing twice. If this or the pg_net
-- line above errors, turn the extension on in Database, Extensions and re-run.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'herenow-app-store-sync';
SELECT cron.schedule('herenow-app-store-sync', '20 */6 * * *', 'SELECT app_store_sync_now();');

-- ── 4. Dashboard: App Store numbers for the selected range ───────────────────
-- p_days NULL = all time, else the last p_days calendar days (Apple's dates).
-- latest_day is the newest day Apple has reported at all, so the dashboard can
-- say how far behind the numbers are.
CREATE OR REPLACE FUNCTION admin_app_store_overview(p_days int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; since date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  since := CASE WHEN p_days IS NULL THEN NULL ELSE current_date - p_days END;

  WITH d AS (SELECT * FROM app_store_daily WHERE since IS NULL OR day > since),
       dl AS (
         SELECT e.key AS source,
                sum(COALESCE((e.value->>'first_downloads')::int, 0)) AS first_downloads,
                sum(COALESCE((e.value->>'redownloads')::int, 0))     AS redownloads
         FROM d, jsonb_each(d.downloads_by_source) e GROUP BY e.key
       ),
       pv AS (
         SELECT e.key AS source, sum(COALESCE((e.value->>'page_views')::int, 0)) AS page_views
         FROM d, jsonb_each(d.views_by_source) e GROUP BY e.key
       ),
       src AS (
         SELECT COALESCE(dl.source, pv.source) AS source,
                COALESCE(dl.first_downloads, 0) AS first_downloads,
                COALESCE(dl.redownloads, 0)     AS redownloads,
                COALESCE(pv.page_views, 0)      AS page_views
         FROM dl FULL JOIN pv ON pv.source = dl.source
       ),
       last_run AS (SELECT * FROM app_store_sync_runs ORDER BY ran_at DESC LIMIT 1)
  SELECT jsonb_build_object(
    'connected',       EXISTS (SELECT 1 FROM app_store_sync_runs WHERE ok),
    'first_downloads', (SELECT COALESCE(sum(first_downloads), 0) FROM d),
    'redownloads',     (SELECT COALESCE(sum(redownloads), 0) FROM d),
    'page_views',      (SELECT COALESCE(sum(page_views), 0) FROM d),
    'sources',         (SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.first_downloads DESC, s.page_views DESC, s.source), '[]'::jsonb)
                        FROM src s WHERE s.first_downloads + s.redownloads + s.page_views > 0),
    'latest_day',      (SELECT max(day) FROM app_store_daily),
    'last_sync_at',    (SELECT max(ran_at) FROM app_store_sync_runs WHERE ok),
    'last_error',      (SELECT message FROM last_run WHERE NOT ok)
  ) INTO result;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_app_store_overview(int) TO authenticated;
