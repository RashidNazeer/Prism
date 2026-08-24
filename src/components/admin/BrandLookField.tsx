import { useMemo } from 'react';
import { Field, Input } from '@/components/ui/Field';
import { deriveBrandTheme, DEFAULT_BRAND_COLOR, auditBrandTheme } from '@/lib/brand-theme';

/**
 * The one control that decides what a brand's world looks like.
 *
 * WHY THERE IS ONLY ONE. Every other colour in this product lives in
 * `tokens.css` and is guarded by `pnpm check:contrast`, which fails the build
 * if any pair drops below WCAG AA. A colour picked here lives in a database row
 * and that guard cannot see it. Handing an admin five pickers would hand them
 * five ways to ship a hub creators cannot read, with nothing failing anywhere.
 *
 * So the admin picks a colour and the product does the rest: the rail, the
 * hero, the page, the cards and every text colour are derived, and the text is
 * chosen by MEASURING contrast against whatever the background turned out to
 * be. There is no combination to get wrong, which is why this field has no
 * error state for readability, only for "that is not a colour".
 *
 * THE SWATCHES ARE THE REAL THING, not decoration. They are the actual derived
 * values, in both modes, so an admin can see before saving that the rail is
 * dark enough and the accent is theirs. Rashid tests in a browser, and a
 * preview he can trust is worth more than a paragraph promising it works.
 */
export function BrandLookField({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : DEFAULT_BRAND_COLOR;
  const theme = useMemo(() => deriveBrandTheme(hex), [hex]);

  /*
   * Belt and braces. The derivation guarantees this is empty for every input,
   * and `scripts/check-brand-theme.mjs` proves it over 88 colours inside the
   * build. If it is ever NOT empty, an admin should be the second to know, not
   * the last, so it is surfaced rather than trusted.
   */
  const problems = useMemo(() => auditBrandTheme(hex), [hex]);

  return (
    <Field
      label="Brand colour"
      error={error}
      hint="One colour. The whole hub is built from it, and every text colour is worked out to stay readable, in dark and light. Leave it empty for the Wurx gold."
    >
      {({ id, describedBy, invalid }) => (
        <div className="grid gap-3">
          <div className="flex items-center gap-2.5">
            {/*
              A NATIVE COLOUR INPUT AND A TEXT BOX, both bound to the same
              value. The picker is how somebody chooses; the text box is how
              somebody pastes the hex a client sent them, which is what actually
              happens.
            */}
            <input
              type="color"
              aria-label="Pick the brand colour"
              value={hex}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              className="border-line h-[2.75rem] w-[3.25rem] shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
            <Input
              id={id}
              name="brandColor"
              value={value}
              disabled={disabled}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              placeholder={DEFAULT_BRAND_COLOR}
              spellCheck={false}
              onChange={(e) => onChange(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Preview title="Light" p={theme.light} />
            <Preview title="Dark" p={theme.dark} />
          </div>

          {problems.length ? (
            <p className="text-danger text-[0.75rem]">
              {problems.length} derived pair(s) fall short of AA. That should be impossible;
              report it rather than working around it.
            </p>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** A miniature of the creator's world: rail, hero, a card, a button. */
function Preview({
  title,
  p,
}: {
  title: string;
  p: ReturnType<typeof deriveBrandTheme>['light'];
}) {
  return (
    <div className="border-line overflow-hidden rounded-xl border">
      <div
        className="text-[0.5625rem] font-bold tracking-[0.12em] uppercase"
        style={{ background: p.surface2, color: p.muted, padding: '0.375rem 0.625rem' }}
      >
        {title}
      </div>
      <div className="flex h-[7.5rem]" style={{ background: p.page }}>
        <div className="w-[28%] shrink-0 p-2" style={{ background: p.rail }}>
          <div
            className="h-2 w-3/4 rounded-full"
            style={{ background: p.railText, opacity: 0.85 }}
          />
          <div
            className="mt-2 h-4 rounded"
            style={{ background: p.railActive }}
            aria-hidden
          />
          <div className="mt-1.5 h-1.5 w-2/3 rounded-full" style={{ background: p.railMuted }} />
          <div className="mt-1.5 h-1.5 w-1/2 rounded-full" style={{ background: p.railMuted }} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="flex h-[42%] items-center px-2.5"
            style={{
              background: `linear-gradient(115deg, ${p.heroFrom}, ${p.heroTo})`,
            }}
          >
            <span className="text-[0.625rem] font-bold" style={{ color: p.heroText }}>
              Create with…
            </span>
          </div>
          <div className="flex items-center gap-2 p-2.5">
            <div
              className="flex-1 rounded-md p-2"
              style={{ background: p.surface, border: `1px solid ${p.line}` }}
            >
              <div className="h-1.5 w-1/2 rounded-full" style={{ background: p.muted }} />
              <div
                className="mt-1.5 h-2.5 w-3/4 rounded"
                style={{ background: p.accentInk }}
              />
            </div>
            <span
              className="rounded-md px-2 py-1 text-[0.5625rem] font-bold"
              style={{ background: p.accent, color: p.accentText }}
            >
              Apply
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
