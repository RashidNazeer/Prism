import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { joinChannel } from '@/lib/realtime';
import { contestLifecycleOf, type ContestLifecycle } from '@/lib/contest-state';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * Contests, as a CREATOR sees them.
 *
 * The staff view of the same eleven tables is `src/lib/admin/useContests.ts`,
 * and the two are deliberately separate files that may not import each other.
 * That split is what stops a creator screen quietly inheriting a query that
 * reaches for `contest_commercials`, which is the contest feature's equivalent
 * of a brand's budget: staff only at the database, no creator policy at all,
 * and none may ever be added.
 *
 * NOT ONE STATUS FILTER IN THIS FILE, AND THAT IS THE POINT.
 *
 * Row level security decides every row here. `contests_select_creator` returns
 * a contest that is on, inside its window, belonging to a live brand, to an
 * approved creator who is not barred from it. `contests_select_own_entries`
 * returns any contest they hold an entry in, whatever state it has since moved
 * to. Everything else on this screen is their own row by policy.
 *
 * So there is no `.eq('status', 'active')` here, no expiry comparison, and no
 * exclusion check. Writing one would produce the same list today and disguise
 * which layer is doing the work, and the day the policy changed the screen
 * would keep answering from a filter nobody remembered was there. It also has
 * to stay visible that an excluded creator is removed by the DATABASE: there is
 * no card to hide, no button to disable and nothing on this screen that knows
 * they were ever barred.
 *
 * WHAT A CLOSED CONTEST DOES, because it is the rule the whole feature turns
 * on: switching a contest off, or letting its deadline pass, closes the DOOR,
 * never the WORK. Anybody already in still sees it, still delivers and still
 * gets paid. Nothing in this file may ever drop a contest somebody holds an
 * entry in.
 *
 * AND WHAT IS NOT HERE, by decision D7: no entrant count, no other creator, no
 * position in a field, no "you are 3rd of 14". Not as a column, not as a
 * derived number, not as a hint. The database refuses to serve those facts; the
 * client must not reconstruct them.
 */

/* ------------------------------------------------------------------ shapes -- */

export type ContestEntryStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type ContestRewardKind = 'fixed' | 'rank' | 'milestone';

export interface CreatorContestBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/**
 * One reward row, exactly as an admin typed it.
 *
 * `rewardAmount` is genuinely nullable and a null is NOT a zero. A row with no
 * amount reads "Not set yet" everywhere it is drawn, because printing a zero
 * where nothing has been decided tells a creator this contest pays nothing.
 */
export interface CreatorContestReward {
  id: string;
  contestId: string;
  kind: ContestRewardKind;
  title: string;
  detail: string | null;
  videoCount: number | null;
  rankPosition: number | null;
  metric: string | null;
  threshold: number | null;
  rewardAmount: number | null;
  sortOrder: number;
}

export interface CreatorContestProduct {
  contestId: string;
  productId: string;
  productName: string;
}

