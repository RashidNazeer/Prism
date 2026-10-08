import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import {
  collectFieldErrors,
  CURRENCIES,
  productSchema,
  type ProductInput,
} from '@/lib/schemas/brand';
import type { BrandProduct } from '@/lib/admin/useBrands';

/**
 * Add or edit one product.
 *
 * The commission is the number a creator actually reads, so it sits with the
 * price rather than being buried under the identifiers. Everything except the
 * name and the TikTok Shop product id is optional: products get added before
 * their numbers are confirmed, and an empty field is honest where a zero is
 * not.
 */
export function ProductDialog({
  brandId,
  brandName,
  product,
  onClose,
}: {
  brandId: string;
  brandName: string;
  /** Absent means create. */
  product?: BrandProduct;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'input' });

  const [values, setValues] = useState<ProductInput>({
    name: product?.name ?? '',
    externalProductId: product?.external_product_id ?? '',
    imageUrl: product?.image_url ?? '',
    // Coerced to strings: these back text inputs, and PostgREST hands `numeric`
    // back as a JSON number. Null stays empty rather than becoming "null".
    price: product?.price != null ? String(product.price) : '',
    currency: (product?.currency ?? 'USD') as ProductInput['currency'],
    commissionRate: product?.commission_rate != null ? String(product.commission_rate) : '',
    badgeTitle: product?.badge_title ?? '',
    isActive: product?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const save = useManageBrand();
  const busy = save.isPending;

  // Once they have tried to submit, re-check on every keystroke, so a corrected
  // field clears its error instead of staying red.
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(collectFieldErrors(productSchema, next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const next = collectFieldErrors(productSchema, values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const parsed = productSchema.parse(values);
    save.mutate(
      {
        action: 'product.save',
        productId: product?.id ?? null,
        brandId,
        name: parsed.name,
        externalProductId: parsed.externalProductId,
        imageUrl: parsed.imageUrl,
        price: parsed.price,
        currency: parsed.currency,
        commissionRate: parsed.commissionRate,
        badgeTitle: parsed.badgeTitle || null,
        isActive: parsed.isActive,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product ? `Edit ${product.name}` : `New product for ${brandName}`}
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
        className="bg-surface-1 relative max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl p-6 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{product ? 'Edit product' : 'Add a product'}</h2>
            <p className="text-muted mt-1 text-[0.875rem] leading-relaxed">
              What {brandName} sells, and what a creator earns on it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-6">
          <FormError>{save.error ? (save.error as Error).message : ''}</FormError>

          <div className="grid gap-5">
            <Field label="Product name" error={errors.name}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="name"
                  placeholder="e.g. Daily Joint & Muscle Care, 2 oz"
                  value={values.name}
                  disabled={busy}
                  onChange={(e) => set('name', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field
              label="TikTok Shop product id"
              error={errors.externalProductId}
              hint="How sales data will be matched to this product. Each one is used once per brand."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="externalProductId"
                  placeholder="e.g. 1729512345678901234"
                  value={values.externalProductId}
                  disabled={busy}
                  onChange={(e) => set('externalProductId', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <ImageUploadField
              label="Product image"
              hint="Optional. PNG, JPG or WebP, up to 2 MB."
              folder={`products/${brandId}`}
              value={values.imageUrl || null}
              disabled={busy}
              onChange={(url) => set('imageUrl', url ?? '')}
            />

            {/* The numbers a creator reads. */}
            <div className="grid gap-5 sm:grid-cols-[1fr_7.5rem]">
              <Field label="Price (optional)" error={errors.price}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="price"
                    inputMode="decimal"
                    // "e.g." on purpose. A bare number in an empty box reads as
                    // a value somebody typed.
                    placeholder="e.g. 16.98"
                    value={values.price ?? ''}
                    disabled={busy}
                    onChange={(e) => set('price', e.target.value)}
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
                    onChange={(e) =>
                      set('currency', e.target.value as ProductInput['currency'])
                    }
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

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Commission (optional)"
                error={errors.commissionRate}
                hint="The percentage a creator earns."
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="commissionRate"
                    inputMode="decimal"
                    placeholder="e.g. 25"
                    value={values.commissionRate ?? ''}
                    disabled={busy}
                    onChange={(e) => set('commissionRate', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field
                label="Badge"
                error={errors.badgeTitle}
                hint="Optional. A short label, like HERO."
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="badgeTitle"
                    maxLength={32}
                    placeholder="e.g. HERO"
                    value={values.badgeTitle}
                    disabled={busy}
                    onChange={(e) => set('badgeTitle', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
            </div>

            <label className="wx-neo-inset flex cursor-pointer items-start gap-3 rounded-xl p-4">
              <input
                type="checkbox"
                name="isActive"
                checked={values.isActive}
                disabled={busy}
                onChange={(e) => set('isActive', e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--wx-accent)]"
              />
              <span>
                <span className="block text-[0.875rem] font-medium">Show to creators</span>
                <span className="text-muted mt-0.5 block text-[0.8125rem] leading-relaxed">
                  Switch this off to keep a product on file without it appearing in the brand
                  hub.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : product ? 'Save changes' : 'Add product'}
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
