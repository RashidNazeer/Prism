-- ============================================================================
-- THE QUEUE THAT FILES A BRAND'S VIDEOS INTO CREATIVE ANGLES.
--
-- Umar, 2026-10-06: "whenever I click the categorise/process button for a
-- certain brand its relevant brief and the new videos are sent to this
-- machine". Creative angle testing (Paid Collabs -> Reporting) is filed by hand
-- today: somebody watches each video and drops it into an angle card. The audit
-- backend can do the watching, and `collab_brand_briefs` (the migration before
-- this one) says which brief a brand's creators were given and which concepts
-- it names. What was missing is the thing in between: a durable list of which
-- videos still have to be judged, which are in flight at the backend, and what
-- became of each. This is that list, and the worker (`collab-angles-sync`)
-- files from it.
--
-- TWO TABLES, BECAUSE THERE ARE TWO KINDS OF THING.
--   collab_angle_videos   one row per VIDEO per brand-month. The queue, and the
--                         permanent record of what happened to that video.
--   collab_angle_batches  one row per BACKEND JOB. The backend takes a handful
--                         of videos at a time, a job runs for minutes, and it is
--                         not idempotent: posting twice starts two jobs and
--                         bills two. So a job has its own row, its own state
--                         and its own lease, and it is written down as
--                         'submitting' BEFORE the post, so a worker that dies
--                         mid-post can find the job again by label rather than
--                         start a second one.
--
-- VIDEOS ARE IDENTIFIED BY THEIR TIKTOK VIDEO ID, NOT BY THE URL. The only
-- source of a creator's videos is `wurxbase.creators.video_codes[].video`, and
-- that is free text written by three different writers (the sheet import, the
-- screen's own editor, and the creator-facing form). The same video arrives as
-- a full `tiktok.com/@name/video/123...` link, as a short `vm.tiktok.com`
-- redirect that has to be left alone, with and without a query string, with a
-- trailing slash, or pasted with spaces around it. Comparing those as strings
-- files one video twice. The numeric id inside is the one stable thing, so
-- (brand, month, video_id) is unique, and `video_url` keeps the exact string
-- that was found, to send to the backend and to show on the screen.
--
-- THE BRAND IS THE EXACT SPELLING ON THE CREATOR ROW. Angle cards live in
-- `wurxbase.activity_logs` under the key 'Brand::YYYY-MM', and the screen
-- builds that key from `wurxbase.creators.brand`, trimmed but compared CASE
-- SENSITIVELY. 'Swisse' and 'SWISSE' are two different boxes there. So `brand`
-- in these tables is that string and nothing else: not the spelling in
-- `collab_brand_briefs`, not a lower-cased copy. Writing the card under a
-- tidier spelling would put it in a box nobody opens, and the screen would
-- show the videos as uncategorised while the queue said 'filed'.
--
-- STATUS OF A VIDEO, so that "nothing happened" can always be told apart from
-- "not done yet" and from "could not be judged":
--   queued        waiting to be sent.
--   sent          in a batch at the backend.
--   filed         written into the angle store.
--   skipped       it has no date, so no month to file it under; or somebody had
--                 already filed it by hand, and a person's decision stands.
--   failed        the backend could not judge it, after the retries.
--   needs_review  the backend put it under "Matched None" but flagged that it
--                 was not really judged (it could not watch it, say). Not
--                 filed as a judgement; a person should look.
--
-- READ BY THE PAID COLLABS TEAM ONLY: staff plus the read-only collabs roles,
-- through `is_collabs_viewer()`, so the screen can show a progress ring that
-- moves. Never creators. Written only by the service role, which is the two
-- Edge Functions. Both tables are published to Realtime so the ring updates
-- without polling the table; RLS still decides who receives an event.
--
-- THE SCHEDULE is the same shape as the Euka ad-figures job: the secret and the
-- URL live in the vault, set once at deploy time, never in this file. It runs
-- every minute, because a tick is short (it claims one batch, polls it or
-- submits it, and returns) and a job that finishes should be filed within a
-- minute, not within five.
-- ============================================================================

-- ------------------------------------------------------------------ batches --
-- Created first: the videos table points at it.
create table if not exists public.collab_angle_batches (
  -- Also sent to the backend as the job's `label`, which is how a job whose
  -- reply was lost can be found again.
  id              uuid primary key default gen_random_uuid(),

  -- The exact creators.brand spelling, as on the videos in the batch.
  brand           text not null,
  month           text not null,

  state           text not null default 'queued'
                  check (state in ('queued', 'submitting', 'running', 'filing', 'done', 'failed')),

  -- The backend's own job id, once it has answered.
  provider_job    text,
  n_videos        smallint not null default 0,
  attempts        smallint not null default 0,

  -- A worker holds the batch until this moment. A worker that dies leaves it
  -- claimable again shortly, never stuck.
  lease_until     timestamptz,

  -- The backend's `phase`, so the screen can say what it is doing.
  last_phase      text,
  last_polled_at  timestamptz,
  submitted_at    timestamptz,
  finished_at     timestamptz,
  error           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The claim: batches in 'submitting' or 'running' whose lease is free.
create index if not exists collab_angle_batches_state_lease_idx
  on public.collab_angle_batches (state, lease_until);

comment on table public.collab_angle_batches is
  'One row per audit-backend job for creative angle categorisation: up to five videos of one brand-month. `id` is also the label sent to the backend. State is written as submitting BEFORE the post, because the backend''s /analyze is not idempotent. Written only by collab-angles-sync.';

drop trigger if exists collab_angle_batches_touch_updated_at on public.collab_angle_batches;
create trigger collab_angle_batches_touch_updated_at
  before update on public.collab_angle_batches
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- videos --
create table if not exists public.collab_angle_videos (
  id           uuid primary key default gen_random_uuid(),

  -- EXACT trimmed wurxbase.creators.brand: the angle store's key is built from
  -- it and compared case sensitively.
  brand        text not null,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),

  -- The TikTok numeric id found inside the video link.
  video_id     text not null check (video_id ~ '^[0-9]{6,32}$'),

  -- The exact string from video_codes, as found.
  video_url    text not null,

  -- A snapshot of the creator's name, for the screen.
  creator      text,

  status       text not null default 'queued'
               check (status in ('queued', 'sent', 'filed', 'skipped', 'failed', 'needs_review')),

  -- What the backend returned, once known; and which brief it followed.
  angle        text,
  brief_label  text,

  batch_id     uuid references public.collab_angle_batches (id) on delete set null,
  attempts     smallint not null default 0,
  last_error   text,
  filed_at     timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One row per video per brand-month, whatever the link looked like.
  unique (brand, month, video_id)
);

create index if not exists collab_angle_videos_status_idx
  on public.collab_angle_videos (status, brand, month);
create index if not exists collab_angle_videos_batch_idx
  on public.collab_angle_videos (batch_id);

comment on table public.collab_angle_videos is
  'The queue, and the record, of creative angle categorisation: one row per TikTok video per brand-month. `brand` is the exact wurxbase.creators.brand spelling (the angle store key is case sensitive); `video_id` is the TikTok numeric id because video_codes[].video is unnormalised free text. Written only by collab-angles and collab-angles-sync.';

drop trigger if exists collab_angle_videos_touch_updated_at on public.collab_angle_videos;
create trigger collab_angle_videos_touch_updated_at
  before update on public.collab_angle_videos
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------ row security --
alter table public.collab_angle_batches enable row level security;
alter table public.collab_angle_videos  enable row level security;

drop policy if exists collab_angle_batches_select_collabs on public.collab_angle_batches;
create policy collab_angle_batches_select_collabs on public.collab_angle_batches
  for select to authenticated using (public.is_collabs_viewer());

drop policy if exists collab_angle_videos_select_collabs on public.collab_angle_videos;
create policy collab_angle_videos_select_collabs on public.collab_angle_videos
  for select to authenticated using (public.is_collabs_viewer());

-- No insert, update or delete policy. The queue is written only by Edge
-- Functions that re-check the caller's role and hold the service key.

-- ------------------------------------------------------------------ grants --
-- "Automatically expose new tables" is off, which also drops the default
-- grants to service_role. Without these the Edge Functions silently see nothing.
grant select on table public.collab_angle_batches to authenticated;
grant select on table public.collab_angle_videos  to authenticated;
grant all privileges on table public.collab_angle_batches to service_role;
grant all privileges on table public.collab_angle_videos  to service_role;

-- ---------------------------------------------------------------- realtime --
-- A table that is not in the supabase_realtime publication produces no events,
-- and the subscription sits there looking healthy and delivering nothing. So
-- the screen's progress ring is asserted here. Idempotent: adding a table that
-- is already published is an error.
do $$
declare
  t text;
  already boolean;
begin
  foreach t in array array['collab_angle_videos', 'collab_angle_batches']
  loop
    select exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) into already;

    if not already then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.collab_angle_videos  replica identity default;
