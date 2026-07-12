-- Venue posting in chat (Jacob: venues need to warn/talk in chat, not just watch).
-- Adds a flag to mark a message as coming from the venue, and an additive INSERT
-- policy so the zone owner can post to their own room even though they're not a
-- checked-in member. RLS policies are OR'd, so this only grants.

alter table venue_chat add column if not exists is_venue_msg boolean default false;

drop policy if exists "Venue owner posts to their zone chat" on venue_chat;
create policy "Venue owner posts to their zone chat"
  on venue_chat for insert with check (
    auth.uid() = user_id
    and exists (select 1 from zones z where z.id = venue_chat.zone_id and z.owner_id = auth.uid())
  );
