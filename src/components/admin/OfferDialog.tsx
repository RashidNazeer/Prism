import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import { collectFieldErrors, CURRENCIES, offerSchema, type OfferInput } from '@/lib/schemas/brand';
import { money, type Offer } from '@/lib/admin/useBrands';

/**
 * Create or edit an offer inside a brand hub.
 *
 * An offer is "do this much, get paid this much". The two fields that carry the
 * weight are the video count and the reward, so they sit together with a live
 * summary underneath: an admin should see "5 videos for $300" before they save
 * it, not after a creator has accepted it.
 */
export function OfferDialog({
  brandId,
  brandName,
  offer,
  onClose,
}: {
  brandId: string;
  brandName: string;
  /** Absent means create. */
  offer?: Offer;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'input' });

  const [values, setValues] = useState<OfferInput>({
    badgeTitle: offer?.badge_title ?? '',
    title: offer?.title ?? '',
    description: offer?.description ?? '',
    // Coerced to strings, because these back text inputs. PostgREST hands
    // `numeric` back as a number, not the string the column suggests, and a
    // number here crashed the dialog the moment anything called `.trim()` on
    // it. Null stays empty rather than becoming the text "null".
    videoCount: offer?.video_count != null ? String(offer.video_count) : '',
    rewardAmount: offer?.reward_amount != null ? String(offer.reward_amount) : '',
    currency: (offer?.currency ?? 'USD') as OfferInput['currency'],
    status: offer?.status ?? 'active',
    needsApplication: offer?.needs_application ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const save = useManageBrand();
  const busy = save.isPending;

  /**
   * Once they have tried to submit, re-check on every keystroke.
   *
   * Without this an error sticks until the next submit: type 0, get "between 1
   * and 1000", correct it to 1, and the red stays. People then assume the
   * corrected value is still wrong.
   */
  const set = <K extends keyof OfferInput>(key: K, value: OfferInput[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(collectFieldErrors(offerSchema, next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const next = collectFieldErrors(offerSchema, values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const parsed = offerSchema.parse(values);
    save.mutate(
      {
        action: 'offer.save',
        offerId: offer?.id ?? null,
        brandId,
        badgeTitle: parsed.badgeTitle || null,
        title: parsed.title,
        description: parsed.description || null,
        videoCount: parsed.videoCount,
        rewardAmount: parsed.rewardAmount,
        // Both may legitimately be null: an offer with no fixed deliverable
        // and no fixed fee, such as a boosted commission rate.
        currency: parsed.currency,
        status: parsed.status,
        needsApplication: parsed.needsApplication,
      },
      { onSuccess: onClose }
    );
  };

  // A plain preview of the deal, from whatever is in the boxes right now.
  // Only shown when both halves are there; "0 videos for $NaN" helps nobody.
  // String() first: these are always strings in state now, but a stray number
  // arriving from anywhere must never be able to crash the dialog again.
  const rawVideos = String(values.videoCount ?? '').trim();
  const rawReward = String(values.rewardAmount ?? '').trim();
  const videos = Number(rawVideos);
  const reward = Number(rawReward);
  const previewable =
    rawVideos !== '' &&
    rawReward !== '' &&
    Number.isFinite(videos) &&
    videos > 0 &&
    Number.isFinite(reward);
  const perVideo = previewable ? reward / videos : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={offer ? `Edit ${offer.title}` : `New offer for ${brandName}`}
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
        className="relative max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line bg-surface-1 p-6 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{offer ? 'Edit offer' : 'New offer'}</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              What {brandName} will pay a creator, and what they get for it.
            </p>
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
          <FormError>{save.error ? (save.error as Error).message : ''}</FormError>

          <div className="grid gap-5">
            <Field label="Offer title" error={errors.title}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="title"
                  placeholder="e.g. Starter bundle"
                  value={values.title}
                  disabled={busy}
                  onChange={(e) => set('title', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field
              label="Badge"
              error={errors.badgeTitle}
              hint="Optional. A short label on the card, like TOP PICK."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="badgeTitle"
                  maxLength={32}
                  placeholder="e.g. TOP PICK"
                  value={values.badgeTitle}
                  disabled={busy}
                  onChange={(e) => set('badgeTitle', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            {/* Required or optional depending on the checkbox at the bottom,
                so the hint has to say which one it is right now. */}
            <Field
              label={values.needsApplication ? 'Description' : 'Description (optional)'}
              error={errors.description}
              hint={
                values.needsApplication
                  ? 'Required, because a creator has to apply for this. Tell them what they would be delivering.'
                  : 'Optional. Anyone can take this offer without asking.'
              }
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name="description"
                  maxLength={2000}
                  placeholder="e.g. Five in-feed videos featuring the hero product, posted within 30 days."
                  value={values.description}
                  disabled={busy}
                  onChange={(e) => set('description', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            {/* The deal itself. */}
            <div className="grid gap-5 sm:grid-cols-[1fr_1fr_7.5rem]">
              {/* Required only when they have to apply. An offer with no fixed
                  deliverable, like a boosted commission rate, leaves both
                  empty rather than carrying a made up number. */}
              <Field
                label={values.needsApplication ? 'Videos' : 'Videos (optional)'}
                error={errors.videoCount}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="videoCount"
                    inputMode="numeric"
                    // "e.g." on purpose. A bare "5" sitting in an empty box is
                    // indistinguishable from a 5 somebody typed, so the form
                    // looks filled in when it is not, and the errors under it
                    // look like a bug rather than an instruction.
                    placeholder="e.g. 5"
                    value={values.videoCount}
                    disabled={busy}
                    onChange={(e) => set('videoCount', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field
                label={values.needsApplication ? 'Reward' : 'Reward (optional)'}
                error={errors.rewardAmount}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="rewardAmount"
                    inputMode="decimal"
                    placeholder="e.g. 300"
                    value={values.rewardAmount}
                    disabled={busy}
                    onChange={(e) => set('rewardAmount', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Currency" error={errors.currency}>
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    name="currency"
                    value={values.currency}
                    disabled={busy}
                    onChange={(e) => set('currency', e.target.value as OfferInput['currency'])}
                    aria-describedby={describedBy}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            {previewable ? (
              <p
                role="status"
                className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-muted"
              >
                <span className="font-semibold text-text">
                  {videos} {videos === 1 ? 'video' : 'videos'} for{' '}
                  {money(reward, values.currency)}
                </span>
                <span className="block text-[13px] text-faint">
                  {money(perVideo, values.currency)} per video
                </span>
              </p>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Status" error={errors.status}>
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    name="status"
                    value={values.status}
                    disabled={busy}
                    onChange={(e) => set('status', e.target.value as OfferInput['status'])}
                    aria-describedby={describedBy}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                )}
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-interactive bg-surface-2 p-4">
              <input
                type="checkbox"
                name="needsApplication"
                checked={values.needsApplication}
                disabled={busy}
                onChange={(e) => set('needsApplication', e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--wx-accent)]"
              />
              <span>
                <span className="block text-[14px] font-medium">Needs application</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                  {values.needsApplication
                    ? 'A creator has to apply and be approved before they get this.'
                    : 'Any approved creator can take this without asking. Nobody signs it off.'}
                </span>
              </span>
            </label>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : offer ? 'Save changes' : 'Create offer'}
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
