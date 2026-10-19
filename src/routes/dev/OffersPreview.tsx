import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { EarnPage } from '@/routes/app/Offers';
import { CONTEST_CASES } from '@/routes/dev/ContestsPreview';
import type { CreatorContest } from '@/lib/creator/useCreatorContests';
import type { CreatorOfferRow } from '@/lib/creator/useAllOffers';
import type { MyOfferApplication } from '@/lib/creator/useOfferApplications';
import { deriveProgress, type JobProgress } from '@/lib/work/job-progress';
import type { OfferStage } from '@/lib/offer-stages';

/**
 * THE MERGED EARN PAGE (offers + contests), RENDERED AGAINST FIXTURES. DEV ONLY (`/dev/offers`).
 *
 * It renders the REAL `EarnPage` that `/app/offers` renders, so what you see
 * is the layout she gets. Nothing here is a copy.
 *
 * `?case=` picks one: `hers` (her three accepted and NO contests, as
 * screenshotted), `both` (offers plus entered, declined and open contests),
 * `shut` (her only work is a contest whose door shut: contests lead and the
 * entry is not greyed), `many` (the search box appears) or `empty`. `?theme=dark|light` shows one theme;
 * without it both are stacked. Judge LAYOUT here, colour on the real page, and
 * do not read the blur budget off a stacked page.
 */

const brand = (name: string, slug: string) => ({ id: slug, name, slug, logo_url: null });

function offer(
  id: string,
  b: ReturnType<typeof brand>,
  name: string,
  videos: number,
  fee: number,
  over: Partial<CreatorOfferRow> = {}
): CreatorOfferRow {
  return {
    id,
    brand_id: b.id,
    badge_title: null,
    title: `${name}, ${videos} videos, $${fee} at $${fee / videos} a video`,
    description: `${videos} videos for ${b.name} over the month, paid $${fee} in total at $${fee / videos} a video.`,
    video_count: videos,
    reward_amount: fee,
    currency: 'USD',
    needs_application: true,
    created_at: '2026-10-01T00:00:00Z',
    brand: b,
    ...over,
  };
}

function request(
  offerId: string,
  b: ReturnType<typeof brand>,
  status: MyOfferApplication['status'],
  fee: number | null,
  videos: number | null,
  stage: OfferStage | null,
  over: Partial<MyOfferApplication> = {}
): MyOfferApplication {
  return {
    id: `req-${offerId}`,
    offer_id: offerId,
    brand_id: b.id,
    status,
    stage,
    committed_amount: fee,
    committed_video_count: videos,
    currency: 'USD',
    note: null,
    decision_note: null,
    decided_at: '2026-10-09T00:00:00Z',
    created_at: '2026-10-02T00:00:00Z',
    ...over,
  };
}

const swisse = brand('Swisse', 'swisse');
const tobias = brand('Dr Tobias', 'dr-tobias');
const aurelia = brand('Aurelia', 'aurelia');
const glow = brand('Glow Lab', 'glow-lab');
const nord = brand('Nordhaus', 'nordhaus');

const hers = {
  offers: [
    offer('o1', swisse, 'Swisse retainer', 8, 360),
    offer('o2', tobias, 'Dr Tobias retainer', 5, 350),
    offer('o3', aurelia, 'Aurelia retainer', 6, 330),
  ],
  requests: [
    request('o1', swisse, 'approved', 360, 8, 'content_pending'),
    request('o2', tobias, 'approved', 350, 5, 'payment_pending'),
    request('o3', aurelia, 'approved', 330, 6, 'paid'),
  ],
  progress: [
    deriveProgress({
      application_id: 'req-o1', creator_id: 'c', brand_id: 'swisse', offer_id: 'o1',
      required: 8, approved: 3, waiting: 2, needs_another_take: 0, posted: 5,
    }),
    deriveProgress({
      application_id: 'req-o2', creator_id: 'c', brand_id: 'dr-tobias', offer_id: 'o2',
      required: 5, approved: 5, waiting: 0, needs_another_take: 0, posted: 5,
    }),
    deriveProgress({
      application_id: 'req-o3', creator_id: 'c', brand_id: 'aurelia', offer_id: 'o3',
      required: 6, approved: 6, waiting: 0, needs_another_take: 0, posted: 6,
    }),
  ],
};

const mixed = {
  offers: [
    ...hers.offers,
    offer('o4', glow, 'Glow Lab launch', 3, 240),
    offer('o5', nord, 'Nordhaus winter', 4, 400),
    offer('o6', glow, 'Glow Lab always on', 2, 100, { needs_application: false }),
    offer('o7', nord, 'Nordhaus spring', 4, 380),
  ],
  requests: [
    ...hers.requests,
    request('o4', glow, 'pending', null, null, null, { note: 'Love this range, see my work at https://tiktok.com/@rudely' }),
    request('o5', nord, 'rejected', null, null, null, { decision_note: 'We filled the roster for this one.' }),
  ],
  progress: hers.progress,
};

const many = {
  offers: [
    ...mixed.offers,
    offer('o8', swisse, 'Swisse summer', 5, 250),
    offer('o9', aurelia, 'Aurelia gifting', 2, 120),
    offer('o10', tobias, 'Dr Tobias clinic', 4, 280),
    offer('o11', glow, 'Glow Lab holiday', 6, 420),
  ],
  requests: mixed.requests,
  progress: mixed.progress,
};

const paidOnly = {
  offers: [hers.offers[2]!],
  requests: [hers.requests[2]!],
  progress: [hers.progress[2]!],
};

const none: CreatorContest[] = [];

const CASES: Record<
  string,
  {
    offers: CreatorOfferRow[];
    requests: MyOfferApplication[];
    progress: JobProgress[];
    contests: CreatorContest[];
  }
> = {
  hers: { ...hers, contests: none },
  both: { ...mixed, contests: CONTEST_CASES.entered ?? none },
  shut: { ...paidOnly, contests: CONTEST_CASES.shut ?? none },
  many: { ...many, contests: CONTEST_CASES.many ?? none },
  empty: { offers: [], requests: [], progress: [], contests: none },
};
type CaseKey = string;

function Frame({ theme, caseKey }: { theme: 'dark' | 'light'; caseKey: CaseKey }) {
  const c = CASES[caseKey] ?? CASES.hers!;
  const progress = new Map(c.progress.map((p) => [p.application_id, p]));
  return (
    <div
      data-theme={theme}
      className="bg-bg text-text mx-auto min-h-screen w-full max-w-[90rem] px-3 pb-8 sm:px-6"
    >
      <p className="text-faint pt-3 text-[0.6875rem] tracking-widest uppercase">
        {caseKey} / {theme}
      </p>
      <EarnPage
        approved
        isCreator
        offers={[...c.offers]}
        requests={[...c.requests]}
        progress={progress}
        offersLoading={false}
        offersError={false}
        refetchOffers={() => undefined}
        contests={c.contests}
        contestsLoading={false}
        contestsError={false}
        retryContests={() => undefined}
      />
    </div>
  );
}

export function OffersPreview() {
  const [params] = useSearchParams();
  const raw = params.get('case');
  const caseKey: CaseKey = raw && raw in CASES ? (raw as CaseKey) : 'hers';
  const theme = params.get('theme');
  useEffect(() => {
    const t = params.get('theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  }, [params]);
  const themes: ('dark' | 'light')[] =
    theme === 'dark' || theme === 'light' ? [theme] : ['dark', 'light'];
  return (
    <div>
      {themes.map((t) => (
        <Frame key={t} theme={t} caseKey={caseKey} />
      ))}
    </div>
  );
}
