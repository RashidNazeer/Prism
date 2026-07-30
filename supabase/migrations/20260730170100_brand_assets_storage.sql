-- ============================================================================
-- Storage for brand logos and product images.
-- ============================================================================
-- Asking an admin to paste a URL is not a feature, it is a dead end: they have
-- a file, not a link. So there is a bucket, and the About tab uploads into it.
--
-- Public read on purpose. These are logos and product shots that are already
-- on a public TikTok Shop listing, and serving them through signed URLs would
-- mean every card on every hub waiting on a token before it can show a picture.
-- Nothing private is ever placed here.
--
-- SVG is deliberately absent from the allowed types. An SVG is a script host,
-- and while Supabase serves storage from its own domain rather than ours, a
-- format that can execute has no business in an upload box we hand to staff.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  2097152, -- 2 MB. A logo that needs more than this is the wrong file.
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read. Only active staff may put anything in, change it or remove
-- it, and that is decided by the same `is_staff()` gate as the rest of the
-- admin panel rather than by a separate rule that could drift away from it.

drop policy if exists "brand_assets_read" on storage.objects;
create policy "brand_assets_read"
  on storage.objects for select
  using (bucket_id = 'brand-assets');

drop policy if exists "brand_assets_insert_staff" on storage.objects;
create policy "brand_assets_insert_staff"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and public.is_staff());

drop policy if exists "brand_assets_update_staff" on storage.objects;
create policy "brand_assets_update_staff"
  on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and public.is_staff())
  with check (bucket_id = 'brand-assets' and public.is_staff());

drop policy if exists "brand_assets_delete_staff" on storage.objects;
create policy "brand_assets_delete_staff"
  on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and public.is_staff());
