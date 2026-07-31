import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { collectFieldErrors } from '@/lib/schemas/brand';
import {
  offerApplicationSchema,
  type OfferApplicationInput,
} from '@/lib/schemas/offer-application';
import { money } from '@/lib/admin/useBrands';
import { useApplyForOffer } from '@/lib/creator/useOfferApplications';
import type { CreatorOffer } from '@/lib/creator/useCreatorBrands';

/**
 * Asking for an offer.
 *
 * A creator can take the brand's terms as written, or say what they will
 * actually do and what they want for it. The second is the whole point: an
 * offer is an opening position, not a contract, and a creator with an audience
 * worth more than the sticker price should be able to say so without leaving
 * the product to send a DM.
 *
 * An offer with no fixed terms skips the choice entirely. There is nothing to
 * accept, so the only way in is to name your own numbers.
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
  useFocusTrap(panelRef, { initialSelector: 'button, input' });

  const hasFixedTerms = offer.video_count !== null && offer.reward_amount !== null;

  const [values, setValues] = useState<OfferApplicationInput>({
    mode: hasFixedTerms ? 'asOffered' : 'own',
    // Prefilled from the offer so countering starts from their numbers rather
    // than from an empty box. Strings, because these back text inputs and
    // PostgREST hands `numeric` back as a JSON number.
    videoCount: offer.video_count != null ? String(offer.video_count) : '',
    amount: offer.reward_amount != null ? String(offer.reward_amount) : '',
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const apply = useApplyForOffer();
  const busy = apply.isPending;

  const set = <K extends keyof OfferApplicationInput>(
    key: K,
    value: OfferApplicationInput[K]
  ) => {
    const next = { ...values, [key]: value };
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
      {
        action: 'application.create',
        offerId: offer.id,
        // Null on both is what tells the server "as offered". Sending their
        // numbers here when they picked the brand's terms would record a
        // counter offer that nobody made.
        videoCount: parsed.mode === 'own' ? parsed.videoCount : null,
        amount: parsed.mode === 'own' ? parsed.amount : null,
        note: parsed.note || null,
      },
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

          {hasFixedTerms ? (
            <div className="grid gap-2.5">
              <Choice
                selected={values.mode === 'asOffered'}
                disabled={busy}
                onSelect={() => set('mode', 'asOffered')}
                title="Take it as offered"
                detail={`${offer.video_count} ${offer.video_count === 1 ? 'video' : 'videos'} for ${money(offer.reward_amount, offer.currency)}`}
              />
              <Choice
                selected={values.mode === 'own'}
                disabled={busy}
                onSelect={() => set('mode', 'own')}
                title="Suggest your own terms"
                detail="Say what you will do, and what you want for it."
              />
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] leading-relaxed text-muted">
              This one has no set deliverable or fee, so tell them what you would do and
              what you would want for it.
            </p>
          )}

          {values.mode === 'own' ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Videos" error={errors.videoCount}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="videoCount"
                    inputMode="numeric"
                    placeholder="e.g. 5"
                    value={values.videoCount ?? ''}
                    disabled={busy}
                    onChange={(e) => set('videoCount', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field
                label={`Your price (${offer.currency})`}
                error={errors.amount}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="amount"
                    inputMode="decimal"
                    placeholder="e.g. 400"
                    value={values.amount ?? ''}
                    disabled={busy}
                    onChange={(e) => set('amount', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
            </div>
          ) : null}

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
                  onChange={(e) => set('note', e.target.value)}
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

/** A big tappable card rather than a radio dot. This is read on a phone. */
function Choice({
  selected,
  disabled,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-200 disabled:opacity-60',
        selected
          ? 'border-accent bg-accent-soft'
          : 'border-line-interactive bg-surface-2 hover:border-accent/60'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
          selected ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'
        )}
      >
        {selected ? <Check size={13} /> : null}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-[14px] font-semibold', selected && 'text-accent')}>
          {title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{detail}</span>
      </span>
    </button>
  );
}
