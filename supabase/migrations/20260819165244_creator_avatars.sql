-- ============================================================================
-- Creator profile pictures, fetched once and kept here.
-- ============================================================================
-- Rashid, 2026-08-19, after seeing that the vendored WurxBase draws real faces
-- and our admin draws coloured initials: "can we do it on our admin end only?
-- whereever possible?"
--
-- WHERE THE PICTURE COMES FROM. WurxBase asks unavatar.io from the BROWSER, per
-- row, every time a screen opens. That works, and it costs three things we do
-- not have to pay: every creator's TikTok handle leaves our domain on every
-- page view, long lists get rate limited (their own code carries a `noRemote`
-- flag because the Discovery tab hit 429s and sat on blank circles), and the
-- day unavatar blocks us or disappears every face in the product turns back
-- into a letter.
--
-- So it is fetched ONCE, server side, and kept. After that the admin loads it
-- from our own storage and nothing leaves our domain at all.
--
-- WHY THIS BUCKET IS PRIVATE AND `brand-assets` IS NOT. That one is public on
-- purpose and says so: logos and product shots already on a public TikTok Shop
-- listing, on cards that must not wait for a token. This is different. Rashid
-- asked for it on the admin end ONLY, and a person's face plus a path that says
-- whose it is has no reason to be readable by anyone who is not staff. The cost
-- is one batched signing call per screen, which `createSignedUrls` does for a
-- whole page at once.
-- ============================================================================

create table public.creator_avatars (
  -- One picture per person. Cascades: an account that goes takes its face.
  profile_id uuid primary key references public.profiles (id) on delete cascade,

  -- The handle it was fetched by, kept so a rename is visible as a mismatch
  -- rather than as a silently stale picture.
  handle text,

  -- Object name inside the `creator-avatars` bucket. NULL means we looked and
  -- there was nothing to find.
  path text,

  source text not null default 'unavatar',
  bytes integer check (bytes is null or bytes >= 0),

  fetched_at timestamptz not null default now(),

  -- Why there is no picture. Set together with a null path, so a failed lookup
  -- is a fact on the row rather than an absence that invites a retry loop.
  error text,

  constraint creator_avatars_found_or_explained
    check (path is not null or error is not null)
);

comment on table public.creator_avatars is
  'One TikTok profile picture per creator, fetched server side and stored in the private creator-avatars bucket. Staff only.';

create index creator_avatars_missing_idx
  on public.creator_avatars (fetched_at)
  where path is null;

-- ------------------------------------------------------------ row security --

alter table public.creator_avatars enable row level security;

-- Staff read. Nobody writes with a user token: the Edge Function holds the
-- service key and is the only thing that puts a row here.
create policy "creator_avatars_select_staff"
  on public.creator_avatars
  for select
  to authenticated
  using (public.is_staff());

-- ------------------------------------------------------------------ grants --
-- "Automatically expose new tables" is OFF on both projects, so nothing is
-- reachable without an explicit grant. That includes service_role: without the
-- second line the Edge Function would write nothing and report success.

grant select on public.creator_avatars to authenticated;
grant all privileges on public.creator_avatars to service_role;

-- ------------------------------------------------------------------ bucket --

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-avatars',
  'creator-avatars',
  false, -- private, unlike brand-assets. See the note at the top.
  2097152, -- 2 MB. A profile picture larger than this is not a profile picture.
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Staff may read, and that is the whole of it. Writing is the Edge Function's
-- job and it holds the service key, which is not subject to these policies.
-- SVG is absent from the allowed types for the same reason as brand-assets: it
-- is a script host, and nothing that can execute belongs in a bucket.

drop policy if exists "creator_avatars_read_staff" on storage.objects;
create policy "creator_avatars_read_staff"
  on storage.objects for select to authenticated
  using (bucket_id = 'creator-avatars' and public.is_staff());

drop policy if exists "creator_avatars_write_staff" on storage.objects;
create policy "creator_avatars_write_staff"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'creator-avatars' and public.is_staff());

drop policy if exists "creator_avatars_update_staff" on storage.objects;
create policy "creator_avatars_update_staff"
  on storage.objects for update to authenticated
  using (bucket_id = 'creator-avatars' and public.is_staff())
  with check (bucket_id = 'creator-avatars' and public.is_staff());

drop policy if exists "creator_avatars_delete_staff" on storage.objects;
create policy "creator_avatars_delete_staff"
  on storage.objects for delete to authenticated
  using (bucket_id = 'creator-avatars' and public.is_staff());

-- ------------------------------------------------------------------- who to --
/*
 * The creators worth fetching, and the handle to fetch them by.
 *
 * The handle is NOT on `profiles`: it lives on the application, which is the
 * only place a creator ever typed it. Naming a `tiktok_handle` column on
 * profiles is a documented trap in this codebase and returns nothing.
 *
 * `security invoker` so it is the caller's own staff rights that decide what
 * comes back, rather than the view quietly widening them.
 */
create or replace view public.creator_avatar_queue
with (security_invoker = true)
as
  select
    p.id           as profile_id,
    p.display_name,
    a.tiktok_handle,
    ca.path,
    ca.error,
    ca.fetched_at
  from public.profiles p
  join public.applications a on a.user_id = p.id
  left join public.creator_avatars ca on ca.profile_id = p.id
  where p.role = 'creator'
    and p.is_active
    and a.tiktok_handle is not null;

comment on view public.creator_avatar_queue is
  'Active creators and the handle to fetch a picture by, with whatever we already have. The handle lives on applications, never on profiles.';

grant select on public.creator_avatar_queue to authenticated;
grant select on public.creator_avatar_queue to service_role;
