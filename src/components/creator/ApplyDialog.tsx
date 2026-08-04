import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { collectFieldErrors } from '@/lib/schemas/brand';
import {
  offerApplicationSchema,
  type OfferApplicationInput,
} from '@/lib/schemas/offer-application';
import { money } from '@/lib/money';
import { useApplyForOffer } from '@/lib/creator/useOfferApplications';
import type { CreatorOffer } from '@/lib/creator/useCreatorBrands';

/**
 * Asking for an offer.
 *
 * A creator takes the deal on the table. There is nothing to negotiate here,
 * so this restates exactly what they are asking for and gives them one place to
 * say something alongside it.
 *
 * The confirmation step earns its keep even with nothing to fill in: this is a
 * commitment about money, and a single unguarded click is how somebody ends up
 * on a deal they were only reading about.
 */
export function ApplyDialog({
  offer,
  brandName,
  onClose,
}: {
  offer: CreatorOffer;
  brandName: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'textarea' });

  const [values, setValues] = useState<OfferApplicationInput>({ note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const apply = useApplyForOffer();
  const busy = apply.isPending;

  const hasTerms = offer.video_count !== null && offer.reward_amount !== null;

  const set = (note: string) => {
    const next = { note };
    setValues(next);
    if (submitted) setErrors(collectFieldErrors(offerApplicationSchema, next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const next = collectFieldErrors(offerApplicationSchema, values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const parsed = offerApplicationSchema.parse(values);
    apply.mutate(
      { action: 'application.create', offerId: offer.id, note: parsed.note || null },
      { onSuccess: onClose }
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Apply for ${offer.title}`}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => !busy && onClose()}
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface-1 p-6 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{offer.title}</h2>
            <p className="mt-1 text-[14px] text-muted">{brandName}</p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-6">
          <FormError>{apply.error ? (apply.error as Error).message : ''}</FormError>

          {/* Exactly what they are agreeing to, restated. */}
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3.5">
            {hasTerms ? (
              <>
                <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                  You would be asking for
                </span>
                <span className="wx-numeric mt-1 block text-[15px] font-semibold">
                  {offer.video_count} {offer.video_count === 1 ? 'video' : 'videos'} for{' '}
                  <span className="text-accent">
                    {money(offer.reward_amount, offer.currency)}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[14px] leading-relaxed text-muted">
                The team will confirm what this one involves with you directly.
              </span>
            )}
            {offer.description ? (
              <span className="mt-3 block border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
                {offer.description}
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            <Field
              label="Anything to add"
              error={errors.note}
              hint="Optional. The team reads this with your request."
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name="note"
                  maxLength={1000}
                  rows={3}
                  placeholder="e.g. I already use this product, so I can post within a week."
                  value={values.note}
                  disabled={busy}
                  onChange={(e) => set(e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending...' : 'Send request'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </m.div>
    </div>
  );
}
