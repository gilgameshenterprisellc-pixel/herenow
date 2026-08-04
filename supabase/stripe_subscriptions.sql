-- HereNow subscriptions — entitlement store written by the Stripe webhook.
-- Run this in the Supabase SQL editor (same as every other migration here).
--
-- One row per Stripe subscription. The webhook (supabase/functions/stripe-webhook)
-- writes with the service-role key, bypassing RLS. Users can read their own rows.
-- Nothing client-side can insert/update — entitlement is only ever granted by a
-- verified Stripe event, never by the app.

create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  plan_id                text not null,             -- matches lib/pricing.ts ids
  audience               text not null,             -- 'venue' | 'organization' | 'consumer'
  target_type            text,                      -- 'zone' | 'organization' | null (consumer)
  target_id              uuid,                       -- zone id / org id / null
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  status                 text not null default 'incomplete',  -- active|trialing|past_due|canceled|incomplete
  current_period_end     timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

alter table subscriptions enable row level security;

-- Users can read their own subscriptions. No insert/update/delete policy exists,
-- so only the service role (the webhook) can write.
drop policy if exists "own subscriptions read" on subscriptions;
create policy "own subscriptions read"
  on subscriptions for select
  using (auth.uid() = user_id);

create index if not exists subscriptions_user_idx   on subscriptions(user_id);
create index if not exists subscriptions_target_idx on subscriptions(target_type, target_id);

-- Is there an active subscription for a given target (a venue or an org)?
-- SECURITY DEFINER so the app can call it without read access to other users'
-- rows (entitlement is a public fact about the venue/org, not about the buyer).
create or replace function has_active_subscription(p_target_type text, p_target_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from subscriptions
    where target_type = p_target_type
      and target_id   = p_target_id
      and status in ('active', 'trialing')
      and (current_period_end is null or current_period_end > now())
  );
$$;

-- Is the given user a current HereNow Plus subscriber?
create or replace function is_user_plus(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from subscriptions
    where user_id = p_user
      and audience = 'consumer'
      and status in ('active', 'trialing')
      and (current_period_end is null or current_period_end > now())
  );
$$;