alter table public.collab_angle_batches replica identity default;

-- ---------------------------------------------------------------- schedule --
-- The same shape as the Euka ad-figures job: the secret and the URL live in the
-- vault, set once at deploy time, never in this file.
create or replace function public.collab_angles_set_sync_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'the sync secret must be at least 32 characters';
  end if;
  select id into v_id from vault.secrets where name = 'collab_angles_sync_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'collab_angles_sync_secret',
      'Presented by the creative-angle categoriser in x-sync-secret');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

revoke all on function public.collab_angles_set_sync_secret(text) from anon, authenticated, public;
grant execute on function public.collab_angles_set_sync_secret(text) to service_role;

create or replace function public.collab_angles_set_sync_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/collab-angles-sync$' then
    raise exception 'that does not look like a collab-angles-sync function URL';
  end if;
  select id into v_id from vault.secrets where name = 'collab_angles_sync_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'collab_angles_sync_url', 'Where the creative-angle categoriser posts');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

revoke all on function public.collab_angles_set_sync_url(text) from anon, authenticated, public;
grant execute on function public.collab_angles_set_sync_url(text) to service_role;

create or replace function public.collab_angles_run_cycle()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_url text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'collab_angles_sync_secret';
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'collab_angles_sync_url';

  /*
   * NOT AN EXCEPTION, deliberately, as with the Euka ad-figures job. This fires
   * every minute. A project without Paid Collabs has no vault entries for it,
   * and a raise there would write an error into cron's history 1,440 times a
   * day about a feature that does not exist on that project.
   */
  if v_secret is null or v_url is null then
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.collab_angles_run_cycle() from anon, authenticated, public;
grant execute on function public.collab_angles_run_cycle() to service_role;

select cron.unschedule('collab-angles-cycle')
where exists (select 1 from cron.job where jobname = 'collab-angles-cycle');

select cron.schedule(
  'collab-angles-cycle',
  '* * * * *',
  $$ select public.collab_angles_run_cycle(); $$
);