export interface CreatorContestEntry {
  id: string;
  contestId: string;
  brandId: string;
  status: ContestEntryStatus;
  /** True when the contest was on auto approve at the moment they entered. */
  autoApproved: boolean;
  currency: string;
  /** The fixed money, frozen at approval. Null until approved, or if none. */
  committedAmount: number | null;
  committedVideoCount: number | null;
  note: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/**
 * What one entrant was promised, copied at the moment they were approved and
 * never read live from the contest again.
 *
 * This is why an approved card stops quoting `rewards` and starts quoting
 * these: an admin adding, retiring or re-pricing a reward row on Friday must
 * not rewrite what somebody agreed to on Monday.
 */
export interface CreatorContestTerm {
  id: string;
  entryId: string;
  kind: ContestRewardKind;
  title: string;
  detail: string | null;
  videoCount: number | null;
  rankPosition: number | null;
  metric: string | null;
  threshold: number | null;
  rewardAmount: number | null;
  currency: string;
}

/** One row of `contest_entry_progress`, which is keyed to exactly one entry. */
export interface CreatorEntryProgress {
  entryId: string;
  contestId: string;
  /** Frozen at approval. Null means an open ended entry, so draw no bar. */
  required: number | null;
  approved: number;
  waiting: number;
  needsAnotherTake: number;
  posted: number;
  stillToFilm: number;
}

export interface CreatorContest {
  id: string;
  brandId: string;
  brand: CreatorContestBrand | null;
  name: string;
  description: string | null;
  /** The sentence that IS the judging, because nothing here computes a placing. */
  judgingBasis: string | null;
  briefUrl: string | null;
  bannerUrl: string | null;
  status: 'active' | 'inactive';
  needsAdminApproval: boolean;
  opensAt: string;
  expiresAt: string;
  /** An IANA zone name, always shown, never the reader's own. Rule L6. */
  expiresAtTimezone: string;
  currency: string;
  settledAt: string | null;
  cancelledAt: string | null;
  cancelMessage: string | null;
  rewards: CreatorContestReward[];
  products: CreatorContestProduct[];
  /** Their own entry, if they have one. Never anybody else's, by policy. */
  entry: CreatorContestEntry | null;
  /** Frozen terms, once approved. Empty until then. */
  terms: CreatorContestTerm[];
  progress: CreatorEntryProgress | null;
  /** Their own private target. Staff cannot read this, and never will. */
  target: number | null;
}

/* ------------------------------------------------------------- the door --- */

/**
 * Where the contest itself has got to. FIVE answers, and not one of them says
 * anything about whether this creator may still work or be paid.
 *
 * "Active" is three questions wearing one word: may somebody new enter, may
 * anybody read it, and may the people already in carry on. This answers only
 * the first, which is why it is called the door.
 *
 * THE BODY LIVES IN `src/lib/contest-state.ts`, shared with the staff side. The
 * two had identical copies for a day, which is how a creator ends up reading
 * one word for a state and an admin reading another for the same row.
 */
export type ContestDoor = ContestLifecycle;

export function doorOf(c: CreatorContest, now = Date.now()): ContestDoor {
  return contestLifecycleOf(c, now);
}

/** Where THEY stand, which is a different question from the one above. */
export type ContestEntryState = 'in' | 'waiting' | 'declined' | 'withdrawn' | 'none';

export function entryStateOf(c: CreatorContest): ContestEntryState {
  const s = c.entry?.status;
  if (s === 'approved') return 'in';
  if (s === 'pending') return 'waiting';
  if (s === 'rejected') return 'declined';
  if (s === 'withdrawn') return 'withdrawn';
  return 'none';
}

/**
 * Whether tapping Enter would do anything.
 *
 * A courtesy, not a boundary. `apply_for_contest` re-checks every one of these
 * under a row lock, plus the exclusion the browser is never told about, because
 * a creator holding an id can post straight at the Edge Function.
 */
export function canEnter(c: CreatorContest, now = Date.now()): boolean {
  const state = entryStateOf(c);
  return (
    doorOf(c, now) === 'open' &&
    (state === 'none' || state === 'declined' || state === 'withdrawn')
  );
}

/** Live work outranks a shut door: they are in it, so it is still theirs. */
export function isLiveForThem(c: CreatorContest): boolean {
  const state = entryStateOf(c);
  return state === 'in' || state === 'waiting';
}

/* ------------------------------------------------------------ the reads --- */

const CONTEST_COLUMNS =
  'id, brand_id, name, description, judging_basis, brief_url, banner_url, status, ' +
  'needs_admin_approval, opens_at, expires_at, expires_at_timezone, currency, ' +
  'settled_at, cancelled_at, cancel_message, ' +
  'brand:brands (id, name, slug, logo_url)';

/*
 * A ceiling rather than a page, exactly as `useAllCreatorOffers` carries one.
 * A creator's whole world here is the contests of the handful of brands they
 * work with, and the grouping that actually matters to them (in, waiting, not
 * entered) lives in a different table from the contests themselves, so paging
 * would mean paging a list whose useful order is elsewhere. If anybody ever
 * hits this number, the answer is a view, not a bigger number.
 */
const CEILING = 200;

interface ContestRow {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  judging_basis: string | null;
  brief_url: string | null;
  banner_url: string | null;
  status: 'active' | 'inactive';
  needs_admin_approval: boolean;
  opens_at: string;
  expires_at: string;
  expires_at_timezone: string;
  currency: string;
  settled_at: string | null;
  cancelled_at: string | null;
  cancel_message: string | null;
  brand: { id: string; name: string; slug: string; logo_url: string | null } | null;
}

interface RewardRow {
  id: string;
  contest_id: string;
  kind: ContestRewardKind;
  title: string;
  detail: string | null;
  video_count: number | null;
  rank_position: number | null;
  metric: string | null;
  threshold: number | null;
  reward_amount: number | null;
  sort_order: number;
}

interface ProductRow {
  contest_id: string;
  product_id: string;
  product_name: string;
}

export interface CreatorContestCatalogue {
  contests: ContestRow[];
  rewards: RewardRow[];
  products: ProductRow[];
}

/**
 * Every contest this creator can see, with what it asks for and what it pays.
 *
 * THREE READS, NOT ONE NESTED SELECT. The three tables carry three different
 * policies, and a nested select that silently returns an empty array for one of
 * them looks exactly like a contest with no reward rows. Reading them apart
 * means an error is an error and an empty list is an empty list.
 *
 * No `contest_id` filter on the reward rows or the products either. Both
 * policies are written as "exists a contest I can read", evaluated with the
 * caller's own rights, so the rows that come back are already the rows of the
 * contests above. Passing a list of ids would be the client re-deciding
 * something the database has already decided.
 */
export function useCreatorContestCatalogue() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator', 'contests'],
    staleTime: 30_000,
    /*
     * Rule L5, the ticking clock. A contest closes because a deadline passed,
     * which writes no row, so it fires no realtime event and invalidates
     * nothing. Without this a tab left open across a deadline keeps showing
     * "Closes in 2 hours" and an Enter button on a contest nobody can enter.
     */
    refetchInterval: 60_000,
    queryFn: async (): Promise<CreatorContestCatalogue> => {
      const sb = getSupabase();

      const [c, d, p] = await Promise.all([
        sb
          .from('contests')
          .select(CONTEST_COLUMNS)
          // Soonest deadline first, which is the order the screen wants and the
          // order `contests_soonest_idx` was built for.
          .order('expires_at', { ascending: true })
          .limit(CEILING),
        sb
          .from('contest_deliverables')
          .select(
            'id, contest_id, kind, title, detail, video_count, rank_position, metric, ' +
              'threshold, reward_amount, sort_order'
          )
          .order('sort_order', { ascending: true })
          .limit(CEILING * 8),
        sb
          .from('contest_products')
          .select('contest_id, product_id, product_name')
          .order('product_name', { ascending: true })
          .limit(CEILING * 8),
      ]);

      if (c.error) throw c.error;
      if (d.error) throw d.error;
      if (p.error) throw p.error;

      return {
        contests: (c.data ?? []) as unknown as ContestRow[],
        rewards: (d.data ?? []) as unknown as RewardRow[],
        products: (p.data ?? []) as unknown as ProductRow[],
      };
    },
  });

  /*
   * An admin editing a contest lands here without a reload: a new contest, a
   * renamed one, a moved deadline, a switch flipped.
   *
   * Through `joinChannel` rather than `supabase.channel()`, always. Two
   * components on one screen asking for the same channel name is what crashed
   * the whole page on 2026-08-13: `supabase.channel(name)` hands back the
   * EXISTING channel when one is open, and `.on()` after `subscribe()` throws
   * during render. See src/lib/realtime.ts.
   */
  useEffect(() => {
    return joinChannel('creator-contest-catalogue', [{ table: 'contests' }], () => {
      void queryClient.invalidateQueries({ queryKey: ['creator', 'contests'] });
    });
  }, [queryClient]);

  return query;
}

