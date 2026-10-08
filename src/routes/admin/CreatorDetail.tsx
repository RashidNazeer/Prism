import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, FileText, History, Video } from 'lucide-react';
import { FilterBar, FilterTab, FilterTabs } from '@/components/layout/FilterBar';
import { ButtonLink } from '@/components/ui/Button';
import { JobProgressBar } from '@/components/work/JobProgress';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { CreatorFace } from '@/components/work/CreatorFace';
import { useCreatorAvatars } from '@/lib/admin/useCreatorAvatars';
import { ROLE_LABEL, TIER_LABEL } from '@/lib/tiers';
import { STAGE_META, stageIndex } from '@/lib/offer-stages';
import { useJobProgressFor } from '@/lib/work/job-progress';
import { standingFor } from '@/lib/work/stage-moves';
import {
  useCreator,
  useCreatorHistory,
  useCreatorJobs,
  useCreatorWork,
  type CreatorJob,
} from '@/lib/admin/useCreators';

/**
 * One creator, end to end.
 *
 * IT OPENS ON THEIR WORK, not on a summary. Same rule the brand hub and both
 * content screens follow: the default tab is the job. Somebody arrives here
 * because of something that is happening, and their account details are
 * reference they already half know.
 *
 * This is deliberately NOT the application screen with more on it. Everything
 * downstream keys on the account rather than on the application, a creator can
 * exist with no application at all, and that screen's whole argument is that
 * its decision is final. It gains a link across instead.
 *
 * NO TITLE ROW OF ITS OWN SINCE 2026-08-16. The shell's top bar is the page's
 * `<h1>` and it already says "Creators", so the handle steps down to an `<h2>`
 * rather than going away: on a record screen the name IS the record, and
 * "Creators" alone does not tell you whose page you are looking at. There was
 * never a describe-the-screen paragraph here to delete.
 *
 * THE MONEY ROW STAYS ABOVE THE TAB ROW, the one place this screen departs from
 * "row one is the filter row". Agreed / awaiting / paid are record scope, not
 * tab scope: they do not change when the tab does, so sitting under the tabs
 * they would read as a header for the Work list and then contradict themselves
 * on History. The reference data Rashid asked to be moved off the top, the
 * account facts, is already a tab across.
 */

const SECTIONS = [
  { key: 'work', label: 'Work' },
  { key: 'history', label: 'History' },
  { key: 'account', label: 'Account' },
] as const;

