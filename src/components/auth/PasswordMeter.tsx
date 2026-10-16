import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  passwordStrength,
  requirementsFor,
  type PasswordStrength,
} from '@/lib/schemas/password-rules';

/**
 * THE STRENGTH METER AND THE REQUIREMENT LIST, under a password box.
 *
 * Two reviewers asked for this on the signup form. It is one component because
 * the two halves answer the same question — "is what I have typed going to be
 * accepted, and is it any good?" — and splitting them put the answer in two
 * places on the screen.
 *
 * ═══ THE SCORE IS COMPUTED IN THIS BROWSER AND NOWHERE ELSE ═══
 *
 * `passwordStrength` is a few regexes in `src/lib/schemas/password-rules.ts`.
 * Nothing here fetches, logs or hashes. The password reaches exactly one place
 * in this product: the auth call the form already made.
 *
 * ═══ WHAT IS ADVICE AND WHAT IS A RULE ═══
 *
 * The BAR is advice and says so ("Strength"). The TICK LIST is the rules, and
 * every line in it is a thing the Zod schema will refuse — so a person reading
 * it can see exactly why the button will not take their password, instead of
 * pressing it and being told afterwards.
 *
 * ═══ NO BLUR, NO MOTION COMPONENT ═══
 *
 * It sits inside the form's own `wx-neo-raised` panel, so the list wears
 * `wx-neo-raised-sm` — the same material with no second blur. The bar grows
 * with a CSS width transition rather than a `motion` component: §Motion allows
 * opacity and translateY only, and a width is neither, so animating it through
 * `m.div` would be dressing up a transition as something it is not.
 * `motion-reduce:transition-none` honours the OS setting.
 */

/* Four segments, filled left to right. Chosen over one continuous bar because
   a segmented meter reads as a scale of four even before the label is read,
   and because an empty segment is a visible "there is more available here". */
const SEGMENTS = [1, 2, 3, 4] as const;

const BAR_FOR_SCORE: Record<PasswordStrength['score'], string> = {
  0: 'bg-danger',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-success',
  4: 'bg-success',
};

const TEXT_FOR_SCORE: Record<PasswordStrength['score'], string> = {
  0: 'text-danger',
  1: 'text-danger',
  2: 'text-warning',
  3: 'text-success',
  4: 'text-success',
};

export function PasswordMeter({
  value,
  confirm,
  /** Hidden until there is something to say, so an untouched form stays calm. */
  className,
}: {
  value: string;
  /** Pass the confirm box's value to get the "both entries match" rule. */
  confirm?: string;
  className?: string;
}) {
  const strength = passwordStrength(value);
  const rules = requirementsFor(value, confirm);
  const typed = value.length > 0;

  return (
    <div className={cn('mt-3', className)}>
      {/* ── STRENGTH, ADVISORY ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2" aria-hidden>
        <div className="flex min-w-0 flex-1 gap-1">
          {SEGMENTS.map((seg) => (
            <span
              key={seg}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none',
                typed && strength.score >= seg ? BAR_FOR_SCORE[strength.score] : 'bg-line'
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            'font-mono text-[0.625rem] font-medium tracking-[0.12em] uppercase',
            typed ? TEXT_FOR_SCORE[strength.score] : 'text-faint'
          )}
        >
          {typed ? strength.label : 'Strength'}
        </span>
      </div>

      {/*
        ONE POLITE SENTENCE, AND IT IS A LIVE REGION.
        `aria-live="polite"` rather than `role="alert"`: this is a suggestion
        that changes on nearly every keystroke, and an assertive region would
        interrupt a screen reader mid-word while somebody is still typing.
      */}
      <p aria-live="polite" className="text-faint mt-1.5 min-h-[1.125rem] text-[0.75rem]">
        {typed && strength.advice ? strength.advice : ''}
      </p>

      {/* ── THE RULES, WHICH ARE NOT ADVISORY ───────────────────────────── */}
      <ul className="wx-neo-raised-sm mt-1 space-y-1.5 rounded-xl p-3">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-start gap-2 text-[0.75rem] leading-relaxed">
            <span
              className={cn(
                'mt-px grid size-4 shrink-0 place-items-center rounded-full',
                rule.met ? 'bg-success text-on-accent' : 'bg-surface-2 text-faint'
              )}
            >
              {rule.met ? (
                <Check size={10} strokeWidth={3} aria-hidden />
              ) : (
                <Minus size={10} strokeWidth={3} aria-hidden />
              )}
            </span>
            <span className={rule.met ? 'text-muted' : 'text-faint'}>
              {rule.label}
              {/* The state in words as well as in colour: a tick that is only
                  green is invisible to anyone who cannot see green. */}
              <span className="sr-only">{rule.met ? ' — done' : ' — not yet'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