interface EntryRow {
  id: string;
  contest_id: string;
  brand_id: string;
  status: ContestEntryStatus;
  auto_approved: boolean;
  currency: string;
  committed_amount: number | null;
  committed_video_count: number | null;
  note: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

interface TermRow {
  id: string;
  entry_id: string;
  kind: ContestRewardKind;
  title: string;
  detail: string | null;
  video_count: number | null;
  rank_position: number | null;
  metric: string | null;
  threshold: number | null;
  reward_amount: number | null;
  currency: string;
}

interface ProgressRow {
  entry_id: string;
  contest_id: string;
  required: number | null;
  approved: number;
  waiting: number;
  needs_another_take: number;
  posted: number;
  still_to_film: number;
}

interface TargetRow {
  entry_id: string;
  target: number;
}

export interface MyContestEntries {
  entries: EntryRow[];
  terms: TermRow[];
  progress: ProgressRow[];
  targets: TargetRow[];
}

/**
 * Their own side of every contest: the entry, what was promised, how much has
 * been filmed, and the private number they set themselves.
 *
 * Kept live on `contest_entries`, filtered to their own rows. A decision has to
 * land while they are looking at the screen, because being told immediately is
 * the whole point of this product. `contest_submissions` is on the same channel
 * because the progress view counts them, so a video being approved moves the
 * bar under their hands.
 *
 * The `creator_id` filter is load bearing rather than tidiness: postgres_changes
 * does not apply row security to DELETE events, so an unfiltered binding would
 * hand this browser the old row of somebody else's deleted entry.
 */
export function useMyContestEntries() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['creator', 'contest-entries'],
    staleTime: 15_000,
    queryFn: async (): Promise<MyContestEntries> => {
      const sb = getSupabase();

      const [e, t, g, k] = await Promise.all([
        sb
          .from('contest_entries')
          .select(
            'id, contest_id, brand_id, status, auto_approved, currency, committed_amount, ' +
              'committed_video_count, note, decision_note, decided_at, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(CEILING),
        sb
          .from('contest_entry_terms')
          .select(
            'id, entry_id, kind, title, detail, video_count, rank_position, metric, ' +
              'threshold, reward_amount, currency'
          )
          .limit(CEILING * 8),
        sb
          .from('contest_entry_progress')
          .select(
            'entry_id, contest_id, required, approved, waiting, needs_another_take, ' +
              'posted, still_to_film'
          )
          .limit(CEILING),
        sb.from('contest_entry_targets').select('entry_id, target').limit(CEILING),
      ]);

      if (e.error) throw e.error;
      if (t.error) throw t.error;
      if (g.error) throw g.error;
      if (k.error) throw k.error;

      return {
        entries: (e.data ?? []) as unknown as EntryRow[],
        terms: (t.data ?? []) as unknown as TermRow[],
        progress: (g.data ?? []) as unknown as ProgressRow[],
        targets: (k.data ?? []) as unknown as TargetRow[],
      };
    },
  });

  useEffect(() => {
    if (!user?.id) return;

    return joinChannel(
      `creator-contest-entries:${user.id}`,
      [
        { table: 'contest_entries', filter: `creator_id=eq.${user.id}` },
        { table: 'contest_submissions', filter: `creator_id=eq.${user.id}` },
      ],
      () => {
        void queryClient.invalidateQueries({ queryKey: ['creator', 'contest-entries'] });
      }
    );
  }, [user?.id, queryClient]);

  return query;
}

