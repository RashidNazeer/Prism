import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { BrandLookField } from '@/components/admin/BrandLookField';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import type { Brand } from '@/lib/admin/useBrands';
import {
  brandAboutSchema,
  collectFieldErrors,
  type BrandAboutInput,
} from '@/lib/schemas/brand';
import { canonicalBrandTheme, readBrandThemeConfig } from '@/lib/brand-theme';

/**
 * Step one of a hub: the introduction a creator meets first.
 *
 * A short intro, the founder, and the brand's accent colour. This is the only
 * part of the hub written FOR creators rather than for us, which is why the
 * budget and the client are nowhere near it: they are on Overview, in a
 * different table, behind a different gate.
 *
 * Products used to sit underneath. They have their own tab now, in the order a
 * creator meets them.
 *
 * Laid out as cards that sit side by side on a wide screen and stack on a phone,
 * with one Save at the bottom, so a brand manager is never hunting for it.
 */
export function BrandAbout({ brand }: { brand: Brand }) {
  const [values, setValues] = useState<BrandAboutInput>({
    logoUrl: brand.logo_url ?? '',
    tagline: brand.tagline ?? '',
    description: brand.description ?? '',
    brandColor: brand.brand_color ?? '',
    heroUrl: brand.hero_url ?? '',
    founderName: brand.founder_name ?? '',
    founderRole: brand.founder_role ?? '',
    founderNote: brand.founder_note ?? '',
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
        founderName: parsed.founderName || null,
        founderRole: parsed.founderRole || null,
        founderNote: parsed.founderNote || null,
        // Canonical on the way out: no default angles, no 'auto' tones, no
        // empty areas, one spelling per hex. One look, one row.
        theme: canonicalBrandTheme(parsed.theme),
      },
      { onSuccess: () => setSaved(true) }
    );
  };

  const card = 'wx-neo-raised grid content-start gap-5 rounded-xl p-5';
  const heading = 'text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase';

  return (
    <form onSubmit={submit} noValidate className="mt-5 grid gap-5">
      <FormError>{save.error ? (save.error as Error).message : ''}</FormError>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="grid gap-5">
          <section className={card}>
            <h2 className={heading}>Introduction</h2>

            <ImageUploadField
              label="Brand logo"
              hint="512 x 512 px, square, transparent PNG. It is shown as a small rounded square, so use the icon or monogram rather than a wordmark."
              folder={`brands/${brand.id}`}
              value={values.logoUrl || null}
              disabled={busy}
              shape="round"
              onChange={(url) => set('logoUrl', url ?? '')}
            />

            <Field
              label="Tagline"
              error={errors.tagline}
              hint="One line under the name. Optional."
            >
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
              label="Short intro"
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
          </section>

          <section className={card}>
            <h2 className={heading}>Founder</h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" error={errors.founderName} hint="Optional.">
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="founderName"
                    maxLength={120}
                    placeholder="e.g. Dana Whitfield"
                    value={values.founderName}
                    disabled={busy}
                    onChange={(e) => set('founderName', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
              <Field label="Role" error={errors.founderRole} hint="Optional.">
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="founderRole"
                    maxLength={120}
                    placeholder="e.g. Founder and CEO"
                    value={values.founderRole}
                    disabled={busy}
                    onChange={(e) => set('founderRole', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
            </div>

            <Field
              label="A note from them"
              error={errors.founderNote}
              hint="A few sentences in their own voice. Optional."
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name="founderNote"
                  maxLength={1000}
                  rows={4}
                  placeholder="e.g. We started this after years of watching creators get left out of the numbers."
                  value={values.founderNote}
                  disabled={busy}
                  onChange={(e) => set('founderNote', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </section>
        </div>

        <section className={card}>
          <h2 className={heading}>Look and colour</h2>

          {/*
            THE LOOK OF THE WHOLE HUB.

            A hub is a PRISM screen wearing the brand's accent, so this is a base
            colour plus the areas the brand may colour by hand. Everything not
            customised is still derived from the one.

            There is no combination here to get wrong: nothing on this form is a
            TEXT colour. Every one of those is computed against whatever was
            picked, in src/lib/brand-theme.ts.
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
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} className="min-h-[44px] sm:min-h-0">
          {busy ? 'Saving...' : 'Save introduction'}
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
  );
}
