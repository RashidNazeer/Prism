import { useMemo, useState } from 'react';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import { OfferCard } from '@/components/creator/OfferCard';
import {
  EarnGrid,
  EarnGroup,
  EarnPanel,
  EarnTileSkeleton,
} from '@/components/creator/earn/EarnPanel';
import { EarnFilters } from '@/components/creator/earn/EarnFilters';
import { CreatorSearch } from '@/components/creator/SearchField';
import { TileIn } from '@/components/creator/earn/TileIn';
import { DataError, EmptyState } from '@/components/ui/DataState';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  stateFor,
  useAllCreatorOffers,
  useAllMyRequests,
  type CreatorOfferRow,
  type CreatorOfferState,
} from '@/lib/creator/useAllOffers';
import type { MyOfferApplication } from '@/lib/creator/useOfferApplications';
import { useCatalogueLive } from '@/lib/creator/useCatalogueLive';
import { useMyJobProgress } from '@/lib/work/job-progress';

/**
 * Every offer open to this creator, across every brand.
 *
 * The brand hub answers "what is this brand offering me". This answers "what is
 * on the table anywhere", which is the question a creator actually opens the
 * app with. Before this, seeing everything meant remembering every brand and
 * visiting each hub in turn.
 *
 * FILTERING HAPPENS IN THE BROWSER RATHER THAN THE DATABASE, AND THAT IS A
 * DELIBERATE EXCEPTION TO THE PROJECT'S USUAL RULE. The grouping that matters
 * here is "am I in", "am I waiting", "have I not asked", and those live in a
 * different table from the offers themselves. Fetching the offers and her own
 * requests once, then sorting them out here, is ONE ROUND TRIP instead of a
 * join she would feel on every tap. §8.2 keeps this as it is.
 *
 * WHAT CHANGED, 2026-10-16, SECOND PASS — THE CONTROLS WENT AWAY.
 *
 * Rashid: "the tabs that are loaded with buttons and toggles or sub tabs make
 * them simpler to use and ditch the buttons where you can for easier
 * usability." This screen met a creator with five status chips, a brand select
 * and a search box before a single offer. Three of those answered the same
 * question — which offers do I care about — and two of them made her answer it
 * before she could see anything.
 *
 *   THE CHIP ROW IS GONE, AND THE LIST IS GROUPED BY STATUS INSTEAD. The five
 *   states are now five headed groups she scrolls past, each with the count the
 *   chip used to carry. The information survives; the interaction does not. A
 *   filter whose job is to hide four fifths of a short list is a question the
 *   screen can answer for her, and a chip row cannot show her that she has one
 *   offer waiting AND two open at the same time, which is the actual state of
 *   her week.
 *
 *   THE BRAND SELECT IS GONE. It duplicated the search box exactly — the
 *   search already matches a brand's name, and it always has (see `shown`
 *   below). Two controls for one question, one of them a dropdown that had to
 *   be opened to find out what was in it. Filtering to one brand is still
 *   reachable two ways: type its name, or tap the brand chip on any card and
 *   land in its hub, which is a place rather than a toggle.
 *
 *   WHAT IS LEFT IS ONE CONTROL: the search box. It earns it — it is the only
 *   thing on the screen that can answer "where was that offer about the
 *   serum", which neither a group nor a chip can.
 *
 * THIS IS NOT `/app/earn`. §8 asked for Offers and Contests to be merged behind
 * a segmented control; Rashid overruled it — "keep all the current tabs please"
 * — so the two routes and the two nav labels stay exactly as they are.
 */

/**
 * The five states, in the order a creator cares about them, as headed groups.
 *
 * ORDER IS BY WHAT SHE CAN DO ABOUT IT, not by how many there are.
 *
 *   accepted  money and work already in flight. Hers, and it has a deadline.
 *   waiting   she has asked and is owed an answer. Nothing to do but worth
 *             seeing, because "did I ask for that one?" is a real question.
 *   yours     needs no application at all, so it is hers the moment she wants
 *             it. Above the ones she has to ask for, because it is a shorter
 *             path to the same thing.
 *   open      the browse list. Usually the longest, which is exactly why it is
 *             not first: a creator with work in flight should not scroll past
 *             forty opportunities to find it.
 *   declined  history. Last, never hidden. A rejection that appears nowhere is
 *             the complaint both reviewers filed.
 *
 * `note` is one short line, and only where the group's name does not already
 * say everything. A paragraph under every heading is the wall of text the
 * grouping was meant to replace.
 */
const GROUPS: {
  key: string;
  title: string;
  note?: string;
  matches: (s: CreatorOfferState) => boolean;
}[] = [
  {
    key: 'accepted',
    title: 'Accepted',
    note: 'Agreed with you. Where each one has got to, and what it pays.',
    matches: (s) => s === 'in',
  },
  {
    key: 'waiting',
    title: 'Waiting on the team',
    note: 'Asked for. The answer lands here on its own, no refresh needed.',
    matches: (s) => s === 'waiting',
  },
  {
    key: 'yours',
    title: 'Yours already',
    note: 'Nothing to apply for on these.',
    matches: (s) => s === 'open',
  },
  { key: 'open', title: 'Open to apply for', matches: (s) => s === 'canApply' },
  {
    key: 'declined',
    title: 'Declined',
    note: 'Not taken forward this time. You can ask again on any of them.',
    matches: (s) => s === 'declined',
  },
];