/* ----------------------------------------------------------- the joining -- */

const flattenReward = (r: RewardRow): CreatorContestReward => ({
  id: r.id,
  contestId: r.contest_id,
  kind: r.kind,
  title: r.title,
  detail: r.detail,
  videoCount: r.video_count,
  rankPosition: r.rank_position,
  metric: r.metric,
  threshold: r.threshold,
  rewardAmount: r.reward_amount,
  sortOrder: r.sort_order,
});

const flattenTerm = (t: TermRow): CreatorContestTerm => ({
  id: t.id,
  entryId: t.entry_id,
  kind: t.kind,
  title: t.title,
  detail: t.detail,
  videoCount: t.video_count,
  rankPosition: t.rank_position,
  metric: t.metric,
  threshold: t.threshold,
  rewardAmount: t.reward_amount,
  currency: t.currency,
});

/**
 * Everything on one screen, stitched.
 *
 * The two halves are separate queries because they change for different
 * reasons and at different speeds: the catalogue moves when an admin edits
 * something, their own entries move when somebody decides or when they film.
 * Joining them here rather than in the database is the same call
 * `useAllCreatorOffers` made, and for the same reason: the grouping a creator
 * actually wants crosses two tables with two different policies.
 *
 * THE NEWEST ENTRY PER CONTEST WINS. Somebody rejected in March can enter again
 * in June, and somebody who withdrew can change their mind, so a contest can
 * carry several rows and only the newest describes today. The partial unique
 * index guarantees at most one of them is live.
 */
