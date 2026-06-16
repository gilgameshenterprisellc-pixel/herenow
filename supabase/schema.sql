-- HereNow Database Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Requires PostGIS extension (enabled by default on Supabase)

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists postgis;

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username     text unique not null,
  avatar_url   text,
  bio          text,
  created_at   timestamptz default now()
);

alter table profiles enable row level security;

create policy "Public profiles viewable by everyone"
  on profiles for select using (true);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- ============================================================
-- ZONES
-- PostGIS geography column stores the center point.
-- We also store center_lat/center_lng as floats for use with
-- the native expo-location geofencing API (which needs plain numbers).
-- ============================================================
create table if not exists zones (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  center         geography(POINT, 4326) not null,
  center_lat     float not null,   -- mirrored for native geofencing
  center_lng     float not null,   -- mirrored for native geofencing
  radius_meters  int not null default 500,
  created_by     uuid references profiles(id) on delete set null,
  is_active      boolean default true,
  member_count   int default 0,
  post_count     int default 0,
  created_at     timestamptz default now()
);

create index if not exists zones_center_idx on zones using gist(center);

alter table zones enable row level security;

create policy "Zones viewable by everyone"
  on zones for select using (true);

create policy "Authenticated users can create zones"
  on zones for insert with check (auth.uid() is not null);

create policy "Zone creator can update their zone"
  on zones for update using (auth.uid() = created_by);

-- ============================================================
-- ZONE MEMBERS
-- Tracks both subscribed members (is_present=false) and
-- currently-inside members (is_present=true).
-- ============================================================
create table if not exists zone_members (
  id           uuid primary key default gen_random_uuid(),
  zone_id      uuid not null references zones(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  is_present   boolean default true,
  last_seen_at timestamptz default now(),
  joined_at    timestamptz default now(),
  unique(zone_id, user_id)
);

alter table zone_members enable row level security;

create policy "Zone members viewable by everyone"
  on zone_members for select using (true);

create policy "Users can manage their own membership"
  on zone_members for all using (auth.uid() = user_id);

-- ============================================================
-- ZONE POSTS
-- ============================================================
create table if not exists zone_posts (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid not null references zones(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  content       text not null,
  media_url     text,
  like_count    int default 0,
  comment_count int default 0,
  created_at    timestamptz default now()
);

create index if not exists zone_posts_zone_id_idx on zone_posts(zone_id);
create index if not exists zone_posts_created_at_idx on zone_posts(created_at desc);

alter table zone_posts enable row level security;

create policy "Zone posts viewable by zone members"
  on zone_posts for select using (
    exists (
      select 1 from zone_members
      where zone_id = zone_posts.zone_id
        and user_id = auth.uid()
    )
  );

create policy "Zone members can create posts"
  on zone_posts for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from zone_members
      where zone_id = zone_posts.zone_id
        and user_id = auth.uid()
    )
  );

create policy "Users can delete own posts"
  on zone_posts for delete using (auth.uid() = user_id);

-- ============================================================
-- POST LIKES
-- ============================================================
create table if not exists post_likes (
  post_id uuid references zone_posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

alter table post_likes enable row level security;

create policy "Likes viewable by everyone"
  on post_likes for select using (true);

create policy "Users can manage own likes"
  on post_likes for all using (auth.uid() = user_id);

-- ============================================================
-- POST COMMENTS
-- ============================================================
create table if not exists post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references zone_posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz default now()
);

alter table post_comments enable row level security;

create policy "Comments viewable by everyone"
  on post_comments for select using (true);

create policy "Zone members can comment"
  on post_comments for insert with check (auth.uid() = user_id);

create policy "Users can delete own comments"
  on post_comments for delete using (auth.uid() = user_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Find zones within radius_km of a point, ordered by distance
create or replace function zones_near(lat float, lng float, radius_km float default 50)
returns table(
  id             uuid,
  name           text,
  description    text,
  radius_meters  int,
  distance_meters float,
  member_count   int,
  post_count     int,
  center_lat     float,
  center_lng     float
) as $$
  select
    z.id,
    z.name,
    z.description,
    z.radius_meters,
    st_distance(z.center::geography, st_point(lng, lat)::geography) as distance_meters,
    z.member_count,
    z.post_count,
    z.center_lat,
    z.center_lng
  from zones z
  where
    z.is_active = true
    and st_dwithin(
      z.center::geography,
      st_point(lng, lat)::geography,
      radius_km * 1000
    )
  order by distance_meters asc;
$$ language sql security definer;

-- Check if a user's coordinates are inside a zone's geofence
create or replace function user_in_zone(zone_id uuid, user_lat float, user_lng float)
returns boolean as $$
  select st_dwithin(
    (select center from zones where id = zone_id)::geography,
    st_point(user_lng, user_lat)::geography,
    (select radius_meters from zones where id = zone_id)
  );
$$ language sql security definer;

-- ============================================================
-- TRIGGERS — keep member_count and post_count denormalized
-- ============================================================

create or replace function increment_zone_member_count()
returns trigger as $$
begin
  update zones set member_count = member_count + 1 where id = NEW.zone_id;
  return NEW;
end;
$$ language plpgsql;

create or replace function decrement_zone_member_count()
returns trigger as $$
begin
  update zones set member_count = greatest(0, member_count - 1) where id = OLD.zone_id;
  return OLD;
end;
$$ language plpgsql;

create or replace function increment_zone_post_count()
returns trigger as $$
begin
  update zones set post_count = post_count + 1 where id = NEW.zone_id;
  return NEW;
end;
$$ language plpgsql;

create or replace function decrement_zone_post_count()
returns trigger as $$
begin
  update zones set post_count = greatest(0, post_count - 1) where id = OLD.zone_id;
  return OLD;
end;
$$ language plpgsql;

create trigger on_member_insert
  after insert on zone_members
  for each row execute procedure increment_zone_member_count();

create trigger on_member_delete
  after delete on zone_members
  for each row execute procedure decrement_zone_member_count();

create trigger on_post_insert
  after insert on zone_posts
  for each row execute procedure increment_zone_post_count();

create trigger on_post_delete
  after delete on zone_posts
  for each row execute procedure decrement_zone_post_count();
