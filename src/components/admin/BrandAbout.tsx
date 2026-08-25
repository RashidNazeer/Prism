import { useState } from 'react';
import { Check, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { BrandLookField } from '@/components/admin/BrandLookField';
import { ProductDialog } from '@/components/admin/ProductDialog';
import { cn } from '@/lib/utils';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import {
  money,
  percent,
  useProducts,
  type Brand,
  type BrandProduct,
} from '@/lib/admin/useBrands';
import {
  brandAboutSchema,
  collectFieldErrors,
  type BrandAboutInput,
} from '@/lib/schemas/brand';
import { canonicalBrandTheme, readBrandThemeConfig } from '@/lib/brand-theme';

/**
 * The About tab: who this brand is, and what it sells.
 *
 * This is the only part of the hub written FOR creators rather than for us.
 * Everything on this tab is what somebody reads before deciding whether they
 * want to work with the brand at all, which is why the budget and the client
 * are nowhere near it: they are on Overview, in a different table, behind a
 * different gate.
 *
 * Products sit underneath rather than on their own tab. Adding a product is its
 * own job with its own dialog, but it is still part of describing the brand,
 * and a tab per section would leave two half-empty screens instead of one full
 * one.
 */
export function BrandAbout({ brand }: { brand: Brand }) {
  return (
    <div className="mt-5 grid max-w-4xl gap-8">
      <Story brand={brand} />
      <Products brandId={brand.id} brandName={brand.name} />
    </div>
  );
}

/* --------------------------------------------------------------- story --- */

function Story({ brand }: { brand: Brand }) {
  const [values, setValues] = useState<BrandAboutInput>({
    logoUrl: brand.logo_url ?? '',
    tagline: brand.tagline ?? '',
    description: brand.description ?? '',
    brandColor: brand.brand_color ?? '',
    heroUrl: brand.hero_url ?? '',
    /*
     * READ THROUGH THE READER, never straight off the row. `theme` is jsonb, so
     * what arrives is whatever is stored, including a row written before a rule
     * existed or by a migration written later. Anything unrecognised degrades
     * to no custom areas rather than being loaded into the form and saved
     * straight back out again.
     */
    theme: readBrandThemeConfig(brand.theme),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useManageBrand();
  const busy = save.isPending;

  const set = <K extends keyof BrandAboutInput>(key: K, value: BrandAboutInput[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    setSaved(false);
    if (submitted) setErrors(collectFieldErrors(brandAboutSchema, next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const next = collectFieldErrors(brandAboutSchema, values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const parsed = brandAboutSchema.parse(values);
    save.mutate(
      {
        action: 'brand.about',
        brandId: brand.id,
        logoUrl: parsed.logoUrl,
        tagline: parsed.tagline || null,
        description: parsed.description || null,
        brandColor: parsed.brandColor,
        heroUrl: parsed.heroUrl,
        // Canonical on the way out: no default angles, no 'auto' tones, no
        // empty areas, one spelling per hex. One look, one row.
        theme: canonicalBrandTheme(parsed.theme),
      },
      { onSuccess: () => setSaved(true) }
    );
  };

  return (
    <section>
      <p className="text-muted text-[0.875rem] leading-relaxed">
        How this brand introduces itself in the creator hub.
      </p>

      <form onSubmit={submit} noValidate className="mt-4 grid gap-5">
        <FormError>{save.error ? (save.error as Error).message : ''}</FormError>

        <ImageUploadField
          label="Brand logo"
          hint="512 x 512 px, square, transparent PNG. It is shown as a 28px rounded square, so use the icon or monogram rather than a wordmark."
          folder={`brands/${brand.id}`}
          value={values.logoUrl || null}
          disabled={busy}
          shape="round"
          onChange={(url) => set('logoUrl', url ?? '')}
        />

        {/*
          THE LOOK OF THE WHOLE HUB.

          Rashid asked for a creator to land in "a new world" that is the
          brand's rather than Wurx's, and on 2026-08-25 for that world to be as
          customisable as brands actually are: "some brands have multo color
          themes". So this is a base colour plus four areas, up to four colours
          each, and everything not customised is still derived from the one.

          There is still no combination here to get wrong, and loosening it did
          not change that: nothing on this form is a TEXT colour. Every one of
          those is computed against whatever was picked.
        */}
        <BrandLookField
          value={values.brandColor}
          theme={values.theme}
          error={errors.brandColor || errors.theme}
          disabled={busy}
          onChange={(hex) => set('brandColor', hex)}
          onThemeChange={(next) => set('theme', next)}
        />

        <ImageUploadField
          label="Hero image"
          hint="2400 x 1000 px works best (2.4:1). Keep the product RIGHT of centre and within the middle 60% top to bottom, because the edges are trimmed on different screens. No text or logos in the image: we write the brand name over it. Optional. Up to 2 MB."
          folder={`brands/${brand.id}`}
          value={values.heroUrl || null}
          disabled={busy}
          onChange={(url) => set('heroUrl', url ?? '')}
        />

        <Field label="Tagline" error={errors.tagline} hint="One line under the name. Optional.">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="tagline"
              maxLength={160}
              placeholder="e.g. Pain Relief & Recovery"
              value={values.tagline}
              disabled={busy}
              onChange={(e) => set('tagline', e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <Field
          label="About the brand"
          error={errors.description}
          hint="What creators should know before they decide. Optional."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="description"
              maxLength={4000}
              rows={5}
              placeholder="e.g. The number one best selling joint and muscle recovery cream, trusted by two million people."
              value={values.description}
              disabled={busy}
              onChange={(e) => set('description', e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Save details'}
          </Button>
          {saved && !busy ? (
            <span
              role="status"
              className="text-success inline-flex items-center gap-1.5 text-[0.8125rem] font-medium"
            >
              <Check size={15} aria-hidden />
              Saved
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------ products --- */

function Products({ brandId, brandName }: { brandId: string; brandName: string }) {
  const { data: products, isLoading } = useProducts(brandId);
  const [dialog, setDialog] = useState<{ product?: BrandProduct } | null>(null);

  const rows = products ?? [];

  return (
    <section className="border-line border-t pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Products</h2>
          <p className="text-muted mt-1 text-[0.875rem] leading-relaxed">
            What the brand sells, and the commission we offer on each one.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({})} className="shrink-0">
          <Plus size={15} aria-hidden />
          Add product
        </Button>
      </div>

      {isLoading ? (
        <ul className="mt-4 grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-20 rounded-xl" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="border-line bg-surface-1 mt-4 rounded-xl border px-6 py-12 text-center shadow-md">
          <Package size={24} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">No products yet</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            Creators see these when they open the hub, with the commission on each.
          </p>
          <Button className="mt-6" onClick={() => setDialog({})}>
            <Plus size={16} aria-hidden />
            Add the first product
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((product) => (
            <li key={product.id}>
              <ProductRow product={product} onEdit={() => setDialog({ product })} />
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <ProductDialog
          brandId={brandId}
          brandName={brandName}
          {...(dialog.product ? { product: dialog.product } : {})}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </section>
  );
}

function ProductRow({ product, onEdit }: { product: BrandProduct; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const manage = useManageBrand();

  const rate = percent(product.commission_rate);

  return (
    <div
      className={cn(
        'bg-surface-1 rounded-xl border p-4',
        product.is_active ? 'border-line' : 'border-line border-dashed'
      )}
    >
      {/* Stacks on a phone, one row from small up. Nothing here is allowed to
          push the page sideways. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="border-line bg-surface-2 grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border">
          {product.image_url ? (
            <img src={product.image_url} alt="" className="size-full object-cover" />
          ) : (
            <Package size={18} aria-hidden className="text-faint" />
          )}
        </span>

        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-words">{product.name}</p>
            {product.badge_title ? (
              <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
                {product.badge_title}
              </span>
            ) : null}
            {!product.is_active ? (
              <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
                Hidden
              </span>
            ) : null}
          </div>
          <p className="text-faint mt-1 font-mono text-[0.6875rem] break-all">
            {product.external_product_id}
          </p>
        </div>

        <div className="flex items-center gap-5">
          <span>
            <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Price
            </span>
            <span className="wx-numeric mt-0.5 block text-[0.9375rem] font-semibold">
              {money(product.price, product.currency)}
            </span>
          </span>
          <span>
            <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Commission
            </span>
            <span className="wx-numeric text-accent mt-0.5 block text-[0.9375rem] font-bold">
              {rate || 'Not set'}
            </span>
          </span>
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${product.name}`}
            className="text-muted hover:bg-surface-2 hover:text-accent grid size-9 place-items-center rounded-lg transition-colors duration-200"
          >
            <Pencil size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${product.name}`}
            className="text-muted hover:bg-surface-2 hover:text-danger grid size-9 place-items-center rounded-lg transition-colors duration-200"
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
      </div>

      {confirming ? (
        <div className="border-danger/40 bg-danger-soft mt-4 rounded-xl border p-4">
          <p className="text-danger text-[0.8125rem] leading-relaxed font-medium">
            Delete {product.name}? It goes for good, though the audit log keeps a record of what
            it was.
          </p>
          {manage.error ? (
            <p role="alert" className="text-danger mt-2 text-[0.75rem]">
              {(manage.error as Error).message}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={manage.isPending}
              onClick={() => manage.mutate({ action: 'product.delete', productId: product.id })}
            >
              {manage.isPending ? 'Deleting...' : 'Yes, delete'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={manage.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
