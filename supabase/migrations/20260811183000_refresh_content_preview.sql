/*
 * Re-fetching a thumbnail that has expired.
 *
 * The URL oEmbed hands back is signed and carries an `x-expires` about two days
 * out. Storing it once at submission means every card in the product goes to a
 * placeholder by the end of the week, which for a feature whose whole point is
 * seeing the videos is not good enough.
 *
 * The browser cannot re-ask TikTok itself: the endpoint omits its CORS headers
 * on error responses, so a deleted post logs a CORS violation the console rule
 * in this project does not allow. So the refresh goes through our own Edge
 * Function, same origin, and lands here.
 *
 * Not a creator-facing decision, so there is no audit row: this only ever
 * rewrites a cached picture, never a fact about the work.
 */

create or replace function public.refresh_content_preview(
  p_actor_id uuid,
  p_content_id uuid,
  p_thumbnail_url text,
  p_video_title text default null,
  p_video_author text default null,
  p_embed_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row   public.content_submissions%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or not v_actor.is_active then
    raise exception 'unknown actor' using errcode = '42501';
  end if;

  select * into v_row from public.content_submissions where id = p_content_id;
  if not found then
    raise exception 'no such submission' using errcode = 'P0002';
  end if;

  -- Staff, or the creator whose video it is. Exactly the people who can already
  -- read the row.
  if v_actor.role not in ('admin', 'ops') and v_row.creator_id <> v_actor.id then
    raise exception 'not yours' using errcode = '42501';
  end if;

  update public.content_submissions
  set thumbnail_url = p_thumbnail_url,
      video_title = coalesce(p_video_title, video_title),
      video_author = coalesce(p_video_author, video_author),
      embed_id = coalesce(p_embed_id, embed_id)
  where id = p_content_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.refresh_content_preview(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.refresh_content_preview(uuid, uuid, text, text, text, text)
  to service_role;
