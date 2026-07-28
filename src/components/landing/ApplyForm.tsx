import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import {
  NICHES,
  WORKED_WITH_WURX,
  applicationSchema,
  emptyApplication,
  type ApplicationInput,
} from '@/lib/schemas/application';

type Errors = Partial<Record<keyof ApplicationInput, string>>;

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Creator application form.
 *
 * FRONT END ONLY. Nothing is persisted yet — the Supabase table, the Edge
 * Function and the RLS policies are roadmap Step 3. Validation is real and uses
 * the same Zod schema the server will use, so wiring it up later is a matter of
 * replacing the submit handler.
 *
 * Until it is wired, the success state says so rather than pretending an
 * application was received.
 */
export function ApplyForm() {
  const [values, setValues] = useState<ApplicationInput>(emptyApplication);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Only re-validate live once the user has tried to submit — nagging before
    // that is hostile.
    if (submitted) setErrors(validate({ ...values, [key]: value }));
  };

  function validate(input: ApplicationInput): Errors {
    const result = applicationSchema.safeParse(input);
    if (result.success) return {};
    const next: Errors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof ApplicationInput | undefined;
      if (key && !next[key]) next[key] = issue.message;
    }
    return next;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const next = validate(values);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Move focus to the first problem so keyboard and screen-reader users
      // are not left guessing.
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    setPending(true);
    // TODO(Step 3): POST to the submit-application Edge Function.
    await new Promise((r) => setTimeout(r, 700));
    setPending(false);
    setDone(true);
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="rounded-2xl border border-line bg-surface-1 p-8 text-center shadow-lg"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <Check size={22} aria-hidden />
        </span>
        <h3 className="mt-5 text-xl font-bold">Everything checks out</h3>
        <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-muted">
          The form validated your details correctly.
        </p>
        <p className="mx-auto mt-5 max-w-xs rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-faint">
          <span className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
            Preview
          </span>
          <br />
          Applications are not being stored yet. Connecting this to the database is
          the next step.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="mt-6"
          onClick={() => {
            setValues(emptyApplication);
            setErrors({});
            setSubmitted(false);
            setDone(false);
          }}
        >
          Fill it in again
        </Button>
      </motion.div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-line bg-surface-1 p-6 shadow-lg sm:p-7"
    >
      <div className="flex items-center gap-4">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.16em] text-muted uppercase">
          Apply to join
        </h2>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>

      <div className="mt-6 space-y-5">
        <Field label="TikTok handle" error={errors.tiktokHandle}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="tiktokHandle"
              placeholder="@yourhandle"
              autoComplete="off"
              spellCheck={false}
              value={values.tiktokHandle}
              onChange={(e) => set('tiktokHandle', e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <Field label="Email" error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              inputMode="email"
              placeholder="you@email.com"
              autoComplete="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        <Field label="Niche" error={errors.niche}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="niche"
              value={values.niche}
              onChange={(e) => set('niche', e.target.value as ApplicationInput['niche'])}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="" disabled>
                Select your niche
              </option>
              {NICHES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <AnimatePresence initial={false}>
          {values.niche === 'Other' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="pt-1">
                <Field label="Which niche?" error={errors.nicheOther}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      name="nicheOther"
                      placeholder="Tell us in a few words"
                      value={values.nicheOther ?? ''}
                      onChange={(e) => set('nicheOther', e.target.value)}
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  )}
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Field label="Worked with a Wurx brand before?" error={errors.workedWithWurx}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="workedWithWurx"
              value={values.workedWithWurx}
              onChange={(e) =>
                set('workedWithWurx', e.target.value as ApplicationInput['workedWithWurx'])
              }
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="" disabled>
                Select an answer
              </option>
              {WORKED_WITH_WURX.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Your best 1–3 videos (links)"
          error={errors.videoLinks}
          hint="One per line. TikTok links are best."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="videoLinks"
              placeholder="Paste links..."
              value={values.videoLinks}
              onChange={(e) => set('videoLinks', e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="group mt-7 w-full">
        {pending ? (
          'Checking your details…'
        ) : (
          <>
            Apply — takes 60 seconds
            <ArrowRight
              size={17}
              className="transition-transform duration-200 ease-brand group-hover:translate-x-0.5"
              aria-hidden
            />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-[13px] text-faint">
        Free to join. No follower minimum.
      </p>
    </form>
  );
}
