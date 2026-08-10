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
      <section className="border-line bg-surface-1 flex flex-col gap-5 rounded-[20px] border p-6 shadow-md">
        <div className="flex max-w-[560px] flex-col gap-2">
          <h2 className="font-display text-[clamp(20px,3vw,27px)] font-semibold tracking-[-0.015em]">
            You are approved. Nothing taken yet.
          </h2>
          <p className="text-muted text-[15px] leading-[1.5] text-pretty">
            Every job you take shows up here and moves through seven stages, in the open. You
            will always see what it pays and where the money is, without asking anybody.
          </p>
        </div>

        <ol className="grid [grid-template-columns:repeat(auto-fit,minmax(132px,1fr))] gap-2">
          {OFFER_STAGES.map((stage, i) => (
            <li
              key={stage}
              className="border-line bg-surface-2 flex flex-col gap-1.5 rounded-xl border px-3 py-2.5"
            >
              <span className="text-muted text-[10px] font-bold tracking-[0.1em]">
                Stage {i + 1}
              </span>
              <span className="text-[13px] leading-[1.25] font-semibold">
                {STAGE_META[stage].label}
              </span>
              {/* The short clause, not the full hint. Seven sentences across
                  seven 132px columns is a wall of text, not a diagram. */}
              <span className="text-muted text-[11px] leading-[1.35]">
                {STAGE_META[stage].short}
              </span>
            </li>
          ))}
        </ol>

        <dl className="border-line flex flex-wrap gap-[14px] border-t pt-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted text-[12px]">Earned so far</dt>
            <dd className="font-display text-[19px] font-semibold">Nothing yet</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted text-[12px]">Brands open to you</dt>
            <dd className="font-display text-[19px] font-semibold">{brands?.length ?? 0}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted text-[12px]">Offers you can take</dt>
            <dd className="font-display text-[19px] font-semibold">{offers?.length ?? 0}</dd>
          </div>
        </dl>
      </section>

      {starters.length > 0 ? (
        <section className="border-line bg-surface-1 flex flex-col gap-[14px] rounded-[20px] border p-5 shadow-md">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
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
                className="border-line bg-surface-2 flex flex-wrap items-center gap-3 rounded-[14px] border p-3.5"
              >
                <span
                  aria-hidden
                  className="font-display bg-stage-live-soft text-stage-live grid size-[38px] shrink-0 place-items-center overflow-hidden rounded-[10px] text-[14px] font-bold"
                >
                  {offer.brand?.logo_url ? (
                    <img src={offer.brand.logo_url} alt="" className="size-full object-cover" />
                  ) : (
                    (offer.brand?.name ?? '?').charAt(0)
                  )}
                </span>

                <div className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                  <p className="text-[15px] font-semibold">{offer.title}</p>
                  <p className="text-muted text-[12.5px]">
                    {offer.brand?.name}
                    {offer.video_count !== null
                      ? `, ${offer.video_count} ${offer.video_count === 1 ? 'video' : 'videos'}`
                      : ', no set deliverable'}
                  </p>
                </div>

                <p className="font-display text-[17px] font-semibold whitespace-nowrap">
                  {offer.reward_amount === null
                    ? 'Fee not set yet'
                    : money(offer.reward_amount, offer.currency)}
                </p>

                {offer.needs_application ? (
                  <button
                    type="button"
                    onClick={() => setApplyingTo(offer)}
                    className="border-text bg-text text-inverse rounded-[10px] border px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-opacity duration-200 hover:opacity-90"
                  >
                    Apply
                  </button>
                ) : (
                  // Nothing to ask for, so nothing to click.
                  <span className="text-stage-paid flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap">
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
