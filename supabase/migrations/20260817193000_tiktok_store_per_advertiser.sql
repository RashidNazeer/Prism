-- ============================================================================
-- A store is not unique. The PAIR of advertiser and store is.
--
-- Found the moment real data arrived, 2026-08-17. Both of Rashid's ad accounts
-- returned the SAME TikTok Shop, Penetrex: it is authorised to Biomax-PX and it
-- also comes back on Infirst Healthcare's store list, because they share a
-- Business Center. With `store_id` as the primary key the second upsert simply
-- overwrote the first, and the row ended up filed under whichever advertiser
-- happened to be processed last.
--
-- WHY THAT MATTERS MORE THAN IT LOOKS. Every GMV Max report call is made for a
-- specific `advertiser_id`, and it is that advertiser's spend that comes back.
-- A store filed under the wrong one would mean asking the wrong account for the
-- numbers and attributing another advertiser's spend to a creator's video. It
-- would not error. It would just be wrong, quietly, in money.
--
-- The flags proved it too: the same store arrived with
-- `is_gmv_max_available: true` from one account and `false` from the other, and
-- the false won by being last. Those are facts about the PAIR, not the store.
-- ============================================================================

alter table public.tiktok_stores
  drop constraint tiktok_stores_pkey;

alter table public.tiktok_stores
  add constraint tiktok_stores_pkey primary key (advertiser_id, store_id);

comment on table public.tiktok_stores is
  'TikTok Shop stores per AD ACCOUNT. Keyed on the pair because one store can be authorised to several advertisers, and the GMV Max figures belong to the pair rather than to the store.';

-- The brand mapping now lives on the pair as well, which is the honest shape:
-- it says "this brand's numbers come from this store, through this ad account".
create index if not exists tiktok_stores_store_idx on public.tiktok_stores (store_id);