export function useCreatorContests() {
  const catalogue = useCreatorContestCatalogue();
  const mine = useMyContestEntries();

  const contests = useMemo((): CreatorContest[] => {
    const rows = catalogue.data?.contests ?? [];
    if (rows.length === 0) return [];

    const rewards = new Map<string, CreatorContestReward[]>();
    for (const r of catalogue.data?.rewards ?? []) {
      const list = rewards.get(r.contest_id) ?? [];
      list.push(flattenReward(r));
      rewards.set(r.contest_id, list);
    }

    const products = new Map<string, CreatorContestProduct[]>();
    for (const p of catalogue.data?.products ?? []) {
      const list = products.get(p.contest_id) ?? [];
      list.push({
        contestId: p.contest_id,
        productId: p.product_id,
        productName: p.product_name,
      });
      products.set(p.contest_id, list);
    }

    // Newest first out of the query, so the first one seen is the one that
    // describes today.
    const entryFor = new Map<string, EntryRow>();
    for (const e of mine.data?.entries ?? []) {
      if (!entryFor.has(e.contest_id)) entryFor.set(e.contest_id, e);
    }

    const termsFor = new Map<string, CreatorContestTerm[]>();
    for (const t of mine.data?.terms ?? []) {
      const list = termsFor.get(t.entry_id) ?? [];
      list.push(flattenTerm(t));
      termsFor.set(t.entry_id, list);
    }

    const progressFor = new Map<string, CreatorEntryProgress>();
    for (const g of mine.data?.progress ?? []) {
      progressFor.set(g.entry_id, {
        entryId: g.entry_id,
        contestId: g.contest_id,
        required: g.required,
        approved: g.approved,
        waiting: g.waiting,
        needsAnotherTake: g.needs_another_take,
        posted: g.posted,
        stillToFilm: g.still_to_film,
      });
    }

    const targetFor = new Map<string, number>();
    for (const k of mine.data?.targets ?? []) targetFor.set(k.entry_id, k.target);

    return rows.map((r): CreatorContest => {
      const row = entryFor.get(r.id) ?? null;
      const entry: CreatorContestEntry | null = row
        ? {
            id: row.id,
            contestId: row.contest_id,
            brandId: row.brand_id,
            status: row.status,
            autoApproved: row.auto_approved,
            currency: row.currency,
            committedAmount: row.committed_amount,
            committedVideoCount: row.committed_video_count,
            note: row.note,
            decisionNote: row.decision_note,
            decidedAt: row.decided_at,
            createdAt: row.created_at,
          }
        : null;

      return {
        id: r.id,
        brandId: r.brand_id,
        brand: r.brand
          ? {
              id: r.brand.id,
              name: r.brand.name,
              slug: r.brand.slug,
              logoUrl: r.brand.logo_url,
            }
          : null,
        name: r.name,
        description: r.description,
        judgingBasis: r.judging_basis,
        briefUrl: r.brief_url,
        bannerUrl: r.banner_url,
        status: r.status,
        needsAdminApproval: r.needs_admin_approval,
        opensAt: r.opens_at,
        expiresAt: r.expires_at,
        expiresAtTimezone: r.expires_at_timezone,
        currency: r.currency,
        settledAt: r.settled_at,
        cancelledAt: r.cancelled_at,
        cancelMessage: r.cancel_message,
        rewards: rewards.get(r.id) ?? [],
        products: products.get(r.id) ?? [],
        entry,
        terms: entry ? (termsFor.get(entry.id) ?? []) : [],
        progress: entry ? (progressFor.get(entry.id) ?? null) : null,
        target: entry ? (targetFor.get(entry.id) ?? null) : null,
      };
    });
  }, [catalogue.data, mine.data]);

  return {
    contests,
    // The catalogue decides whether there is a screen at all. Their own rows
    // arriving a moment later fills the cards in, and a card is honest without
    // them: "not entered yet" is what a contest with no entry row means.
    isLoading: catalogue.isLoading,
    isError: catalogue.isError || mine.isError,
    error: (catalogue.error ?? mine.error) as Error | null,
  };
}

