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
    videoCount: offer ? String(offer.video_count) : '',
    rewardAmount: offer?.reward_amount ?? '',
    currency: (offer?.currency ?? 'USD') as OfferInput['currency'],
    status: offer?.status ?? 'active',
    needsApplication: offer?.needs_application ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useManageBrand();
  const busy = save.isPending;

  const set = <K extends keyof OfferInput>(key: K, value: OfferInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
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
        currency: parsed.currency,
        status: parsed.status,
        needsApplication: parsed.needsApplication,
      },
      { onSuccess: onClose }
    );
  };

  // A plain preview of the deal, from whatever is in the boxes right now.
  const videos = Number(values.videoCount);
  const reward = Number(values.rewardAmount);
  const previewable = Number.isFinite(videos) && videos > 0 && Number.isFinite(reward);
  const perVideo = previewable && videos > 0 ? reward / videos : 0;

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
                  placeholder="Starter bundle"
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
                  placeholder="TOP PICK"
                  value={values.badgeTitle}
                  disabled={busy}
                  onChange={(e) => set('badgeTitle', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field label="Description" error={errors.description} hint="Optional. What the creator has to deliver.">
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name="description"
                  maxLength={2000}
                  placeholder="Five in-feed videos featuring the hero product, posted within 30 days."
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
              <Field label="Videos" error={errors.videoCount}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="videoCount"
                    inputMode="numeric"
                    placeholder="5"
                    value={values.videoCount}
                    disabled={busy}
                    onChange={(e) => set('videoCount', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Reward" error={errors.rewardAmount}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="rewardAmount"
                    inputMode="decimal"
                    placeholder="300"
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
