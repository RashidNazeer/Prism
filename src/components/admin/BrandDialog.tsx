import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import { brandSchema, collectFieldErrors, CURRENCIES, type BrandInput } from '@/lib/schemas/brand';
import type { Brand } from '@/lib/admin/useBrands';

/**
 * Create or edit a brand.
 *
 * The slug is not here on purpose. It is derived from the name when the brand
 * is created and then never changes, because creators will hold brand hub
 * links and a rename must not break them.
 */
export function BrandDialog({
  brand,
  onClose,
  onSaved,
}: {
  /** Absent means create. */
  brand?: Brand;
  onClose: () => void;
  onSaved?: (brand: Brand) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'input' });

  const [values, setValues] = useState<BrandInput>({
    name: brand?.name ?? '',
    storeId: brand?.store_id ?? '',
    clientName: brand?.client_name ?? '',
    budget: brand?.budget_allocated ?? '',
    currency: (brand?.currency ?? 'USD') as BrandInput['currency'],
    isActive: brand?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const save = useManageBrand();
  const busy = save.isPending;

  // Once they have tried to submit, re-check on every keystroke, so a
  // corrected field clears its error instead of staying red.
  const set = <K extends keyof BrandInput>(key: K, value: BrandInput[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(collectFieldErrors(brandSchema, next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const next = collectFieldErrors(brandSchema, values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const parsed = brandSchema.parse(values);
    save.mutate(
      {
        action: 'brand.save',
        brandId: brand?.id ?? null,
        name: parsed.name,
        storeId: parsed.storeId,
        clientName: parsed.clientName || null,
        budget: parsed.budget,
        currency: parsed.currency,
        isActive: parsed.isActive,
      },
      {
        onSuccess: (saved) => {
          onSaved?.(saved as Brand);
          onClose();
        },
      }
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={brand ? `Edit ${brand.name}` : 'Add a brand'}
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
            <h2 className="text-lg font-bold">{brand ? 'Edit brand' : 'Add a brand'}</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              A brand is a seller store on TikTok Shop. Everything else in its hub hangs
              off this.
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
            <Field label="Brand name" error={errors.name}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="name"
                  placeholder="Vitauthority"
                  value={values.name}
                  disabled={busy}
                  onChange={(e) => set('name', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field
              label="TikTok Shop store id"
              error={errors.storeId}
              hint="Their store's id on TikTok Shop. Each brand needs its own."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="storeId"
                  placeholder="7495012345678901234"
                  value={values.storeId}
                  disabled={busy}
                  onChange={(e) => set('storeId', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field label="Client name" error={errors.clientName} hint="Internal. Creators never see this.">
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="clientName"
                  placeholder="Who we invoice"
                  value={values.clientName}
                  disabled={busy}
                  onChange={(e) => set('clientName', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-[1fr_7.5rem]">
              <Field label="Budget allocated" error={errors.budget} hint="Optional.">
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="budget"
                    inputMode="decimal"
                    placeholder="25000"
                    value={values.budget ?? ''}
                    disabled={busy}
                    onChange={(e) => set('budget', e.target.value)}
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
                    onChange={(e) => set('currency', e.target.value as BrandInput['currency'])}
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

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-interactive bg-surface-2 p-4">
              <input
                type="checkbox"
                name="isActive"
                checked={values.isActive}
                disabled={busy}
                onChange={(e) => set('isActive', e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--wx-accent)]"
              />
              <span>
                <span className="block text-[14px] font-medium">Active</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                  Switch this off to retire a brand without deleting it or its history.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : brand ? 'Save changes' : 'Add brand'}
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
