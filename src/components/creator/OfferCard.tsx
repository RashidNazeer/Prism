import { Link } from 'react-router';
import { Check, ChevronDown, Clock, Store, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StageTracker } from '@/components/creator/StageTracker';
import { JobProgressBar } from '@/components/work/JobProgress';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { STAGE_META, stageTextTone } from '@/lib/offer-stages';
import { useApplyForOffer, type MyOfferApplication } from '@/lib/creator/useOfferApplications';
import type { JobProgress } from '@/lib/work/job-progress';

/**
 * One offer, as a creator sees it. ONE component, used by both screens.
 *
 * This was written out twice, once on the offers list and once inside the brand
 * hub, and the two copies had already drifted: only one showed the per video
 * rate, and only one carried a sentence about posting that was not true. Two
 * cards for one offer is how a creator gets two answers to one question, which
 * is the exact thing this whole step exists to stop.
 *
 * The card shows no status chip at the top. The action at the bottom says what
 * state the offer is in, and saying it twice made the second one read as a
 * different fact.
 */

/** The least an offer has to be for this card to draw it. */
export interface OfferCardOffer {
  id: string;
  badge_title: string | null;
  title: string;
  description: string | null;
  video_count: number | null;
  reward_amount: string | number | null;
  currency: string;
  needs_application: boolean;
  brand?: { id: string; name: string; slug: string; logo_url: string | null } | null;
}

export function OfferCard({
  offer,
  request,
  progress,
  showBrand = false,
  onApply,
}: {
  offer: OfferCardOffer;
  /** Their newest request on this offer, if they have ever made one. */
  request: MyOfferApplication | undefined;
  /** How much of the job has been filmed. Only ever present once approved. */
  progress: JobProgress | undefined;
  /** The brand row, for the list. Inside a hub it is noise. */
  showBrand?: boolean;
  onApply: () => void;
}) {
  /*
   * ONCE THEY ARE ON IT, THE CARD SHOWS THE DEAL THEY WERE GIVEN.
   *
   * Both numbers freeze at approval. Re-scoping or re-pricing an offer applies
   * to whoever is approved next, so the offer's own figures and this creator's
   * can legitimately differ, and printing today's offer above a bar counting
   * against a frozen five is how one card says two things at once.
   */
  const agreed = request?.status === 'approved';
  const videoCount = agreed ? request.committed_video_count : offer.video_count;
  const rewardAmount = agreed ? request.committed_amount : offer.reward_amount;
  const currency = agreed ? request.currency : offer.currency;

  const hasVideos = videoCount !== null;
  const hasReward = rewardAmount !== null;
  const perVideo =
    videoCount && videoCount > 1 && rewardAmount != null
      ? Number(rewardAmount) / videoCount
      : null;

  return (
    <div className="border-line bg-surface-1 flex h-full flex-col rounded-xl border p-5 shadow-md">
      {showBrand && offer.brand ? (
        <Link
          to={`/app/brands/${offer.brand.slug}`}
          className="text-muted hover:text-accent flex items-center gap-2.5 transition-colors"
        >
          <span className="border-line bg-surface-2 grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border">
            {offer.brand.logo_url ? (
              <img src={offer.brand.logo_url} alt="" className="size-full object-cover" />
            ) : (
              <Store size={13} aria-hidden className="text-faint" />
            )}
          </span>
          <span className="truncate text-[0.8125rem] font-medium">{offer.brand.name}</span>
        </Link>
      ) : null}

      {offer.badge_title ? (
        <span
          className={cn(
            'bg-accent-soft text-accent self-start rounded-full px-2.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.12em] uppercase',
            showBrand && offer.brand ? 'mt-3' : 'mb-3'
          )}
        >
          {offer.badge_title}
        </span>
      ) : null}

      <h3 className={cn('text-lg font-bold', offer.badge_title && showBrand && 'mt-1')}>
        {offer.title}
      </h3>

      {hasVideos || hasReward ? (
        <div className="border-line mt-4 flex flex-wrap items-end gap-x-6 gap-y-2 border-t pt-4">
          {hasVideos ? (
            <span>
              <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                Videos
              </span>
              <span className="font-display mt-1 block text-[1.1875rem] font-semibold">
                {videoCount}
              </span>
            </span>
          ) : null}
          {hasReward ? (
            <span>
              <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                You get
              </span>
              <span className="font-display text-accent mt-1 block text-[1.1875rem] font-semibold">
                {money(rewardAmount, currency)}
              </span>
            </span>
          ) : null}
          {perVideo !== null ? (
            <span className="text-faint text-[0.75rem]">
              {money(perVideo, currency)} per video
            </span>
          ) : null}
        </div>
      ) : null}

      {/*
        THE DESCRIPTION IS BEHIND A DISCLOSURE, not printed on every card.

        Rashid: "we need to make this card with minimum information and then
        accordion open up with more info". Every offer here carries the same
        three paragraphs about samples and posting to your own account, so
        printing them on each card is three cards' worth of identical prose
        between a creator and the numbers they came to read.

        A `<details>` rather than state and a div: it is open and closed for
        free, keyboard operable for free, and findable by the browser's own
        find-on-page even while shut, which a hand-rolled accordion is not.
      */}
      {offer.description ? (
        <details className="group border-line mt-3 border-t pt-3">
          <summary className="text-muted hover:text-text marker:content-none flex cursor-pointer list-none items-center gap-1.5 text-[0.8125rem] font-semibold transition-colors [&::-webkit-details-marker]:hidden">
            <ChevronDown
              size={14}
              aria-hidden
              className="shrink-0 transition-transform duration-200 group-open:rotate-180"
            />
            <span className="group-open:hidden">What this involves</span>
            <span className="hidden group-open:inline">Hide the detail</span>
          </summary>
          <p className="text-muted mt-2.5 text-[0.875rem] leading-relaxed">{offer.description}</p>
        </details>
      ) : null}

      <div className="mt-auto pt-4">
        <OfferAction
          offer={offer}
          request={request}
          progress={progress}
          onApply={onApply}
        />
      </div>
    </div>
  );
}

