import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Check, Monitor, Moon, Sun, Type } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataError } from '@/components/ui/DataState';
import { Field, Input } from '@/components/ui/Field';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication } from '@/lib/auth/useApplication';
import { ROLE_LABEL, TIER_LABEL } from '@/lib/tiers';
import { UI_SCALES, useUiScale } from '@/lib/ui-scale';
import { useTheme, type ThemeMode } from '@/components/theme/theme-context';
import { TikTokConnection } from '@/components/creator/TikTokConnection';
import { cn } from '@/lib/utils';

// Moved to src/lib/tiers.ts on 2026-08-11, because the admin creator screens
// print the same words and two copies of a label is how they drift.

/** Blank is allowed (it clears the name); anything else is trimmed and capped. */
const displayNameSchema = z.string().trim().max(60, 'Keep your name under 60 characters');

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * The creator's own account: identity and settings, nothing heavier.
 *
 * STILL ITS OWN PAGE AND ITS OWN TAB. §11 of the redesign brief moves profile
 * into the avatar menu; Rashid overruled that on 2026-10-16 — "keep all the
 * current tabs please" — so the route and the nav item stay exactly where they
 * were and only the page itself is redrawn. The avatar menu the lead is adding
 * to the shell can point at this page; nothing here depends on it.
 *
 * TWO BLURRED PANELS, AND NO MORE. It was four `wx-neo-raised` cards, which is
 * four `backdrop-filter`s against a budget of three. Now the TikTok card is one
 * panel and everything else is one panel of small tiles — the same glass
 * material with the blur left off, which is what §2's layering rule asks for.
 *
 * THE TIKTOK CONNECTION LEADS, and it is the one thing on this page that
 * changes what the rest of the product can say. Views, likes, comments and
 * shares all read "Not reported" until it is connected, so the state of it is
 * stated in words at the top of the page rather than inferred from a button.
 *
 * Display name is the ONLY profile field editable here, and that is a database
 * decision rather than a UI one: `display_name` is the single column granted to
 * `authenticated` on this table. Role, tier and email are not editable by the
 * person they belong to, and the escalation guard would refuse anyway.
 *
 * Text size and theme are HERE as well as in the top bar, by instruction. They
 * are the same two mechanisms, not copies: `useUiScale` is a module-level
 * subscription shared with the header control, and the theme comes from the one
 * provider, so a change made in either place shows in both at once.
 */
export function Profile() {
  const { user } = useAuth();
  const profileQuery = useProfile();
  const { data: profile, isLoading } = profileQuery;
  const applicationQuery = useApplication();
  const { data: application } = applicationQuery;
  const queryClient = useQueryClient();

  /*
   * null means "not touched", so the field shows whatever the profile says. A
   * background refetch can therefore never overwrite what somebody is in the
   * middle of typing, and there is no effect copying server state into state.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const name = draft ?? profile?.display_name ?? '';

  const save = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ display_name: next || null })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    save.mutate(parsed.data);
  };

  if (isLoading) {
    return (
      <div className="grid items-start gap-4 lg:grid-cols-2" aria-busy="true">
        <div className="wx-skeleton h-72 rounded-2xl" />
        <div className="wx-skeleton h-72 rounded-2xl" />
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <DataError
        title="We could not load your profile"
        body="Something went wrong on our side, not yours. Nothing you saved is lost."
        onRetry={() => profileQuery.refetch()}
      />
    );
  }

  const unchanged = name.trim() === (profile.display_name ?? '');

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {/* THEIR OWN TIKTOK, first. It is the one thing here a creator has a
          reason to come back to, and the one thing that changes what every
          other screen is able to say. */}
      <div className="min-w-0">
        <TikTokConnection />
      </div>

      {/* ------------------------------------------- everything else, once -- */}
      <section
        aria-label="Your account and settings"
        className="wx-neo-raised min-w-0 rounded-2xl p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* ------------------------------------------------------- name -- */}
          <Tile
            title="Display name"
            note="What the Wurx team and your brand hubs call you. Leave it blank to clear it."
            className="sm:col-span-2"
          >
            <form onSubmit={onSubmit} noValidate>
              <Field
                label="Your name"
                error={fieldError ?? (save.error ? (save.error as Error).message : undefined)}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="displayName"
                    autoComplete="name"
                    maxLength={60}
                    placeholder="Your name"
                    value={name}
                    disabled={save.isPending}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setFieldError(undefined);
                    }}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <div className="mt-3 flex items-center gap-3">
                <Button type="submit" size="sm" disabled={save.isPending || unchanged}>
                  {save.isPending ? 'Saving...' : 'Save'}
                </Button>
                {saved ? (
                  <span
                    role="status"
                    className="text-success inline-flex items-center gap-1.5 text-[0.8125rem]"
                  >
                    <Check size={15} aria-hidden />
                    Saved
                  </span>
                ) : null}
              </div>
            </form>
          </Tile>

          {/* ------------------------------------------------- text size -- */}
          <Tile title="Text size" note="Moves the type, the spacing and the charts together.">
            <TextSizeChoice />
          </Tile>

          {/* ----------------------------------------------------- theme -- */}
          <Tile title="Theme" note="System follows whatever your phone or laptop is set to.">
            <ThemeChoice />
          </Tile>

          {/* --------------------------------------------------- account -- */}
          <Tile title="Account">
            <dl className="grid gap-2.5">
              <Row label="Email" value={profile.email} breakAll />
              <Row label="Status" value={ROLE_LABEL[profile.role]} />
              <Row
                label="Tier"
                value={profile.tier ? TIER_LABEL[profile.tier] : 'Not assigned yet'}
              />
              <Row label="Joined" value={longDate(profile.created_at)} />
            </dl>
          </Tile>

          {/* ----------------------------------------------- application -- */}
          {applicationQuery.isError ? (
            <Tile title="Your application">
              <p className="text-danger text-[0.8125rem] leading-relaxed" role="alert">
                We could not load your application.{' '}
                <button
                  type="button"
                  onClick={() => void applicationQuery.refetch()}
                  className="text-accent min-h-11 font-semibold underline"
                >
                  Try again
                </button>
              </p>
            </Tile>
          ) : application ? (
            <Tile
              title="Your application"
              note="Something wrong here? Tell the team and they will correct it. It cannot be edited once an application has been reviewed."
            >
              <dl className="grid gap-2.5">
                <Row label="TikTok handle" value={`@${application.tiktok_handle}`} breakAll />
                <Row
                  label="Niche"
                  value={
                    application.niche === 'Other'
                      ? (application.niche_other ?? 'Other')
                      : application.niche
                  }
                />
                <Row
                  label="Worked with the team before"
                  value={application.worked_with_wurx ? 'Yes' : 'No'}
                />
                <Row label="Applied" value={longDate(application.created_at)} />
              </dl>
            </Tile>
          ) : applicationQuery.isLoading ? (
            <div className="wx-skeleton h-44 rounded-xl" />
          ) : null}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ parts -- */