export function Offers() {
  const { claims } = useAuth();
  const { data: profile } = useProfile();
  const role = profile?.role ?? claims?.role;
  const approved = role === 'creator' || role === 'ops' || role === 'admin';

  const [search, setSearch] = useState('');
  const [applyingTo, setApplyingTo] = useState<CreatorOfferRow | null>(null);

  // Admin edits to brands, offers and products land here without a reload.
  useCatalogueLive();

  const { data: offers, isLoading, isError, refetch } = useAllCreatorOffers();
  const { data: requests } = useAllMyRequests();
  // How much of each job has been filmed. Keyed by REQUEST, not by offer: five
  // videos for three hundred is a promise made to one creator on one request.
  const { data: progress } = useMyJobProgress();

  /** The newest request per offer. A rejected creator can ask again, so an
   *  offer can carry several rows and only the newest describes today. */
  const latest = useMemo(() => {
    const map = new Map<string, MyOfferApplication>();
    for (const r of requests ?? []) if (!map.has(r.offer_id)) map.set(r.offer_id, r);
    return map;
  }, [requests]);

  /**
   * The search, and nothing else. It matches the brand's name as well as the
   * offer's, which is why the brand dropdown above it was deleted rather than
   * rebuilt.
   */
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return offers ?? [];
    return (offers ?? []).filter(
      (o) =>
        o.title.toLowerCase().includes(needle) ||
        (o.brand?.name ?? '').toLowerCase().includes(needle) ||
        (o.description ?? '').toLowerCase().includes(needle)
    );
  }, [offers, search]);

  /*
   * THE GROUPS, AND THEIR COUNTS, FROM THE LIST ON SCREEN.
   *
   * Counted after the search rather than before it, which is the opposite of
   * what the chips did. A chip's count had to describe the whole list, because
   * a count that changed when she changed chip would be counting what she could
   * already see. A HEADING is different: it labels the rows directly beneath
   * it, so "Open to apply for 3" under a search for "serum" has to mean three
   * matching offers or it is simply wrong.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, CreatorOfferRow[]>(GROUPS.map((g) => [g.key, []]));
    for (const offer of shown) {
      const state = stateFor(offer, latest.get(offer.id));
      const group = GROUPS.find((g) => g.matches(state));
      if (group) byKey.get(group.key)!.push(offer);
    }
    return GROUPS.map((g) => ({ ...g, offers: byKey.get(g.key)! })).filter(
      (g) => g.offers.length > 0
    );
  }, [shown, latest]);

  return (
    <>
      {!approved ? (
        <LockedUntilApproved className="mt-6" />
      ) : (
        /*
          ONE BLURRED PANEL FOR THE WHOLE SCREEN: the search and every group
          live inside it, and every card in it is `wx-neo-raised-sm`. That is
          Layer B of the three-layer blur budget — the top bar is A, a dialog is
          C. See `src/components/creator/earn/EarnPanel.tsx`.
        */
        <EarnPanel>
          <EarnFilters>
            <CreatorSearch
              value={search}
              onChange={setSearch}
              placeholder="Search offers or brands"
              label="Search offers or brands"
            />
          </EarnFilters>

          {isLoading ? (
            <EarnGrid min="20rem">
              {Array.from({ length: 6 }).map((_, i) => (
                <EarnTileSkeleton key={i} className="h-[14rem]" />
              ))}
            </EarnGrid>
          ) : isError ? (
            <DataError
              className="mt-4"
              title="We could not load the offers"
              body="That is on our side, not yours. Nothing is lost, and trying again usually works."
              onRetry={() => refetch()}
            />
          ) : groups.length === 0 ? (
            <EmptyState
              className="mt-4"
              title={
                (offers ?? []).length === 0
                  ? 'Nothing to apply for right now'
                  : 'Nothing matches that'
              }
              body={
                (offers ?? []).length === 0
                  ? 'New offers land here.'
                  : 'Try a different search. Offers, brands and the text of an offer are all searched.'
              }
            />
          ) : (
            groups.map((group) => (
              <EarnGroup
                key={group.key}
                title={group.title}
                count={group.offers.length}
                note={group.note}
              >
                <EarnGrid min="20rem">
                  {group.offers.map((offer, i) => (
                    <TileIn key={offer.id} index={i}>
                      <OfferCard
                        offer={offer}
                        request={latest.get(offer.id)}
                        progress={progress?.get(latest.get(offer.id)?.id ?? '')}
                        showBrand
                        onApply={() => setApplyingTo(offer)}
                      />
                    </TileIn>
                  ))}
                </EarnGrid>
              </EarnGroup>
            ))
          )}
        </EarnPanel>
      )}

      {/* Layer C, and only while it is open: a bottom sheet on a phone and a
          centred dialog above `sm`, exactly as it was. */}
      {applyingTo ? (
        <ApplyDialog
          offer={applyingTo}
          brandName={applyingTo.brand?.name ?? 'this brand'}
          onClose={() => setApplyingTo(null)}
        />
      ) : null}
    </>
  );
}
