-- ============================================================================
-- A creator can read the offer and brand behind their own request.
-- ============================================================================
-- Until now a creator could read offers that were ACTIVE, on brands that were
-- ACTIVE. That is right for browsing: a switched-off offer is not on the table.
--
-- It is wrong for work already agreed. Switch off an offer that three creators
-- are halfway through, or retire a brand at the end of a campaign, and their
-- own dashboard would lose the name of the thing they are being paid for. The
-- money would still be listed; what it was for would not.
--
-- So: you may always read an offer you have asked for, and the brand it
-- belongs to, whatever happened to them afterwards. It grants nothing new
-- about anybody else's work, because it is scoped by the requests that are
-- already yours.
--
-- No recursion risk: the policies on `offer_applications` only ever test
-- `auth.uid()`, so nothing here loops back through this table.
-- ============================================================================

create policy "offers_select_own_requests"
  on public.offers for select to authenticated
  using (
    exists (
      select 1
      from public.offer_applications a
      where a.offer_id = offers.id
        and a.creator_id = (select auth.uid())
    )
  );

create policy "brands_select_own_requests"
  on public.brands for select to authenticated
  using (
    exists (
      select 1
      from public.offer_applications a
      where a.brand_id = brands.id
        and a.creator_id = (select auth.uid())
    )
  );
