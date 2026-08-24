import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { m } from 'motion/react';
import {
  Check,
  Clock,
  ExternalLink,
  Gauge,
  Search,
  Store,
  Target,
  Trophy,
  X,
  Ticket,
  UserRound,
} from 'lucide-react';
import { ContestDashboard } from '@/components/creator/ContestDashboard';
import { LockedUntilApproved } from '@/components/creator/LockedUntilApproved';
import {
  ContestEntryDialog,
  DeliverableRows,
  type DeliverableLike,
} from '@/components/creator/ContestEntryDialog';
import {
  ContestProgressDialog,
  ContestProgressSummary,
} from '@/components/creator/ContestProgressDialog';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { ContestStateChip } from '@/components/work/ContestStateChip';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { formatDeadline } from '@/lib/contest-time';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import {
  canEnter,
  doorOf,
  entryStateOf,
  isLiveForThem,
  useCreatorContests,
  useEnterContest,
  type ContestDoor,
  type CreatorContest,
} from '@/lib/creator/useCreatorContests';

/**
 * Every contest open to this creator, across every brand.
 *
 * The brand hub answers "what is this brand running". This answers "what is on
 * anywhere", which is the question somebody opens the app with, and until today
 * a creator could not see a contest at all.
 *
 * ORDERED BY WHICH DEADLINE RUNS OUT FIRST, in the database, because that is
 * the only ordering that matches why somebody opened the screen.
 *
 * TWO RULES DECIDE EVERYTHING BELOW.
 *
 * 1. A contest that is switched off or past its deadline closes the DOOR, never
 *    the WORK. Anybody already in still sees it, still delivers and still gets
 *    paid, so a contest somebody holds an entry in is NEVER dropped from this
 *    screen and never greyed out. Contests that are closed and that they are
 *    not in are grouped separately at the bottom, so a shut door cannot sit in
 *    the middle of the ones they can still act on.
 *
 * 2. Nothing here says anything about another entrant: no handle, no name, no
 *    figure. Decision D7. There is no such column to read and the client must
 *    not reconstruct one.
 *
 * THERE ARE NO PLACINGS ANY MORE. A contest is a list of deliverables, and
 * anybody who reaches a target earns its reward, so nothing on this screen has
 * to imply that somebody has been ranked. "How it is judged" is gone with them.
 *
 * WHAT AN ENTERED CREATOR GETS HERE, and it is the point of the redesign: their
 * own claimed figures drawn against the target, what is still waiting to be
 * confirmed, and Update progress. The two bands are deliberately different
 * colours because an unconfirmed figure is a claim about money, and money is
 * only ever owed against a confirmed one.
 */

type Tab = 'all' | 'in' | 'waiting' | 'open';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'in', label: 'You are in' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'open', label: 'Not entered yet' },
];

/*
 * The door chip is `src/components/work/ContestStateChip.tsx`, the same one the
 * two admin screens draw, so a creator and an admin looking at the same contest
 * read the same word for it. Rule C1 lives there: no stage token on a
 * lifecycle state, because open is not paid and a passed deadline is not money
 * owed to anybody.
 */

/**
 * The ticking clock rule L5 asks for.
 *
 * A deadline passing writes no row, so it fires no realtime event and
 * invalidates nothing. Without this, a creator who leaves the tab open across a
 * deadline keeps reading "Closes in 2 hours" and an Enter button on a contest
 * the database would refuse. `now` is passed into the helpers rather than read
 * inside them, which is also what makes them testable.
 */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Two views, one URL. The list is the job; the dashboard is the summary. */
