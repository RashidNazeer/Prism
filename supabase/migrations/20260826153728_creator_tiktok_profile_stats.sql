-- ============================================================================
-- The creator's TikTok profile and account totals.
--
-- WHY THIS EXISTS, AND IT IS NOT A FEATURE REQUEST.
--
-- The Display API application was submitted asking for FOUR scopes:
--   user.info.basic  user.info.profile  user.info.stats  video.list
-- while the code requested two. TikTok's review guidelines require every
-- requested scope to be demonstrated, and "asks for permissions it does not
-- use" is one of their listed rejection reasons — so the mismatch had to close
-- one way or the other. It closes here, by USING them: a username, a verified
-- badge and a follower count are things this product wants anyway, because a
-- brand manager deciding which offers suit a creator is asking exactly that.
--
-- ONLY THE FIELDS WE ACTUALLY SHOW ARE STORED. `bio_description` and
-- `following_count` come free with these scopes and are deliberately NOT kept:
-- data we do not display is data we cannot justify holding, and the privacy
-- policy at /privacy enumerates what we keep.
--
-- STILL NO TOKEN IN THIS TABLE. It is readable by its owner. See the header of
-- 20260825235328_creator_tiktok_connection.sql, which explains why that single
-- fact governs every column added here, forever.
-- ============================================================================

alter table public.creator_tiktok_connections
  -- ---- user.info.profile ---------------------------------------------------
  -- The @handle. Distinct from display_name, which a creator can set to
  -- anything and which several accounts may share. This is the one that
  -- identifies them, and the reason a creator running more than one account can
  -- tell which of them they just connected.
  add column if not exists username          text,
  -- Where their profile lives, so the card can offer "View on TikTok" rather
  -- than making somebody construct a URL out of a handle.
  add column if not exists profile_deep_link text,
  -- TikTok's own verification, shown as a badge. NOT a Wurx status: nothing in
  -- this product may key off it, because it is a third party's judgement about
  -- an account and not a fact about the person's work here.
  add column if not exists is_verified       boolean,

  -- ---- user.info.stats -----------------------------------------------------
  /*
   * ALL NULLABLE, AND NULL MEANS "WE DO NOT KNOW", NEVER ZERO.
   *
   * Same rule as the per-video counts next door, for the same reason: a token
   * minted before these scopes existed cannot answer these questions, and a
   * creator with an older connection must see a dash rather than be told they
   * have no followers. A zero is a number they would believe.
   */
  add column if not exists follower_count    integer,
  -- bigint, not integer. A large account's lifetime likes pass 2^31 (2.1bn),
  -- and an overflow here would be silent nonsense on somebody's own profile.
  add column if not exists likes_count       bigint,
  add column if not exists video_count       integer,

  -- When the profile block above was last read from TikTok, which is a
  -- different question from when their VIDEOS were last read (last_synced_at):
  -- the two are fetched in the same pass but either can fail alone.
  add column if not exists profile_synced_at timestamptz;

comment on column public.creator_tiktok_connections.username is
  'TikTok @handle, from user.info.profile. Null on connections made before that scope was granted.';
comment on column public.creator_tiktok_connections.is_verified is
  'TikTok''s own verified badge. Display only: nothing in this product may grant tier, access or money on the strength of it.';
comment on column public.creator_tiktok_connections.follower_count is
  'From user.info.stats. NULL means not known, never zero.';
comment on column public.creator_tiktok_connections.likes_count is
  'Lifetime likes across the whole account, from user.info.stats. bigint because a large account passes 2^31.';

/*
 * NO NEW GRANTS ARE NEEDED, and that is worth stating rather than leaving to
 * memory. `grant select on table ... to authenticated` in the original
 * migration is TABLE level, so it already covers columns added later. The trap
 * this project has hit before is the opposite one — COLUMN level grants, which
 * do NOT extend to new columns — and we deliberately do not use those here.
 *
 * The RLS policies are unchanged and still say "your own row, or you are
 * staff". A creator reads their own follower count; nobody else's.
 */