/* --------------------------------------------------------------- writing -- */

export type EnterContestPayload = {
  action: 'contest.enter';
  contestId: string;
  note: string | null;
};

export type WithdrawEntryPayload = { action: 'contest.withdraw'; entryId: string };

/** NULL clears it. Changing a target and dropping one are the same act. */
export type SetTargetPayload = {
  action: 'contest.target';
  entryId: string;
  target: number | null;
};

/**
 * Entering, withdrawing, and the private target.
 *
 * Not a table write, and there is no way to make it one: not one of the eleven
 * contest tables carries an insert, update or delete policy, and every database
 * function behind them is granted to `service_role` alone. The `enter-contest`
 * Edge Function re-reads who the caller is from the profiles table and calls a
 * security definer function that writes the row, its history and its audit
 * entry in one transaction.
 *
 * A SEPARATE DOOR from `manage-contest`, which is staff only. Same reason
 * `useApplyForOffer` and the admin's review mutation are separate: the role
 * check is different, and a shared hook is how the wrong one gets called.
 */
export function useEnterContest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: EnterContestPayload | WithdrawEntryPayload | SetTargetPayload
    ) => {
      const { data, error } = await getSupabase().functions.invoke('enter-contest', {
        body: payload,
      });
      if (error) throw new Error(await messageFrom(error));
      return (data as { result: unknown }).result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator', 'contest-entries'] });
      /*
       * The catalogue too, and not only for tidiness. Entering an auto approve
       * contest freezes terms in the same transaction, and the card has to stop
       * quoting the contest's live reward rows and start quoting the frozen
       * ones the moment it does.
       */
      void queryClient.invalidateQueries({ queryKey: ['creator', 'contests'] });
    },
  });
}

/**
 * Pull the real message out of a failed function call.
 *
 * `functions.invoke` reports any non-2xx as a generic "Edge Function returned a
 * non-2xx status code" and hides the body on `error.context`, which is the
 * actual Response. Without this a creator sees that sentence instead of "that
 * contest closed on 31 Aug 2026 23:59 UTC", which is the whole reason the
 * database writes its refusals as sentences.
 *
 * A copy of the one in `useOfferApplications`, which is deliberately not
 * exported: three lines duplicated inside the same folder beats a shared
 * helper that later grows a special case for one caller.
 */
async function messageFrom(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Body was not JSON. Fall through to the generic message.
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'That did not go through. Try again.';
}
