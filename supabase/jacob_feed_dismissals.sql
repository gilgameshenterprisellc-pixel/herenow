-- Dismissible Updates: let a user permanently clear a promo/announcement/event
-- card from their Updates feed (Jacob: a 13-day-old test promo he couldn't remove).
-- item_key mirrors the client's VenueFeedItem.id, e.g. 'promo-<id>', 'anno-<id>',
-- 'event-<id>'. feed.tsx filters these out and inserts on dismiss.

create table if not exists public.feed_dismissals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_key   text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_key)
);

alter table public.feed_dismissals enable row level security;

drop policy if exists "feed_dismissals_select_own" on public.feed_dismissals;
create policy "feed_dismissals_select_own"
  on public.feed_dismissals for select
  using (auth.uid() = user_id);

drop policy if exists "feed_dismissals_insert_own" on public.feed_dismissals;
create policy "feed_dismissals_insert_own"
  on public.feed_dismissals for insert
  with check (auth.uid() = user_id);

drop policy if exists "feed_dismissals_delete_own" on public.feed_dismissals;
create policy "feed_dismissals_delete_own"
  on public.feed_dismissals for delete
  using (auth.uid() = user_id);

create index if not exists feed_dismissals_user_idx on public.feed_dismissals(user_id);