/**
 * A widget inside the one blurred panel.
 *
 * `wx-neo-raised-sm` is the same glass as the panel with the blur left off, per
 * §2's layering rule: one blurred surface per section, plain translucent fills
 * inside it.
 */
function Tile({
  title,
  note,
  className,
  children,
}: {
  title: string;
  note?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('wx-neo-raised-sm min-w-0 rounded-xl p-4', className)}>
      <h2 className="text-[0.9375rem] leading-snug font-bold">{title}</h2>
      {note ? <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">{note}</p> : null}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function Row({ label, value, breakAll }: { label: string; value: string; breakAll?: boolean }) {
  return (
    <div className="wx-neo-inset flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2.5">
      <dt className="text-faint font-mono text-[0.625rem] tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className={cn('text-[0.875rem] font-medium', breakAll && 'break-all')}>{value}</dd>
    </div>
  );
}

/**
 * The same four steps the header control offers, and the same mechanism.
 *
 * `useUiScale` is a module-level subscription, so this control and the one in
 * the top bar can never disagree about what is selected: whichever is used, both
 * re-render with the new value.
 */
function TextSizeChoice() {
  const [scale, setScale] = useUiScale();

  return (
    <div
      role="radiogroup"
      aria-label="Text size"
      /*
        TWO BY TWO, NOT A ROW THAT WRAPS. Rashid, of this control on
        /app/profile: the four options rendered as "Compact / Snug / Default"
        with "Large" orphaned on a second line.

        It was `flex flex-wrap` with `flex-1` children, which only fits four
        labels on one line once the tile is about 300px wide. Measured against
        the real stylesheet at container widths 200, 215, 240, 275, 300 and
        340: two rows below 300, and the break lands 3 + 1 because the
        leftover is sized by the content rather than the grid -- which is
        exactly the orphan he saw. This tile is roughly 240-275px on a desktop
        (`lg:grid-cols-2` page, then `sm:grid-cols-2` inside the panel, then
        `p-4`), so it was always wrapping and always wrapping unevenly.

        A FOUR-ACROSS ROW IS NOT AVAILABLE at that width: equal quarters of
        250px are 58px each and "Compact" alone needs ~56px before its
        padding, so a single row could only be had by truncating a label.
        `sm:grid-cols-4` would not help either -- `sm:` asks the VIEWPORT, and
        the viewport is wide here precisely when the tile is narrow.

        So it is an even 2x2 grid: four equal cells, the same shape in both
        themes, at every width, and nothing can be orphaned because the grid
        decides the break rather than the text. `wx-tap-row` still gives every
        cell a 44px floor below `sm`.
      */
      className="wx-neo-inset wx-tap-row grid grid-cols-2 items-center gap-1 rounded-lg p-1"
    >
      {UI_SCALES.map((s) => {
        const active = s.value === scale;
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setScale(s.value)}
            className={cn(
              'ease-brand flex min-h-8 min-w-0 items-center justify-center gap-1.5 rounded-sm px-2 text-[0.8125rem] font-medium transition-colors duration-200',
              active
                ? '[background-color:var(--wx-accent-fill)] [color:var(--wx-on-accent-fill)]'
                : 'text-muted hover:text-accent'
            )}
          >
            {active ? <Type size={13} aria-hidden className="shrink-0" /> : null}
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const THEMES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * Three states, said as three words.
 *
 * The top bar cycles through them with one button, which is right for a piece
 * of chrome and wrong here: a settings page should show what the options ARE,
 * and "system" is not discoverable by pressing a sun until it turns into a
 * monitor.
 */
function ThemeChoice() {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="wx-neo-inset wx-tap-row flex flex-wrap items-center gap-1 rounded-lg p-1"
    >
      {THEMES.map(({ value, label, icon: Icon }) => {
        const active = value === mode;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(value)}
            className={cn(
              'ease-brand flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-sm px-2.5 text-[0.8125rem] font-medium transition-colors duration-200',
              active
                ? '[background-color:var(--wx-accent-fill)] [color:var(--wx-on-accent-fill)]'
                : 'text-muted hover:text-accent'
            )}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