/**
 * The bottom of the card, and the only thing that differs between them.
 */
function OfferAction({
  offer,
  request,
  progress,
  onApply,
}: {
  offer: OfferCardOffer;
  request: MyOfferApplication | undefined;
  progress: JobProgress | undefined;
  onApply: () => void;
}) {
  const withdraw = useApplyForOffer();

  /*
   * LIVE WORK IS DECIDED FIRST, before anything the offer says about itself.
   *
   * `needs_application` used to be checked first, which was wrong the moment an
   * admin switched it off on an offer somebody had already been approved for:
   * the card said "you are already on this one" and swallowed their stage,
   * their tracker and the money they were owed.
   *
   * Rashid, 2026-08-11, on the same rule from the other side: an offer nobody
   * has to apply for is never counted towards an offer. So progress follows the
   * JOB, never the flag. No job, no progress, on either side of this branch.
   */
  if (request?.status === 'approved') {
    const stage = request.stage ?? 'pending_request';
    return (
      <div>
        <div
          className={cn(
            'rounded-xl px-3.5 py-3',
            stage === 'paid' ? 'bg-stage-paid-soft' : 'bg-surface-2'
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span
              className={cn('text-[0.875rem] font-semibold', stage === 'paid' && 'text-stage-paid')}
            >
              {stage === 'paid' ? 'Paid out' : 'You are in'}
            </span>
            {request.committed_amount != null ? (
              <span
                className={cn('font-display text-[0.9375rem] font-semibold', stageTextTone(stage))}
              >
                {money(request.committed_amount, request.currency)}
              </span>
            ) : null}
          </div>
          <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
            {STAGE_META[stage].creatorHint}
          </p>
        </div>

        <StageTracker stage={stage} className="mt-3" />

        {progress ? (
          <JobProgressBar
            progress={progress}
            addVideoHref={`/app/content?job=${request.id}`}
            className="border-line mt-3 border-t pt-3"
          />
        ) : null}

        {request.decision_note ? (
          <p className="text-muted mt-2 text-[0.8125rem]">{request.decision_note}</p>
        ) : null}
      </div>
    );
  }

  if (request?.status === 'pending') {
    return (
      <div>
        {/* The card already prints the offer's numbers a few lines above, and
            those are exactly what was asked for, so there is nothing to repeat
            here. */}
        <Note tone="pending" icon={<Clock size={15} aria-hidden />}>
          <span className="font-semibold">With the team</span>
        </Note>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={withdraw.isPending}
          onClick={() =>
            withdraw.mutate({ action: 'application.withdraw', applicationId: request.id })
          }
        >
          {withdraw.isPending ? 'Withdrawing...' : 'Withdraw'}
        </Button>
        {withdraw.error ? (
          <p role="alert" className="text-danger mt-2 text-[0.75rem]">
            {(withdraw.error as Error).message}
          </p>
        ) : null}
      </div>
    );
  }

  /*
   * Open to everyone, and nothing under way on it.
   *
   * It used to add "No application needed. Start posting whenever you are
   * ready", which was simply false: content attaches to a JOB, an open offer
   * has no job behind it, and there was nowhere for that creator to post. It
   * now says what is actually true and stops.
   */
  if (!offer.needs_application) {
    return (
      <Note tone="success" icon={<Check size={15} aria-hidden />}>
        <span className="font-semibold">You are already on this one</span>
        {/*
          IT USED TO SAY "Open to every approved creator", and from 2026-08-21
          that is a claim this card cannot make. Offers now carry an audience:
          a high commission offer can be narrowed to named creators, and a
          volume offer can exclude them. The sentence would have been false on
          every restricted offer, printed on both creator screens, and the card
          has no way to know which it is looking at — nor should it, since who
          else can see an offer is not a creator's business.

          So it says the only thing that is true of every offer reaching this
          branch: you have it, and there is nothing to ask for.
        */}
        <span className="text-muted block text-[0.8125rem]">
          It is yours to take. Nothing to apply for.
        </span>
      </Note>
    );
  }

  if (request?.status === 'rejected') {
    return (
      <div>
        <Note tone="danger" icon={<X size={15} aria-hidden />}>
          <span className="font-semibold">Not this time</span>
          {request.decision_note ? (
            <span className="text-muted mt-0.5 block text-[0.8125rem]">{request.decision_note}</span>
          ) : null}
        </Note>
        <Button variant="secondary" size="sm" className="mt-2" onClick={onApply}>
          Ask again
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" className="w-full sm:w-auto" onClick={onApply}>
      Apply for this
    </Button>
  );
}

function Note({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'pending' | 'danger';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[0.875rem]',
        tone === 'success' && 'bg-stage-paid-soft text-stage-paid',
        tone === 'pending' && 'bg-stage-due-soft text-stage-due',
        tone === 'danger' && 'bg-danger-soft text-danger'
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