export function CreatorDetail() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') ?? 'work';
  const section = SECTIONS.some((s) => s.key === requested) ? requested : 'work';

  const { data: creator, isLoading, isError } = useCreator(id);
  const { data: jobs, isLoading: jobsLoading } = useCreatorJobs(id);
  const { data: work } = useCreatorWork(id ? [id] : []);
  const mine = id ? work?.get(id) : undefined;
  /*
   * Beside the other reads, and ABOVE the loading and not-found guards. A hook
   * after an early return runs on some renders and not others, which React
   * forbids and oxlint caught: the route id is what it needs, and that is in
   * scope here whether the creator loads or not.
   */
  const faces = useCreatorAvatars([id]);

  const go = (key: string) => {
    const p = new URLSearchParams();
    if (key !== 'work') p.set('section', key);
    setParams(p, { replace: true });
  };

  if (isLoading) {
    return (
      <>
        <div className="max-w-3xl space-y-4">
          <div className="wx-skeleton h-9 w-64 rounded-lg" />
          <div className="wx-skeleton h-10 w-full rounded-lg" />
          <div className="wx-skeleton h-40 rounded-xl" />
        </div>
      </>
    );
  }

  if (isError || !creator) {
    return (
      <>
        <div className="bg-surface-1 max-w-lg rounded-xl p-8 text-center shadow-md">
          <p className="font-semibold">No such creator</p>
          <p className="text-muted mt-2 text-[0.875rem] leading-relaxed">
            The account may have been closed. Nothing else is affected.
          </p>
          <ButtonLink to="/admin/creators" variant="secondary" size="sm" className="mt-5">
            Back to creators
          </ButtonLink>
        </div>
      </>
    );
  }

  const who = creator.tiktok_handle
    ? `@${creator.tiktok_handle}`
    : (creator.display_name ?? 'A creator');
  const mixed = (mine?.currencies ?? 0) > 1;
  const cur = mine?.currency ?? 'USD';

  return (
    <>
      {/* Compact header: back, who (an `<h2>`, the shell owns the `<h1>`), and
          the chips that earn their place. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/admin/creators"
          aria-label="Back to all creators"
          className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent grid size-11 shrink-0 place-items-center rounded-lg transition-colors duration-200 sm:size-8"
        >
          <ArrowLeft size={15} aria-hidden />
        </Link>

        {/* Bigger than a list row, because this is the record: it is the
            confirmation you are about to change the right person's tier. */}
        <CreatorFace
          src={faces[creator.id]}
          name={creator.display_name}
          handle={creator.tiktok_handle}
          size={44}
        />

        <h2 className="font-display min-w-0 text-[clamp(1.35rem,3vw,1.75rem)] font-semibold break-words">
          {who}
        </h2>

        {creator.tier ? (
          <span className="bg-accent-soft text-accent rounded-full px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            {TIER_LABEL[creator.tier]} tier
          </span>
        ) : null}
        {!creator.is_active ? (
          <span className="bg-surface-2 text-muted rounded-full px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            Suspended
          </span>
        ) : null}
      </div>

      {/* One money row, agreed / awaiting / paid, which add up. */}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Agreed', value: mine?.committed ?? 0, text: 'text-text' },
          { label: 'Awaiting payment', value: mine?.due ?? 0, text: 'text-stage-due' },
          { label: 'Paid', value: mine?.paid ?? 0, text: 'text-stage-paid' },
        ].map((c) => (
          <div key={c.label} className="bg-surface-1 rounded-xl px-5 py-4 shadow-md">
            <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {c.label}
            </dt>
            <dd className={cn('font-display mt-1 text-[1.1875rem] font-semibold', c.text)}>
              {mine === undefined ? '...' : mixed ? 'Mixed currencies' : money(c.value, cur)}
            </dd>
          </div>
        ))}
      </dl>

      {/*
        ------------------------------------------------------------ tabs --
        The shared filter row, not this screen's own pills. Same height, radius
        and colours as every other admin screen, and it WRAPS at 375px where the
        old row scrolled sideways and hid Account behind the edge. The tablist
        label and the URL the tabs write are untouched.
      */}
      <FilterBar className="mt-5">
        <FilterTabs label="Creator sections">
          {SECTIONS.map((s) => (
            <FilterTab key={s.key} active={s.key === section} onClick={() => go(s.key)}>
              {s.label}
            </FilterTab>
          ))}
        </FilterTabs>
      </FilterBar>

      {section === 'history' ? (
        <HistoryTab creatorId={creator.id} />
      ) : section === 'account' ? (
        <AccountTab creator={creator} />
      ) : (
        <WorkTab jobs={jobs ?? []} loading={jobsLoading} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ work -- */

function WorkTab({ jobs, loading }: { jobs: CreatorJob[]; loading: boolean }) {
  const approved = jobs.filter((j) => j.status === 'approved');
  const { data: progress } = useJobProgressFor(approved.map((j) => j.id));

  if (loading) {
    return (
      <ul className="mt-5 grid gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="wx-skeleton h-28 rounded-xl" />
        ))}
      </ul>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-surface-1 mt-5 rounded-xl px-6 py-16 text-center shadow-md">
        <Video size={26} aria-hidden className="text-faint mx-auto" />
        <p className="mt-4 font-semibold">Nothing taken yet</p>
        <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
          This creator is approved but has not asked for an offer. Offers that are open to
          everyone need no asking, so they leave no trace here.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-5 grid gap-3">
      {jobs.map((job) => {
        const stage = job.stage;
        const p = progress?.get(job.id);
        const standing = standingFor(job.stage_updated_at);

        return (
          <li key={job.id} className="bg-surface-1 rounded-xl p-4 shadow-md sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
              <div className="min-w-0 flex-1 basis-52">
                <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                  <Link
                    to={`/admin/brands/${job.brand_id}`}
                    className="hover:text-accent transition-colors"
                  >
                    {job.brand?.name ?? 'A brand'}
                  </Link>
                </p>
                <p className="mt-0.5 text-[0.9375rem] font-semibold break-words">
                  {job.offer?.title ?? 'An offer'}
                </p>
                {job.status !== 'approved' ? (
                  <p className="text-muted mt-1 text-[0.78125rem]">
                    {job.status === 'pending'
                      ? 'Waiting on a decision'
                      : job.status === 'rejected'
                        ? `Turned down${job.decision_note ? `: ${job.decision_note}` : ''}`
                        : 'Withdrawn'}
                  </p>
                ) : null}
              </div>

              <div className="shrink-0 text-right">
                <p className="font-display text-[1rem] font-semibold">
                  {job.committed_amount == null
                    ? 'No fixed fee'
                    : money(job.committed_amount, job.currency)}
                </p>
                {job.committed_video_count ? (
                  <p className="text-faint text-[0.75rem]">
                    {job.committed_video_count} videos agreed
                  </p>
                ) : null}
              </div>
            </div>

            {stage ? (
              <div className="border-line mt-3 border-t pt-3">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-[0.78125rem] font-semibold">
                    {stageIndex(stage) + 1}. {STAGE_META[stage].label}
                  </span>
                  {standing ? (
                    <span className="text-muted text-[0.78125rem]">
                      standing here {standing}
                    </span>
                  ) : null}
                </p>
                {p ? <JobProgressBar progress={p} className="mt-2.5" compact /> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------- history -- */

/**
 * Everything staff have done to this person.
 *
 * `audit_log.target_user_id` was added on day one with its own index for
 * exactly this question and no query had ever used it.
 */
function HistoryTab({ creatorId }: { creatorId: string }) {
  const { data: rows, isLoading } = useCreatorHistory(creatorId);

  if (isLoading) {
    return (
      <ul className="mt-5 grid gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="wx-skeleton h-14 rounded-lg" />
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-5">
      {(rows ?? []).length === 0 ? (
        <div className="bg-surface-1 rounded-xl px-6 py-14 text-center shadow-md">
          <History size={26} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">Nothing recorded yet</p>
        </div>
      ) : (
        <ul className="bg-surface-1 divide-line divide-y rounded-xl shadow-md">
          {(rows ?? []).map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3"
            >
              <span className="text-[0.84375rem] font-medium">{describe(row.action)}</span>
              <span className="text-muted min-w-0 flex-1 truncate text-[0.78125rem]">
                {detailLine(row.detail)}
              </span>
              <time
                dateTime={row.created_at}
                className="text-faint shrink-0 text-[0.75rem]"
                title={row.actor_email ?? undefined}
              >
                {new Date(row.created_at).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </time>
            </li>
          ))}
        </ul>
      )}

      {/*
        Named rather than papered over. Posting a video writes no audit row, so
        this list is only ever what WE did. Pretending otherwise would make a
        busy creator look idle.
      */}
      <p className="text-faint mt-3 text-[0.78125rem] leading-relaxed">
        This is the record of decisions the team made. What the creator did, including every
        video they posted, is on the Work tab and the content screen.
      </p>
    </div>
  );
}

/** Plain English for the action strings the audit log stores. */
function describe(action: string): string {
  const map: Record<string, string> = {
    'application.approved': 'Application approved',
    'application.rejected': 'Application rejected',
    'offer_application.approved': 'Put on an offer',
    'offer_application.rejected': 'Turned down for an offer',
    'offer_application.stage_changed': 'Moved along the pipeline',
    'content.reviewed': 'A video was reviewed',
  };
  return map[action] ?? action.replace(/[._]/g, ' ');
}

function detailLine(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const bits: string[] = [];
  if (typeof detail.brand === 'string') bits.push(detail.brand);
  if (typeof detail.offer === 'string') bits.push(detail.offer);
  if (typeof detail.to === 'string') bits.push(String(detail.to).replace(/_/g, ' '));
  if (typeof detail.status === 'string') bits.push(detail.status);
  if (typeof detail.note === 'string') bits.push(detail.note);
  return bits.join(', ');
}

/* --------------------------------------------------------------- account -- */

function AccountTab({
  creator,
}: {
  creator: NonNullable<ReturnType<typeof useCreator>['data']>;
}) {
  const facts: { label: string; value: string }[] = [
    { label: 'Name', value: creator.display_name || 'Not set' },
    { label: 'Email', value: creator.email },
    { label: 'Role', value: ROLE_LABEL[creator.role] },
    // Labelled as a tier, never stacked under "Role", or a starting creator
    // reads as "Creator / Creator" and looks like a bug.
    {
      label: 'Tier',
      value: creator.tier ? `${TIER_LABEL[creator.tier]} tier` : 'Not assigned',
    },
    { label: 'Account', value: creator.is_active ? 'Active' : 'Suspended' },
    {
      label: 'Joined',
      value: new Date(creator.created_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    },
    { label: 'Niche', value: creator.niche || 'Not given' },
  ];

  return (
    <div className="mt-5 grid max-w-3xl gap-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="wx-neo-raised rounded-lg px-5 py-4">
            <dt className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {f.label}
            </dt>
            <dd className="mt-1.5 font-semibold break-words">{f.value}</dd>
          </div>
        ))}
      </dl>

      {creator.application_id ? (
        <ButtonLink
          to={`/admin/applications/${creator.application_id}`}
          variant="secondary"
          size="sm"
          className="self-start"
        >
          <FileText size={15} aria-hidden />
          The application they sent
        </ButtonLink>
      ) : (
        <p className="text-faint text-[0.78125rem] leading-relaxed">
          This creator has no application on file. That is possible: an account can be made for
          somebody directly.
        </p>
      )}
    </div>
  );
}
