import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ContestDashboard } from '@/components/creator/ContestDashboard';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { ContestEntryDialog } from '@/components/creator/ContestEntryDialog';
import { ContestProgressDialog } from '@/components/creator/ContestProgressDialog';
import { Confetti } from '@/components/creator/Confetti';
import {
  EarnGrid,
  EarnGroup,
  EarnPanel,
  EarnTileSkeleton,
} from '@/components/creator/earn/EarnPanel';
import { EarnFilters } from '@/components/creator/earn/EarnFilters';
import { CreatorSearch } from '@/components/creator/SearchField';
import { ContestTile } from '@/components/creator/earn/ContestTile';
import { TileIn } from '@/components/creator/earn/TileIn';
import { ViewSwitch } from '@/components/creator/earn/ViewSwitch';
import { useNow } from '@/components/creator/earn/use-now';
import { useContestWin } from '@/components/creator/earn/useContestWin';
import { DataError, EmptyState } from '@/components/ui/DataState';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  doorOf,
  entryStateOf,
  isLiveForThem,
  useCreatorContests,
  type CreatorContest,
} from '@/lib/creator/useCreatorContests';

/**
 * Every contest open to this creator, across every brand.
 *
 * The brand hub answers "what is this brand running". This answers "what is on
 * anywhere", which is the question somebody opens the app with.
 *
 * ORDERED BY WHICH DEADLINE RUNS OUT FIRST, IN THE DATABASE, because that is
 * the only ordering that matches why somebody opened the screen. Nothing here
 * re-sorts the list; the groups below preserve the order inside each one.
 *
 * TWO RULES DECIDE EVERYTHING BELOW, AND NEITHER CHANGED IN THE REDESIGN.
 *
 * 1. A contest that is switched off or past its deadline closes the DOOR, never
 *    the WORK. Anybody already in still sees it, still delivers and still gets
 *    paid, so a contest somebody holds an entry in is NEVER dropped from this
 *    screen and never greyed out. It is pinned to the TOP group, "Your
 *    entries", whatever its door says. Contests that are closed and that she is
 *    not in are grouped separately at the bottom, so a shut door cannot sit in
 *    the middle of the ones she can still act on.
 *
 * 2. Nothing here says anything about another entrant: no handle, no name, no
 *    figure. Decision D7. Her standing is anonymous — "You are #4 of 11" — and
 *    `AnonymousStanding` is the only thing that draws it. This differs on
 *    purpose from `/app/leaderboards`, which shows names.
 *
 * WHAT CHANGED, 2026-10-16 (redesign step 8). The screen was 1,356 lines in one
 * file, and each contest was a 15-to-20rem photographic hero plus three tabs
 * plus a facts band plus the action — about three screens per contest. It is
 * now a thin orchestrator over `src/components/creator/earn/`: one blurred
 * panel holding two groups of dense tiles, each tile carrying the brand, the
 * name, the prize, a countdown ring, her bar and her standing, with everything
 * else one tap down. Same data, same queries, same two rules.
 *
 * WHAT CHANGED LATER THE SAME DAY — THE CONTROLS WENT AWAY.
 *
 * Rashid: "the tabs that are loaded with buttons and toggles or sub tabs make
 * them simpler to use and ditch the buttons where you can for easier
 * usability." This was the worst screen in the app for it. Before a creator
 * reached a single contest she met a view switch, a four-chip status filter, a
 * brand dropdown and a search box — and THREE GROUPED HEADINGS underneath that
 * already sorted the same contests by the same states the chips filtered by.
 * The chips were a control asking her to do, by hand, the thing the screen was
 * doing for her anyway.
 *
 *   THE CHIP ROW IS GONE. The groups were already here and already carried
 *   their counts, so nothing had to be built to replace it: the four states are
 *   four headed groups she scrolls. "You are in" and "Waiting" were two
 *   separate chips over one group, and that distinction has always been on the
 *   TILE as its status pill, which is where it belongs — a pill sits next to
 *   the contest it describes, a chip makes you hide eleven others to find out.
 *   The count of how many are still waiting rides on the group's own note.
 *
 *   THE BRAND DROPDOWN IS GONE. It duplicated the search box exactly: the
 *   search has always matched a brand's name as well as a contest's. Browsing
 *   one brand is still two taps — type its name, or tap the brand chip on any
 *   tile and land in its hub, which is a place rather than a toggle.
 *
 *   THE VIEW SWITCH STAYS, as the one obvious control. "My progress" is a
 *   genuinely different screen (`ContestDashboard`) over the same data, it is
 *   the only route to it, and it keeps its state in the URL so it can be
 *   linked and shared. Rashid's own rule twice over: the default is the JOB,
 *   not the figures.
 *
 *   WHAT IS LEFT IS TWO CONTROLS: that switch, and the search box. The search
 *   earns it — it is the only thing on the screen that can answer "where was
 *   that contest with the serum", which no grouping can.
 *
 * THE ORDER IS STILL THE DATABASE'S. Deadline-first, `expires_at` ascending,
 * decided in `useCreatorContests`. Every group below is a `filter` over that
 * one array, and `filter` preserves order, so the contest closing soonest is
 * still the first tile in whichever group it belongs to. NOTHING HERE SORTS.
 *
 * THIS IS NOT `/app/earn`. §8 asked for Contests and Offers to be merged behind
 * a segmented control; Rashid overruled it — "keep all the current tabs please"
 * — so the two routes, the two nav labels and the two screens stay as they are.
 */

