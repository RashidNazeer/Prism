/*
 * Make the CATALOGUE live for creators, not just their own requests.
 *
 * `offer_applications` and `offer_stage_events` have been in the realtime
 * publication since they shipped, so a creator's own work moves on screen the
 * moment an admin touches it. The things an admin EDITS did not: `brands` and
 * `offers` were published but nothing creator-facing subscribed to them, and
 * `brand_products` was never published at all.
 *
 * The effect was that an admin could rename an offer, re-price it, retire a
 * brand or add a product, and every creator looking at that screen carried on
 * seeing the old one until they happened to refetch. Rashid found it by
 * watching a screen that never changed, which is a fair way to find it.
 *
 * `brands` and `offers` are already members, so only products need adding here.
 * Row level security still decides what actually reaches a browser: a retired
 * brand or a hidden product produces a change event the creator is not
 * authorised to receive, so they simply never see it.
 */

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'brand_products'
  ) then
    alter publication supabase_realtime add table public.brand_products;
  end if;
end
$$;

-- Full rows on the wire, so a DELETE carries enough for a subscriber to know
-- which product went away rather than just an id they never stored.
alter table public.brand_products replica identity full;