function ViewSwitch({
  view,
  onChange,
}: {
  view: 'contests' | 'progress';
  onChange: (next: 'contests' | 'progress') => void;
}) {
  const options = [
    { key: 'contests' as const, label: 'Contests' },
    { key: 'progress' as const, label: 'My progress' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Contests view"
      className="bg-surface-2 mt-5 flex w-fit gap-1 rounded-xl p-[3px]"
    >
      {options.map((o) => {
        const active = view === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              'ease-brand min-h-[44px] rounded-lg px-4 text-[0.8125rem] font-semibold transition-colors',
              active ? 'bg-surface-1 text-text shadow-sm' : 'text-muted hover:text-text'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * `hubBrandId` renders this same screen inside a Brand Hub, showing only that
 * brand's contests.
 *
 * NOT THE SAME THING AS THE `brandId` STATE BELOW, which is the creator's own
 * "Brand" dropdown on the standalone screen. One is where the screen is, the
 * other is what the person filtered it to. Inside a hub the dropdown is
 * removed: the hub is already one brand, and a brand filter on a page that is
 * a brand invites picking a second one.
 *
 * It also drops the title block. The standalone route needs an `<h1>` and a
 * line saying the list spans every brand; inside a hub both are wrong, because
 * the hub's own tab already names the section and the list is one brand's.
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
   * button whose only possible outcome is a refusal, which is the same bug as
   * offering Withdraw once work has been filed.
   */
  const isCreator = role === 'creator';

  /*
   * Two views, and the choice lives in the URL, which is the house pattern the
   * creator home and both content screens already use.
   *
   * THE DEFAULT IS THE LIST, not the dashboard. Rashid has asked for this twice
   * now: the default section is the JOB, not the summary. Somebody opening
   * Contests is looking for something to enter or something to file, and a wall
   * of their own figures would push that below the fold.
   */
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

  const [tab, setTab] = useState<Tab>('all');
  const [brandId, setBrandId] = useState('');
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
   * Their claimed and confirmed figures ride along with their entries, in the
   * same query, because they are the same question: what is true about my own
   * entries right now. So a card that has an entry to draw always has the
   * figures to draw on it, and there is no third loading state on this screen.
   */
  const { contests, isLoading, isError, error } = useCreatorContests(hubBrandId);

  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of contests) if (c.brand) seen.set(c.brand.id, c.brand.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contests]);

  /*
   * Annotated as a Record so every arm has ONE signature. Without it the index
   * access `matches[tab]` is a union that includes `() => boolean`, and TypeScript
   * intersects the parameters of a union of call signatures, so passing a
   * contest to it stops compiling. The offers screen carries the same
   * annotation for the same reason.
   */
  const matches = useMemo<Record<Tab, (c: CreatorContest) => boolean>>(
    () => ({
      all: () => true,
      in: (c) => entryStateOf(c) === 'in',
      waiting: (c) => entryStateOf(c) === 'waiting',
      open: (c) => canEnter(c, now),
    }),
    [now]
  );

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, in: 0, waiting: 0, open: 0 };
    for (const contest of contests) {
      c.all += 1;
      if (matches.in(contest)) c.in += 1;
      if (matches.waiting(contest)) c.waiting += 1;
      if (matches.open(contest)) c.open += 1;
    }
    return c;
  }, [contests, matches]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return contests.filter((c) => {
      if (brandId && c.brandId !== brandId) return false;
      if (!matches[tab](c)) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.brand?.name ?? '').toLowerCase().includes(needle) ||
        (c.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [contests, brandId, tab, search, matches]);

  /*
   * The split, and the one line that carries rule 1 above: a contest is only
   * moved out of the live list when the door is shut AND they are not in it.
   * Their own live work never leaves the top of the screen.
   */
  const live = shown.filter((c) => doorOf(c, now) === 'open' || isLiveForThem(c));
  const shut = shown.filter((c) => doorOf(c, now) !== 'open' && !isLiveForThem(c));

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

  return (
    <>
      {hubBrandId ? null : (
        <div className="flex flex-col gap-1.5 px-0.5 py-1">
          <h1 className="font-display text-[clamp(1.625rem,4.4vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.02em]">
            Contests
          </h1>
          <p className="text-muted text-[0.9375rem]">
            Everything running right now, from every brand you work with.
          </p>
        </div>
      )}

      {!approved ? (
        <LockedUntilApproved className="mt-6" />
      ) : view === 'progress' ? (
        <>
          <ViewSwitch view={view} onChange={setView} />
          <ContestDashboard contests={contests} />
        </>
      ) : (
        <>
          <ViewSwitch view={view} onChange={setView} />

          {/* ------------------------------------------------------- tabs -- */}
          <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div
              role="tablist"
              aria-label="Filter contests"
              className="bg-surface-2 flex min-w-max gap-1 rounded-xl p-[3px]"
            >
              {TABS.map((t) => (
                <button
                  key={t.value}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.value}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    'ease-brand inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[9px] px-3.5 text-[0.8125rem] font-medium transition-colors',
                    tab === t.value ? 'bg-text text-inverse' : 'text-muted hover:text-text'
                  )}
                >
                  {t.label}
                  {counts[t.value] > 0 ? (
                    <span
                      className={cn(
                        'ml-1.5 font-mono text-[0.75rem]',
                        tab === t.value ? 'text-inverse/70' : 'text-muted'
                      )}
                    >
                      {counts[t.value]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* ---------------------------------------------------- filters -- */}
          <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="relative min-w-0 flex-1 basis-52">
              <Search
                size={15}
                aria-hidden
                className="text-faint pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
              />
              <Input
                type="search"
                name="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contests or brands"
                aria-label="Search contests or brands"
                className="h-[44px] pl-9 text-[0.8125rem]"
              />
            </div>

{/*
              No brand dropdown inside a Brand Hub. The page IS a brand, so the
              only thing this control could do there is take the creator to a
              different one from inside this one's tabs.
            */}
            {hubBrandId ? null : (
              <>
                <label className="sr-only" htmlFor="contest-brand-filter">
                  Filter by brand
                </label>
                <Select
                  id="contest-brand-filter"
                  name="brand"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  className="h-[44px] basis-44 text-[0.8125rem]"
                >
                  <option value="">All brands</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
          </div>

          {/* ------------------------------------------------------- list -- */}
          {isLoading ? (
            <ul className="mt-4 grid gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="wx-skeleton h-[32rem] rounded-xl" />
              ))}
            </ul>
          ) : isError ? (
            <Empty
              title="That list would not load"
              body={error?.message ?? 'Something went wrong reaching the database.'}
            />
          ) : shown.length === 0 ? (
            contests.length === 0 ? (
              <Empty
                title="No contests yet"
                body="A contest is an event with a deadline and a prize. The moment a brand you work with puts one up, it lands here."
              />
            ) : (
              <Empty
                title="Nothing matches that"
                body="Try a different search, another brand, or a different tab."
              />
            )
          ) : (
            <>
              {live.length > 0 ? (
                <ul className="mt-4 grid gap-4">
                  {live.map((contest, i) => (
                    <m.li
                      key={contest.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04 }}
                    >
                      <ContestCard
                        contest={contest}
                        now={now}
                        canEnterAtAll={isCreator}
                        onEnter={() => setEntering(contest)}
                        onUpdateProgress={() => setUpdating(contest)}
                      />
                    </m.li>
                  ))}
                </ul>
              ) : null}

              {shut.length > 0 ? (
                <section className="mt-8">
                  <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                    Closed, and you were not in these
                  </h2>
                  {/*
                    Deliberately does NOT promise these are kept. Once a contest
                    shuts, row security only keeps returning it to somebody who
                    holds an entry row on it, so what lands here is the ones a
                    creator asked about and was not in, plus anything that ran
                    out while this tab was open.
                  */}
                  <p className="text-faint mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed">
                    Their door has shut and you are not in them, so there is nothing to do here.
                  </p>
                  <ul className="mt-3 grid gap-4">
                    {shut.map((contest) => (
                      <li key={contest.id}>
                        <ContestCard
                          contest={contest}
                          now={now}
                          canEnterAtAll={isCreator}
                          onEnter={() => setEntering(contest)}
                          onUpdateProgress={() => setUpdating(contest)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </>
      )}

      {entering ? (
        <ContestEntryDialog contest={entering} onClose={() => setEntering(null)} />
      ) : null}

      {/*
        Only ever opened from a card whose entry is approved, so the entry is
        there. `submit_contest_progress` matches the entry on creator_id as well
        as on its id besides, so an entry id that arrived any other way is
        refused as "that is not one of your contests".
      */}
      {updatingNow?.entry ? (
        <ContestProgressDialog contest={updatingNow} onClose={() => setUpdating(null)} />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- one card -- */

/**
 * One contest, as a creator sees it.
 *
 * REBUILT 2026-08-22 from Rashid's design, and from what he said about the old
 * one: *"contest is not a normal thing dude it must represent a brand with
 * images emojis taglines"*. It was a plain bordered box with a heading and some
 * labelled rows — the same card an offer got, holding a different noun.
 *
 * FOUR BANDS, top to bottom: the HERO, what you can EARN, the FACTS about it,
 * and WHY JOIN. The action sits under all of it, unchanged, because where a
 * creator stands is decided by their own entry and not by how the card looks.
 *
 * IT HAS TO BE RIGHT WITH NO ARTWORK AT ALL, and that is not a nicety: every
 * contest on this platform had a null `banner_url` until an admin uploaded one,
 * because the column existed for nine days with no control to fill it. So the
 * hero falls back to a gold-on-near-black gradient built from tokens, the side
 * panel drops its picture and keeps its ticks, and nothing shifts position.
 *
 * THE SCRIM IS NOT DECORATION. The name, the description and the countdown are
 * white text sitting ON a photograph an admin chose, and no rule can stop
 * somebody uploading a bright one. A left-to-right gradient from near-opaque to
 * transparent keeps the text readable whatever arrives, which is what lets the
 * artwork be picked on whether it looks good.
 */
function ContestCard({
  contest,
  now,
  canEnterAtAll,
  onEnter,
  onUpdateProgress,
}: {
  contest: CreatorContest;
  now: number;
  /** False for staff, who may read a contest but may never enter one. Rule E6. */
  canEnterAtAll: boolean;
  onEnter: () => void;
  onUpdateProgress: () => void;
}) {
  const door = doorOf(contest, now);
  const state = entryStateOf(contest);
  const inIt = state === 'in';

  /*
   * ONCE THEY ARE IN, THE CARD QUOTES WHAT THEY WERE PROMISED.
   *
   * `contest_entry_terms` is copied at approval and never read live from the
   * contest again, so an admin adding, retiring or re-pricing a deliverable
   * afterwards legitimately differs from what this entrant holds. Printing
   * today's rows above a bar counting against a frozen target is one card
   * saying two things at once, which is the exact bug the offers card had to be
   * fixed for.
   */
  const promised = inIt && contest.terms.length > 0;
  const rows: DeliverableLike[] = promised ? contest.terms : contest.deliverables;

  // One reason per line, as typed, capped at four. The cap is here rather than
  // on the column so a long list is trimmed on screen instead of being refused
  // at save time.
  const perks = (contest.perks ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="border-line bg-surface-1 flex h-full flex-col overflow-hidden rounded-xl border shadow-md">
      {/* ------------------------------------------------------------ hero -- */}
      <div className="relative isolate min-h-[17rem] overflow-hidden sm:min-h-[20rem] lg:min-h-[26rem]">
        {contest.bannerUrl ? (
          <img
            src={contest.bannerUrl}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover [object-position:22%_58%] sm:[object-position:center_58%]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            aria-hidden
            className="from-accent/25 via-surface-2 to-surface-1 absolute inset-0 -z-10 bg-gradient-to-br"
          />
        )}

        {/*
          Two scrims, not one. The horizontal one keeps the left column dark
          enough for white text however bright the photograph is; the vertical
          one stops the countdown along the bottom edge floating on a highlight.
        */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/70 to-black/55 sm:bg-gradient-to-r sm:from-black/60 sm:via-black/10 sm:via-45% sm:to-transparent sm:to-62%"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/50 via-transparent to-transparent"
        />

        <div
          className="flex h-full flex-col gap-3 p-5 sm:p-6 lg:max-w-[60%]"
          style={{ textShadow: '0 1px 12px rgba(0,0,0,0.65), 0 1px 2px rgba(0,0,0,0.5)' }}
        >
          {/* The brand, on its own mark. A contest belongs to a brand before it
              belongs to us, which is the whole of what Rashid was asking for. */}
          {contest.brand ? (
            <Link
              to={`/app/brands/${contest.brand.slug}`}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-white/12 px-2.5 py-1.5 text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20">
                {contest.brand.logoUrl ? (
                  <img src={contest.brand.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Store size={11} aria-hidden />
                )}
              </span>
              <span className="truncate font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
                {contest.brand.name}
              </span>
            </Link>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <ContestStateChip state={door} />
            {door === 'open' ? (
              <span className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-white/70 uppercase">
                {contest.needsAdminApproval ? 'Wurx approves entries' : 'Anyone can enter'}
              </span>
            ) : null}
          </div>

          <h3 className="font-display max-w-2xl text-[1.5rem] leading-tight font-bold text-white sm:text-[1.75rem]">
            {contest.name}
          </h3>

          {contest.description ? (
            <p className="line-clamp-3 max-w-2xl text-[0.875rem] leading-relaxed text-white/75">
              {contest.description}
            </p>
          ) : null}

          {/* -------------------------------------------------- countdown -- */}
          {door === 'open' ? (
            <div className="mt-auto border-t border-white/15 pt-4">
              <span className="font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-white/60 uppercase">
                Closes in
              </span>
              <div className="mt-2 flex flex-wrap items-end gap-5">
                <Countdown to={contest.expiresAt} now={now} />
                {/* The exact moment, in the zone the admin set it in. Rule L6:
                    a deadline that renders in the reader's zone closes at three
                    different times for three people. */}
                <span className="text-[0.75rem] text-white/60">
                  {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-auto border-t border-white/15 pt-4">
              <span className="text-[0.8125rem] text-white/70">
                {formatDeadline(contest.expiresAt, contest.expiresAtTimezone)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------- what you can earn -- */}
      {rows.length > 0 ? (
        <div className="border-line border-t p-5 sm:p-6">
          <p className="font-display text-text text-[1rem] font-bold">
            {promised ? 'What you were promised' : 'What you can earn'}
          </p>
          <DeliverableRows rows={rows} currency={contest.currency} className="mt-3" />
        </div>
      ) : null}

      {/* ---------------------------------------------------- the facts -- */}
      <div className="border-line bg-surface-2/40 grid gap-4 border-t p-5 sm:grid-cols-3 sm:p-6">
        <Fact icon={<Store size={15} aria-hidden />} label="Brand">
          {contest.brand?.name ?? 'Unknown brand'}
        </Fact>
        <Fact icon={<Ticket size={15} aria-hidden />} label="Entries accepted">
          {door === 'open'
            ? 'Open to enter'
            : door === 'off'
              ? 'Not running'
              : door === 'settled'
                ? 'Settled'
                : door === 'cancelled'
                  ? 'Cancelled'
                  : 'Closed'}
        </Fact>
        <Fact icon={<UserRound size={15} aria-hidden />} label="Approved by">
          {contest.needsAdminApproval ? 'The Wurx team' : 'Nobody, it is automatic'}
        </Fact>
      </div>

      {/* ----------------------------------------------------- why join -- */}
      {perks.length > 0 ? (
        <div className="border-line flex flex-wrap items-center gap-6 border-t p-5 sm:p-6">
          <div className="min-w-[14rem] flex-1">
            <p className="font-display text-text text-[1rem] font-bold">Why join this contest?</p>
            <ul className="mt-3 flex flex-col gap-2">
              {perks.map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <Check size={15} aria-hidden className="text-accent mt-0.5 shrink-0" />
                  <span className="text-muted text-[0.875rem] leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>
          {contest.cardImageUrl ? (
            <img
              src={contest.cardImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-32 w-32 shrink-0 rounded-xl object-cover sm:h-40 sm:w-40"
            />
          ) : null}
        </div>
      ) : null}

      {/* --------------------------------------------------- everything else -- */}
      <div className="flex flex-col gap-3 p-5 pt-0 sm:p-6 sm:pt-0">
        {contest.products.length > 0 ? (
          <p className="text-muted text-[0.8125rem] leading-relaxed">
            <span className="text-text font-semibold">Products: </span>
            {contest.products.map((p) => p.productName).join(', ')}
          </p>
        ) : null}

        {contest.briefUrl ? (
          <a
            href={contest.briefUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent inline-flex min-h-[44px] items-center gap-1.5 self-start text-[0.8125rem] font-semibold hover:underline"
          >
            Read the full brief
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : null}

        <div className="mt-auto">
          <ContestAction
            contest={contest}
            door={door}
            canEnterAtAll={canEnterAtAll}
            onEnter={onEnter}
            onUpdateProgress={onUpdateProgress}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The countdown, in four boxes.
 *
 * It ticks from `now`, which the page already recomputes on an interval for the
 * "time left" copy, so this adds no timer of its own. `everyMs` on that hook is
 * 30 seconds, which is why the seconds box is deliberately not drawn: a seconds
 * figure that only moves twice a minute reads as a frozen clock, which is worse
 * than not showing one.
 */
function Countdown({ to, now }: { to: string; now: number }) {
  const ms = Math.max(0, new Date(to).getTime() - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);

  const boxes = [
    { value: days, label: days === 1 ? 'Day' : 'Days' },
    { value: hours, label: hours === 1 ? 'Hour' : 'Hours' },
    { value: mins, label: mins === 1 ? 'Min' : 'Mins' },
  ];

  return (
    <span className="flex items-end gap-4">
      {boxes.map((b) => (
        <span key={b.label} className="flex flex-col">
          <span className="font-display wx-numeric text-[1.75rem] leading-none font-bold text-white">
            {b.value}
          </span>
          <span className="mt-1 font-mono text-[0.625rem] tracking-[0.12em] text-white/60 uppercase">
            {b.label}
          </span>
        </span>
      ))}
    </span>
  );
}

/** One labelled fact in the band under the hero. */
function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="bg-accent-soft text-accent mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-faint block font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
          {label}
        </span>
        <span className="text-text mt-0.5 block truncate text-[0.875rem] font-medium">
          {children}
        </span>
      </span>
    </div>
  );
}

/* ----------------------------------------------------- the bottom of it -- */

/**
 * Where they stand, and the only part of the card that differs between them.
 *
 * The door is decided LAST, after their own entry, and that order is load
 * bearing. The offers card shipped the other way round once: it asked what the
 * offer said about itself before asking what the creator had already been
 * approved for, and an admin flipping one switch hid the stage, the tracker and
 * the money of somebody already filming. Live work wins here for the same
 * reason.
 */
function ContestAction({
  contest,
  door,
  canEnterAtAll,
  onEnter,
  onUpdateProgress,
}: {
  contest: CreatorContest;
  door: ContestDoor;
  canEnterAtAll: boolean;
  onEnter: () => void;
  onUpdateProgress: () => void;
}) {
  const state = entryStateOf(contest);
  const act = useEnterContest();
  const busy = act.isPending;

  const refusal = act.error ? (act.error as Error).message : '';

  if (state === 'in') {
    /*
     * How many of their VIDEOS have been watched, which is a different question
     * from how far along their figures are. Contest videos are reviewed one by
     * one, so "1 to redo" has to survive on this card even when the deliverable
     * bars above it are full.
     */
    const filmed = contest.progress;
    /*
     * WHAT IS ON OFFER, NEVER WHAT IS OWED, and the redesign made saying so
     * necessary rather than tidy. `committed_amount` used to be the fixed
     * rewards only; with placings gone it is the sum of EVERY reward on the
     * contest, so it is now a figure for reaching every target rather than one
     * for turning up. It is labelled, and it is deliberately NOT drawn in the
     * stage-paid token: that token means the team has checked it and it pays,
     * which is exactly what this figure is not. Money is owed against a
     * CONFIRMED progress figure and nothing else.
     */
    const amount = contest.entry?.committedAmount ?? null;

    /*
     * WITHDRAWING IS OFFERED ONLY WHILE THERE IS NOTHING TO LOSE. The database
     * refuses once anything has been filed or awarded, with a sentence saying
     * so, and this hides the control in the same case rather than offering a
     * button whose only outcome is a refusal.
     */
    const canWithdraw =
      (filmed?.posted ?? 0) === 0 && !contest.settledAt && !contest.cancelledAt;

    return (
      <div>
        <div className="bg-stage-paid-soft rounded-xl px-3.5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-stage-paid text-[0.875rem] font-semibold">You are in</span>
            {amount !== null ? (
              <span className="text-muted text-[0.75rem]">
                <span className="wx-numeric font-display text-text text-[0.9375rem] font-semibold">
                  {money(amount, contest.entry?.currency ?? contest.currency)}
                </span>{' '}
                on offer here
              </span>
            ) : null}
          </div>
          <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
            {door === 'cancelled'
              ? 'This contest was called off. Nothing you were promised is taken away.'
              : door === 'settled'
                ? 'This one has been settled. Your outcome is on your entry.'
                : door === 'open'
                  ? 'Your place is held. Film what it asks for before the deadline.'
                  : 'Closed to new entries. Your work carries on and still pays exactly what you were promised.'}
          </p>
          {contest.cancelMessage ? (
            <p className="text-muted mt-2 text-[0.8125rem] leading-relaxed">
              {contest.cancelMessage}
            </p>
          ) : null}
        </div>

        {/*
          THEIR FIGURES AGAINST THE TARGET, which is the whole of what an
          entered creator comes back to this screen for. No loading state: the
          entry, its terms, its claims and its confirmed totals all arrive in
          the same query, so a card with an entry to draw always has these.
        */}
        <ContestProgressSummary contest={contest} className="border-line mt-4 border-t pt-4" />

        {/*
          UPDATE PROGRESS. Offered while the contest can still take one: the
          database refuses a claim on a settled or cancelled contest, and a
          button whose only outcome is a refusal is the same bug as offering
          Withdraw once work has been filed.

          IT SAYS SO WHEN SOMETHING IS ALREADY WAITING. Only one claim can be
          with the team at a time, so the panel behind it has nothing to fill in
          in that case, and a button that promised a form would be a dead end.
        */}
        {!contest.settledAt && !contest.cancelledAt ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3 min-h-[44px] w-full sm:w-auto"
            onClick={onUpdateProgress}
          >
            <Gauge size={15} aria-hidden />
            {contest.pendingClaim ? 'See what is with the team' : 'Update progress'}
          </Button>
        ) : null}

        {filmed ? <VideosFiled progress={filmed} /> : null}

        {contest.entry?.decisionNote ? (
          <p className="text-muted mt-2 text-[0.8125rem]">{contest.entry.decisionNote}</p>
        ) : null}

        {!contest.settledAt && !contest.cancelledAt && contest.entry ? (
          <TargetControl entryId={contest.entry.id} target={contest.target} />
        ) : null}

        {canWithdraw ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 min-h-[44px]"
            disabled={busy}
            onClick={() =>
              act.mutate({ action: 'contest.withdraw', entryId: contest.entry!.id })
            }
          >
            {busy ? 'Pulling out...' : 'Pull out of this one'}
          </Button>
        ) : null}

        {refusal ? (
          <p role="alert" className="text-danger mt-2 text-[0.75rem]">
            {refusal}
          </p>
        ) : null}
      </div>
    );
  }

  if (state === 'waiting') {
    return (
      <div>
        <Note tone="pending" icon={<Clock size={15} aria-hidden />}>
          <span className="font-semibold">With the team</span>
          <span className="text-muted block text-[0.8125rem]">
            Somebody is reading your entry. The answer appears here, no refresh needed.
          </span>
        </Note>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 min-h-[44px]"
          disabled={busy}
          onClick={() => act.mutate({ action: 'contest.withdraw', entryId: contest.entry!.id })}
        >
          {busy ? 'Withdrawing...' : 'Withdraw'}
        </Button>
        {refusal ? (
          <p role="alert" className="text-danger mt-2 text-[0.75rem]">
            {refusal}
          </p>
        ) : null}
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <div>
        <Note tone="danger" icon={<X size={15} aria-hidden />}>
          <span className="font-semibold">Not this time</span>
          {contest.entry?.decisionNote ? (
            <span className="text-muted mt-0.5 block text-[0.8125rem]">
              {contest.entry.decisionNote}
            </span>
          ) : null}
        </Note>
        {door === 'open' && canEnterAtAll ? (
          <Button variant="secondary" size="sm" className="mt-2 min-h-[44px]" onClick={onEnter}>
            Ask again
          </Button>
        ) : null}
      </div>
    );
  }

  if (state === 'withdrawn') {
    return (
      <div>
        <Note tone="neutral" icon={<Check size={15} aria-hidden />}>
          <span className="font-semibold">You pulled out of this one</span>
        </Note>
        {door === 'open' && canEnterAtAll ? (
          <Button variant="secondary" size="sm" className="mt-2 min-h-[44px]" onClick={onEnter}>
            Enter after all
          </Button>
        ) : null}
      </div>
    );
  }

  if (door !== 'open') {
    return (
      <p className="text-muted bg-surface-2 rounded-xl px-3.5 py-3 text-[0.8125rem] leading-relaxed">
        {door === 'cancelled'
          ? 'This contest was called off.'
          : door === 'settled'
            ? 'This one is over and has been settled.'
            : 'Entries are closed on this one.'}
      </p>
    );
  }

  /*
   * Staff, reading the product as a creator sees it. The database would refuse
   * them at `assert_active_creator`, so this says why instead of handing them a
   * button that can only fail.
   */
  if (!canEnterAtAll) {
    return (
      <p className="text-muted bg-surface-2 rounded-xl px-3.5 py-3 text-[0.8125rem] leading-relaxed">
        This is the creator view. Entering a contest is something only a creator account does.
      </p>
    );
  }

  return (
    <Button className="w-full sm:w-auto" onClick={onEnter}>
      <Trophy size={16} aria-hidden />
      {contest.needsAdminApproval ? 'Ask to enter' : 'Enter this contest'}
    </Button>
  );
}

/* --------------------------------------------------------- how far along -- */

/**
 * What has happened to their videos, in one line.
 *
 * NO SECOND BAR. The deliverable bars above already draw a video count against
 * a target, and this counts the same videos through a different lens: how many
 * have been WATCHED. Two bars an inch apart, showing two different numbers for
 * what looks like one question, is the card saying two things at once, which is
 * exactly the bug the offers card had to be fixed for. So this is a sentence.
 *
 * Every number here is about ONE person's entry, which is the property that
 * makes `contest_entry_progress` safe to read at all: a count over one
 * creator's own rows is complete rather than silently narrowed. Nothing here
 * knows another entrant exists.
 */
function VideosFiled({ progress }: { progress: NonNullable<CreatorContest['progress']> }) {
  const { approved, waiting, needsAnotherTake, posted } = progress;

  // Nothing filed is nothing to report, and a row of zeros would read as a
  // problem rather than as a beginning.
  if (posted === 0) return null;

  const parts: string[] = [];
  if (approved > 0) parts.push(`${approved} counted`);
  if (waiting > 0) parts.push(`${waiting} with the team`);
  if (needsAnotherTake > 0) parts.push(`${needsAnotherTake} to redo`);

  return (
    <p className="text-muted mt-3 text-[0.8125rem]">
      <span className="text-text font-semibold">
        Your {posted === 1 ? 'video' : 'videos'}:{' '}
      </span>
      {parts.length > 0 ? parts.join(', ') : `${posted} sent`}
    </p>
  );
}

/* ------------------------------------------------------ their own number -- */

/**
 * The private target, and the one number in this feature that STAFF CANNOT
 * READ.
 *
 * It exists because every fact about other entrants is off this screen by
 * decision D7, so this is what is left to compete against. It lives in its own
 * table with one policy on it, the creator's own, and no staff policy of any
 * kind. `set_contest_entry_target` writes no audit row and no history row for
 * the same reason: both of those tables are staff readable, and a private
 * number with a trail somebody else can read is not private.
 *
 * The sentence under the box is therefore literally true, and it has to stay
 * that way. If this ever becomes visible to staff, the sentence is a lie told
 * by us, on our own screen, to the person whose transparency is the product.
 */
function TargetControl({ entryId, target }: { entryId: string; target: number | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(target === null ? '' : String(target));
  const [error, setError] = useState('');
  const act = useEnterContest();
  const busy = act.isPending;

  async function save(next: number | null) {
    setError('');
    try {
      await act.mutateAsync({ action: 'contest.target', entryId, target: next });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save');
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(target === null ? '' : String(target));
          setOpen(true);
        }}
        className="text-muted hover:text-accent ease-brand mt-3 flex min-h-[44px] w-full items-center gap-2 text-left text-[0.8125rem] transition-colors"
      >
        <Target size={14} aria-hidden className="shrink-0" />
        {target === null ? (
          <span>Set yourself a target</span>
        ) : (
          <span>
            Your own target: <span className="text-text font-mono font-semibold">{target}</span>{' '}
            approved {target === 1 ? 'video' : 'videos'}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="border-line bg-surface-2 mt-3 rounded-xl border px-3.5 py-3">
      <label
        htmlFor={`target-${entryId}`}
        className="text-muted block text-[0.8125rem] font-semibold"
      >
        Your own target
      </label>
      <p className="text-faint mt-1 text-[0.75rem] leading-relaxed">
        How many approved videos you are going for. Nobody else sees this, not even the team,
        and you can change it any time.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Input
          id={`target-${entryId}`}
          inputMode="numeric"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 6"
          className="h-[44px] w-24 text-[0.875rem]"
        />
        <Button
          type="button"
          size="sm"
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => {
            const n = Number(value.trim());
            if (!Number.isInteger(n) || n < 1 || n > 1000) {
              setError('Give a whole number between 1 and 1000');
              return;
            }
            void save(n);
          }}
        >
          {busy ? 'Saving...' : 'Save'}
        </Button>
        {target !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[44px]"
            disabled={busy}
            onClick={() => void save(null)}
          >
            Clear it
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError('');
          }}
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-danger mt-2 text-[0.75rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- fixtures -- */

function Note({
  tone,
  icon,
  children,
}: {
  tone: 'pending' | 'danger' | 'neutral';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[0.875rem]',
        tone === 'pending' && 'bg-stage-due-soft text-stage-due',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'neutral' && 'bg-surface-2 text-text'
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-line bg-surface-1 mt-4 rounded-xl border px-6 py-14 text-center shadow-md">
      <span className="bg-surface-3 border-line-strong mx-auto grid size-12 place-items-center rounded-lg border">
        <Trophy size={20} aria-hidden className="text-muted" />
      </span>
      <p className="font-display mt-4 text-[1.1875rem] font-semibold">{title}</p>
      <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">{body}</p>
    </div>
  );
}