/**
 * `hubBrandId` renders this same screen inside a Brand Hub, showing only that
 * brand's contests.
 *
 * It is WHERE THE SCREEN IS, and it is now the only brand narrowing there is:
 * the creator's own brand dropdown is deleted, so there is no longer a second,
 * conflicting answer to "which brand am I looking at" on a page that is a
 * brand.
 *
 * NEITHER PLACE DRAWS A TITLE. The section name lives on the nav item and is
 * drawn by the top bar, so it costs no vertical space here; inside a hub the
 * rail names the section instead.
 */
export function Contests({ hubBrandId }: { hubBrandId?: string } = {}) {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  /*
   * ENTERING IS NARROWER THAN READING, and the screen has to say so rather than
   * find out. `is_approved_creator()` admits ops and admin so staff can BROWSE
   * a contest, while `apply_for_contest` asserts `creator` exactly (rule E6).
   * Without this a staff member reading their own product gets a primary Enter
   * button whose only possible outcome is a refusal.
   */
  const isCreator = role === 'creator';

  /* Two views, and the choice lives in the URL, which is the house pattern. */
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'progress' ? 'progress' : 'contests';
  const setView = (next: 'contests' | 'progress') =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        if (next === 'progress') q.set('view', 'progress');
        else q.delete('view');
        return q;
      },
      { replace: true }
    );

  const [search, setSearch] = useState('');
  const [entering, setEntering] = useState<CreatorContest | null>(null);
  /*
   * The contest whose progress panel is open, held as the contest rather than
   * as an id, so the panel can be titled and priced without reaching back into
   * the list for a row that may have been refetched underneath it.
   */
  const [updating, setUpdating] = useState<CreatorContest | null>(null);

  const now = useNow();
  /*
   * Her claimed and confirmed figures ride along with her entries, in the same
   * query, because they are the same question: what is true about my own
   * entries right now. So a tile that has an entry to draw always has the
   * figures to draw on it, and there is no third loading state on this screen.
   */
  const { contests, isLoading, isError } = useCreatorContests(hubBrandId);
  const queryClient = useQueryClient();
  /* The hook hands back no refetch, so retry invalidates the two reads it is built from. */
  const retry = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['creator', 'contests'] }),
      queryClient.invalidateQueries({ queryKey: ['creator', 'contest-entries'] }),
    ]);

  /**
   * THE SEARCH, AND NOTHING ELSE.
   *
   * It matches the brand's name as well as the contest's, which is why the
   * brand dropdown above it was deleted rather than rebuilt — it answered a
   * question this box was already answering.
   *
   * ORDER IS UNTOUCHED. `filter` preserves it, and it is the database's
   * deadline-first order.
   */
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return contests;
    return contests.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.brand?.name ?? '').toLowerCase().includes(needle) ||
        (c.description ?? '').toLowerCase().includes(needle)
    );
  }, [contests, search]);

  /*
   * THE FOUR GROUPS, and the lines that carry rule 1 above.
   *
   * `isLiveForThem` is 'in' or 'waiting', so HER OWN WORK IS PINNED TO THE TOP
   * GROUP WHATEVER THE DOOR SAYS, and a contest is only moved down to the shut
   * list when the door is closed AND she is not in it. A contest she holds an
   * entry in is never dropped, never greyed and never reordered out of reach:
   * that is the rule the whole screen exists to keep.
   *
   * COUNTED AFTER THE SEARCH, which is the opposite of what the chips did. A
   * chip's count had to describe the whole list, because a count that moved
   * when she changed chip would be counting what she could already see. A
   * HEADING is different: it labels the rows directly beneath it, so "Open to
   * join 3" under a search for "serum" has to mean three matching contests or
   * it is simply wrong.
   *
   * `declined` IS ITS OWN GROUP, 2026-10-16, for the same reason the offers
   * screen grew one: a rejected entry used to sit inside "Open to join" while
   * its own tile said "Not this time", so the two disagreed about the one state
   * a creator most needs told plainly. It stays above the shut list, because a
   * declined entry on an open contest is something she can still act on — the
   * tile offers "Ask again".
   */
  const entries = shown.filter((c) => isLiveForThem(c));
  const waiting = entries.filter((c) => entryStateOf(c) === 'waiting').length;
  const open = shown.filter((c) => !isLiveForThem(c) && doorOf(c, now) === 'open');
  const openToJoin = open.filter((c) => entryStateOf(c) !== 'declined');
  const declined = open.filter((c) => entryStateOf(c) === 'declined');
  const shut = shown.filter((c) => !isLiveForThem(c) && doorOf(c, now) !== 'open');

  /*
   * The open panel reads the CURRENT row rather than the copy that was captured
   * when it opened. Sending a claim invalidates the entries query, and a panel
   * holding the old object would still be showing figures the browser has since
   * been told are out of date. It falls back to the captured row so the panel
   * cannot vanish mid sentence if a filter or a refetch drops it from the list.
   */
  const updatingNow = updating
    ? (contests.find((c) => c.id === updating.id) ?? updating)
    : null;

  /*
   * A REAL WIN, AND ONLY A REAL WIN. Fires when a `contest_awards` row appears
   * while she is on this screen — money a person has confirmed — never on an
   * entry, never on a claim, and never on first paint. See `useContestWin`.
   */
  const celebrating = useContestWin(contests);

  const tile = (contest: CreatorContest, i: number) => (
    <TileIn key={contest.id} index={i}>
      <ContestTile
        contest={contest}
        now={now}
        canEnterAtAll={isCreator}
        onEnter={() => setEntering(contest)}
        onUpdateProgress={() => setUpdating(contest)}
      />
    </TileIn>
  );

  return (
    <>
      {!approved ? (
        <LockedUntilApproved className="mt-6" />
      ) : view === 'progress' ? (
        <>
          <ViewSwitch view={view} onChange={setView} />
          {isLoading ? (
            <EarnPanel>
              <EarnGrid min="30rem">
                {Array.from({ length: 2 }).map((_, i) => (
                  <EarnTileSkeleton key={i} className="h-64" />
                ))}
              </EarnGrid>
            </EarnPanel>
          ) : isError ? (
            <DataError
              className="mt-4"
              title="We could not load your progress"
              body="That is on our side, not yours. Your figures are safe with the team."
              onRetry={retry}
            />
          ) : (
            <ContestDashboard contests={contests} />
          )}
        </>
      ) : (
        <>
          <ViewSwitch view={view} onChange={setView} />

          {/*
            ONE BLURRED PANEL FOR THE WHOLE SCREEN. The controls and all three
            groups live inside it, and every tile in it is `wx-neo-raised-sm`:
            the same material with no blur. See `EarnPanel` for why.
          */}
          <EarnPanel>
            {/* ONE CONTROL IN HERE NOW. The chips and the brand dropdown are
                gone; the groups below do their work without being asked. */}
            <EarnFilters>
              <CreatorSearch
                value={search}
                onChange={setSearch}
                placeholder="Search contests or brands"
                label="Search contests or brands"
              />
            </EarnFilters>

            {isLoading ? (
              <EarnGrid>
                {Array.from({ length: 4 }).map((_, i) => (
                  <EarnTileSkeleton key={i} className="h-[18rem]" />
                ))}
              </EarnGrid>
            ) : isError ? (
              <DataError
                className="mt-4"
                title="We could not load the contests"
                body="That is on our side, not yours. Nothing you have entered or earned is lost."
                onRetry={retry}
              />
            ) : shown.length === 0 ? (
              contests.length === 0 ? (
                <EmptyState
                  className="mt-4"
                  title="No contests open right now"
                  body="A contest has a deadline and rewards for hitting targets. When a brand you work with runs one, it lands here."
                />
              ) : (
                <EmptyState
                  className="mt-4"
                  title="Nothing matches that"
                  body="Try a different search. A contest's name, its brand and its description are all searched."
                />
              )
            ) : (
              <>
                {/*
                  YOUR ENTRIES FIRST. §8.1, and rule 1: her own work never
                  leaves the top of the screen, whatever the door says.

                  ONE GROUP, NOT TWO. "You are in" and "Waiting" were separate
                  chips, and splitting them into separate groups would have
                  moved a contest she is waiting on BELOW one she is already in
                  — which is the same work at the same deadline, filed under a
                  decision the team has not made yet. The distinction is on
                  each tile's own status pill, and the count of how many are
                  still waiting is on this note, so nothing the chips said is
                  no longer said.
                */}
                {entries.length > 0 ? (
                  <EarnGroup
                    title="Your entries"
                    count={entries.length}
                    note={
                      waiting === 0
                        ? undefined
                        : waiting === entries.length
                          ? 'Waiting on the team to let you in. The answer lands here on its own, no refresh needed.'
                          : `${waiting} of these ${waiting === 1 ? 'is' : 'are'} still waiting on the team.`
                    }
                  >
                    <EarnGrid>{entries.map(tile)}</EarnGrid>
                  </EarnGroup>
                ) : null}

                {openToJoin.length > 0 ? (
                  <EarnGroup title="Open to join" count={openToJoin.length}>
                    <EarnGrid>{openToJoin.map(tile)}</EarnGrid>
                  </EarnGroup>
                ) : null}

                {/* Still open, and she was turned down for it. Her tile offers
                    "Ask again", so this is above the shut list, not in it. */}
                {declined.length > 0 ? (
                  <EarnGroup
                    title="Declined"
                    count={declined.length}
                    note="Not taken forward this time. These are still open, so you can ask again on any of them."
                  >
                    <EarnGrid>{declined.map(tile)}</EarnGrid>
                  </EarnGroup>
                ) : null}

                {/*
                  Deliberately does NOT promise these are kept. Once a contest
                  shuts, row security only keeps returning it to somebody who
                  holds an entry row on it, so what lands here is the ones she
                  asked about and was not in, plus anything that ran out while
                  this tab was open.
                */}
                {shut.length > 0 ? (
                  <EarnGroup
                    title="Closed, and you were not in these"
                    count={shut.length}
                    note="Their door has shut and you are not in them, so there is nothing to do here."
                  >
                    <EarnGrid>{shut.map(tile)}</EarnGrid>
                  </EarnGroup>
                ) : null}
              </>
            )}
          </EarnPanel>
        </>
      )}

      {/*
        Layer C of the blur budget, and only while it is open. Both of these are
        a bottom sheet on a phone and a centred dialog on a desktop already, and
        that behaviour is kept exactly as it was.
      */}
      {entering ? (
        <ContestEntryDialog contest={entering} onClose={() => setEntering(null)} />
      ) : null}

      {/*
        Only ever opened from a tile whose entry is approved, so the entry is
        there. `submit_contest_progress` matches the entry on creator_id as well
        as on its id besides, so an entry id that arrived any other way is
        refused as "that is not one of your contests".
      */}
      {updatingNow?.entry ? (
        <ContestProgressDialog contest={updatingNow} onClose={() => setUpdating(null)} />
      ) : null}

      {celebrating ? <Confetti /> : null}
    </>
  );
}
