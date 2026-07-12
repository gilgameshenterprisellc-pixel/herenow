-- Venue moderation: let a zone owner hide (remove) a guest's Pulse post or Chat
-- message in their own zone (Jacob: venues are the only line of defense, they
-- need Twitch-style mod power, not read-only). Soft-hide via the existing
-- is_hidden flag so it's reversible, matching the report/auto-hide pattern.
--
-- SECURITY DEFINER + an explicit owner check keeps it scoped: a caller can only
-- affect content in a zone they own, and only the is_hidden flag.

create or replace function public.venue_moderate_content(
  p_content_type text,   -- 'pulse' or 'chat'
  p_content_id   uuid,
  p_hidden       boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_content_type = 'pulse' then
    update pulse_posts
       set is_hidden = p_hidden
     where id = p_content_id
       and exists (select 1 from zones z where z.id = pulse_posts.zone_id and z.owner_id = auth.uid());
  elsif p_content_type = 'chat' then
    update venue_chat
       set is_hidden = p_hidden
     where id = p_content_id
       and exists (select 1 from zones z where z.id = venue_chat.zone_id and z.owner_id = auth.uid());
  else
    raise exception 'invalid content type %', p_content_type;
  end if;
end;
$$;

grant execute on function public.venue_moderate_content(text, uuid, boolean) to authenticated;
