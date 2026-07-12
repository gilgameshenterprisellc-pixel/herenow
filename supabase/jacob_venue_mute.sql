-- Venue timeout/mute: a venue owner can silence a specific guest in their room
-- (Jacob: mods need to timeout/block, not just delete one message). Enforced by
-- a BEFORE INSERT trigger so a muted guest can't post chat or Pulse regardless
-- of client. muted_until = a timestamp (timeout) or NULL (indefinite block).

create table if not exists venue_muted_users (
  zone_id     uuid not null references zones(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  muted_until timestamptz,
  created_at  timestamptz default now(),
  primary key (zone_id, user_id)
);

alter table venue_muted_users enable row level security;

drop policy if exists "Venue owner manages mutes" on venue_muted_users;
create policy "Venue owner manages mutes"
  on venue_muted_users for all
  using (exists (select 1 from zones z where z.id = venue_muted_users.zone_id and z.owner_id = auth.uid()))
  with check (exists (select 1 from zones z where z.id = venue_muted_users.zone_id and z.owner_id = auth.uid()));

-- Reject posts from a currently-muted guest. Works for both venue_chat and
-- pulse_posts (both have zone_id + user_id).
create or replace function public.reject_muted_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from venue_muted_users m
    where m.zone_id = NEW.zone_id
      and m.user_id = NEW.user_id
      and (m.muted_until is null or m.muted_until > now())
  ) then
    raise exception 'You have been muted in this room by the venue.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_reject_muted_chat on venue_chat;
create trigger trg_reject_muted_chat before insert on venue_chat
  for each row execute function public.reject_muted_post();

drop trigger if exists trg_reject_muted_pulse on pulse_posts;
create trigger trg_reject_muted_pulse before insert on pulse_posts
  for each row execute function public.reject_muted_post();
