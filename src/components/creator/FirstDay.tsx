import { useState } from 'react';
import { Check } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { ApplyDialog } from '@/components/creator/ApplyDialog';
import { money } from '@/lib/money';
import { OFFER_STAGES, STAGE_META } from '@/lib/offer-stages';
import { useCreatorBrands } from '@/lib/creator/useCreatorBrands';
import { useAllCreatorOffers, type CreatorOfferRow } from '@/lib/creator/useAllOffers';

/**
 * A creator's first five minutes: approved, nothing taken yet.
 *
 * Its own file, and lazily loaded by the dashboard, on purpose. It reaches for
 * the offers list, the brands list and the apply dialog, and the dialog drags
 * the whole Zod schema chunk in behind it. Imported directly that cost landed
 * on the home screen of every creator who HAS work, which is all of them after
 * week one, and it was heavy enough to slow the first paint on a phone
 * measurably. Nothing in here is needed until somebody actually has an empty
 * board.
 *
 * It reads the same two lists the offers and brands screens read and nothing
 * else. The point is that the pipeline is laid out in full BEFORE they take
 * anything, so the promise is visible on day one rather than discovered later.
 */
export default function FirstDay() {
  const { data: offers } = useAllCreatorOffers();
  const { data: brands } = useCreatorBrands();
  const [applyingTo, setApplyingTo] = useState<CreatorOfferRow | null>(null);

  const starters = (offers ?? []).slice(0, 4);

  return (
    <>
      <section className="wx-neo-raised flex flex-col gap-5 rounded-xl p-6">
        <div className="flex max-w-[560px] flex-col gap-2">
          <h2 className="font-display text-[clamp(1.25rem,3vw,1.6875rem)] font-semibold tracking-[-0.015em]">
            You are approved. Nothing taken yet.
          </h2>
          <p className="text-muted text-[0.9375rem] leading-[1.5] text-pretty">
            Every job you take shows up here and moves through seven stages, in the open. You
            will always see what it pays and where the money is, without asking anybody.
          </p>
        </div>

        <ol className="grid [grid-template-columns:repeat(auto-fit,minmax(132px,1fr))] gap-2">
          {OFFER_STAGES.map((stage, i) => (
            <li
              key={stage}
              className="wx-neo-inset flex flex-col gap-1.5 rounded-xl px-3 py-2.5"
            >
              <span className="text-muted text-[0.625rem] font-bold tracking-[0.1em]">
                Stage {i + 1}
              </span>
              <span className="text-[0.8125rem] leading-[1.25] font-semibold">
                {STAGE_META[stage].label}
              </span>
              {/* The short clause, not the full hint. Seven sentences across
                  seven 132px columns is a wall of text, not a diagram. */}
              <span className="text-muted text-[0.6875rem] leading-[1.35]">
                {STAGE_META[stage].short}
              </span>
            </li>
          ))}
        </ol>

        <dl className="border-line flex flex-wrap gap-[14px] border-t pt-4">
          <div className="flex flex-col gap-0.5">
            {/*
              "Nothing yet" was hardcoded, and it was true for as long as offers
              were the only way to earn anything. Contests are open to every
              approved creator regardless of which brands they work with, so
              somebody can be owed real money and still have taken no offer.
              This panel sits directly under their contest money in that case,
              and a flat "Nothing yet" beside it would call the block above it a
              liar.

              It names OFFERS rather than quoting the contest figure, because
              that figure is already on the screen and printing it twice invites
              somebody to add them.
            */}
            <dt className="text-muted text-[0.75rem]">Earned from offers</dt>
            <dd className="font-display text-[1.1875rem] font-semibold">Nothing yet</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted text-[0.75rem]">Brands open to you</dt>
            <dd className="font-display text-[1.1875rem] font-semibold">
              {brands?.length ?? 0}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted text-[0.75rem]">Offers you can take</dt>
            <dd className="font-display text-[1.1875rem] font-semibold">
              {offers?.length ?? 0}
            </dd>
          </div>
        </dl>
      </section>

      {starters.length > 0 ? (
        <section className="wx-neo-raised flex flex-col gap-[14px] rounded-xl p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Start here
            </h2>
            <ButtonLink to="/app/offers" variant="link" size="sm" className="px-0">
              See everything on the table
            </ButtonLink>
          </div>

          <ul className="flex flex-col gap-2.5">
            {starters.map((offer) => (
              <li
                key={offer.id}
                className="wx-neo-inset flex flex-wrap items-center gap-3 rounded-lg p-3.5"
              >
                <span
                  aria-hidden
                  className="font-display bg-stage-live-soft text-stage-live grid size-[38px] shrink-0 place-items-center overflow-hidden rounded-[10px] text-[0.875rem] font-bold"
                >
                  {offer.brand?.logo_url ? (
                    <img src={offer.brand.logo_url} alt="" className="size-full object-cover" />
                  ) : (
                    (offer.brand?.name ?? '?').charAt(0)
                  )}
                </span>

                <div className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                  <p className="text-[0.9375rem] font-semibold">{offer.title}</p>
                  <p className="text-muted text-[0.78125rem]">
                    {offer.brand?.name}
                    {offer.video_count !== null
                      ? `, ${offer.video_count} ${offer.video_count === 1 ? 'video' : 'videos'}`
                      : ', no set deliverable'}
                  </p>
                </div>

                <p className="font-display text-[1.0625rem] font-semibold whitespace-nowrap">
                  {offer.reward_amount === null
                    ? 'Fee not set yet'
                    : money(offer.reward_amount, offer.currency)}
                </p>

                {offer.needs_application ? (
                  <button
                    type="button"
                    onClick={() => setApplyingTo(offer)}
                    className="border-text bg-text text-inverse rounded-[10px] border px-4 py-2.5 text-[0.8125rem] font-semibold whitespace-nowrap transition-opacity duration-200 hover:opacity-90"
                  >
                    Apply
                  </button>
                ) : (
                  // Nothing to ask for, so nothing to click.
                  <span className="text-stage-paid flex items-center gap-1.5 text-[0.8125rem] font-semibold whitespace-nowrap">
                    <Check size={15} aria-hidden />
                    Yours already
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
