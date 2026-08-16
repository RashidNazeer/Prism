import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Loader2, Lock, Trash2 } from 'lucide-react';
import { ContestDeliverables } from '@/components/admin/ContestDeliverables';
import { ContestEntryQueue } from '@/components/admin/ContestEntryQueue';
import { ContestExclusions } from '@/components/admin/ContestExclusions';
import { ContestProducts } from '@/components/admin/ContestProducts';
import { ContestProgressQueue } from '@/components/admin/ContestProgressQueue';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { formatDeadline, instantFromWallClock, wallClockFields } from '@/lib/contest-time';
import { useAuth } from '@/lib/auth/auth-context';
import { useBrand } from '@/lib/admin/useBrands';
import { useContest } from '@/lib/admin/useContests';
import { useManageContest } from '@/lib/admin/useManageContest';

/**
 * The contest setup screen.
 *
 * A FULL SCREEN, not a dialog, ruled 2026-08-13. A contest carries a dozen
 * fields plus its deliverables, its claims queue, its products and its barred
 * creators inside it, which is past what a dialog can hold
 * honestly, and the designer drew both of their directions as full pages
 * without being asked to.
 *
 * The owner's admin layout rules apply here in full: the working content starts
 * high, the header stays compact, nothing is centred, and no id, slug or route
 * is ever shown.
 *
 * NO CONTEST ROW EXISTS UNTIL SAVE IS PRESSED (Q12, rule F12). `contests.name`
 * and `expires_at` are both NOT NULL, so a half filled contest cannot exist in
 * the database and therefore can never leak into a count, a list, a policy or a
 * creator's screen.
 *
 * That is a statement about the DATABASE, not about the browser. The half
 * filled form is held in localStorage, keyed on the admin's own user id AND the
 * brand AND the contest being edited, so two admins sharing one machine and one
 * admin working on two brands cannot collide. It survives a reload and a closed
 * tab, and it is cleared on a successful save. The accepted cost, and the only
 * one, is that it does not follow an admin to a different computer.
 */

/** Led by the zones Wurx actually works across. The rest follow. See rule L6. */
const LEAD_ZONES = [
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
];

/**
 * And the full list behind them, which rule L6 asks for by name so a US brand's
 * contest can close at midnight where its creators are. Without it a contest
 * for creators in Sydney could not be set at all, and a contest written by a
 * script in a zone outside the six loaded into a controlled `<select>` whose
 * value matched no option: Chrome renders that as an EMPTY box, and touching it
 * silently reinterprets the deadline.
 *
 * Read through a typed lookup rather than `Intl.supportedValuesOf` directly,
 * because the declaration is not in every TypeScript lib and an older browser
 * simply leaves us with the six.
 */
const ALL_ZONES: string[] = (() => {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    return typeof supported === 'function' ? supported('timeZone') : [];
  } catch {
    return [];
  }
})();

const zoneLabel = (z: string) => z.replace(/_/g, ' ');

const CURRENCIES = ['USD', 'GBP', 'EUR'];

/** The browser's own zone, if we recognise it, so the common case needs no thought. */
function defaultZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && LEAD_ZONES.includes(tz) ? tz : 'Europe/London';
  } catch {
    return 'Europe/London';
  }
}

interface FormState {
  name: string;
  description: string;
  date: string;
  time: string;
  timezone: string;
  currency: string;
  briefUrl: string;
  needsAdminApproval: boolean;
  status: 'active' | 'inactive';
  budget: string;
  internalNote: string;
}

const EMPTY: FormState = {
  name: '',
  description: '',
  date: '',
  time: '23:59',
  timezone: defaultZone(),
  currency: 'USD',
  briefUrl: '',
  needsAdminApproval: true,
  status: 'inactive',
  budget: '',
  internalNote: '',
};

type FieldKey = 'name' | 'date' | 'time' | 'timezone' | 'briefUrl' | 'budget';
type FieldErrors = Partial<Record<FieldKey, string>>;

/**
 * The budget box, read once.
 *
 * Three answers, not two. `Number('5,000')` is NaN, and the old code sent
 * `totalBudget: null` when it saw one, which WIPED a budget that was already
 * set and showed a green Saved tick over the top of it. An unreadable figure is
 * a question for the admin, never a silent null.
 */
type Money =
  { kind: 'empty' } | { kind: 'number'; value: number } | { kind: 'invalid'; message: string };

function readMoney(raw: string): Money {
  const t = raw.trim();
  if (!t) return { kind: 'empty' };

  const n = Number(t);
  if (!Number.isFinite(n)) {
    return { kind: 'invalid', message: 'Give the budget as a number, for example 5000' };
  }
  if (n < 0) return { kind: 'invalid', message: 'A budget cannot be less than nothing' };
  if (n > 99_999_999)
    return { kind: 'invalid', message: 'That budget is larger than we can store' };
  return { kind: 'number', value: Math.round(n * 100) / 100 };
}

/* ------------------------------------------------------------------ draft -- */

const draftKeyFor = (
  userId: string | undefined,
  brandId: string | undefined,
  contestKey: string
) => (userId && brandId ? `wx.contest-draft.${userId}.${brandId}.${contestKey}` : null);

function readDraft(key: string | null): FormState | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FormState>;
    // Merged over EMPTY rather than trusted whole, so a draft written by an
    // older version of this screen cannot leave a field undefined.
    return { ...EMPTY, ...parsed };
  } catch {
    return null;
  }
}

function clearDraft(key: string | null) {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* A full or blocked localStorage is not worth failing a save over. */
  }
}

/* ------------------------------------------------------------------ screen -- */

export function ContestSetup() {
  const { id: brandId, contestId } = useParams<{ id: string; contestId: string }>();
  const isNew = !contestId || contestId === 'new';
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: brand } = useBrand(brandId);
  const {
    data: existing,
    isPending: loadingContest,
    isError: contestFailed,
    refetch: refetchContest,
  } = useContest(isNew ? undefined : contestId);
  const manage = useManageContest();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  /*
   * The id of a contest this screen has just created, held so that a failure
   * AFTER the row was written cannot turn the next press of the button into a
   * second contest. There is no unique key on (brand_id, name) anywhere, so
   * nothing else would have stopped it.
   */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const contestKey = isNew ? 'new' : contestId!;
  const draftKey = draftKeyFor(user?.id, brandId, contestKey);

  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const briefRef = useRef<HTMLInputElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);

  /*
   * SEEDED ONCE PER CONTEST, and that is the whole point of the ref.
   *
   * The effect used to depend on `existing`, which is a NEW OBJECT on every
   * settled fetch. `useManageContest` invalidates ['admin','contest'] on
   * success and the query client refetches on reconnect, so a save or a wifi
   * blip rewrote every field under whoever was typing, with no draft anywhere
   * to recover from.
   */
  const filledFor = useRef<string | null>(null);

  useEffect(() => {
    if (filledFor.current === contestKey) return;

    const draft = readDraft(draftKey);
    if (draft) {
      setForm(draft);
      // Already on disk. Marking it dirty here would only rewrite what was just
      // read, and would carry a stale flag across a switch between contests.
      setDirty(false);
      filledFor.current = contestKey;
      return;
    }

    if (isNew) {
      setForm(EMPTY);
      setDirty(false);
      filledFor.current = contestKey;
      return;
    }

    const c = existing?.contest;
    if (!c) return; // still loading, or gone: the error card handles the second

    const { date, time } = wallClockFields(Date.parse(c.expiresAt), c.expiresAtTimezone);
    setForm({
      name: c.name,
      description: c.description ?? '',
      date,
      time,
      timezone: c.expiresAtTimezone,
      currency: c.currency,
      briefUrl: c.briefUrl ?? '',
      needsAdminApproval: c.needsAdminApproval,
      status: c.status,
      budget: existing?.commercials?.totalBudget?.toString() ?? '',
      internalNote: existing?.commercials?.internalNote ?? '',
    });
    setDirty(false);
    filledFor.current = contestKey;
  }, [contestKey, draftKey, isNew, existing]);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
    setSaved(false);
    setFormError('');
    setErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k as FieldKey];
      return next;
    });
  }, []);

  // Held on this machine, debounced, and never a file. See rule F12.
  useEffect(() => {
    if (!draftKey || !dirty) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(form));
      } catch {
        /* Nothing to do and nothing worth saying. */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [draftKey, dirty, form]);

  const parsed = useMemo(
    () => instantFromWallClock(form.date, form.time, form.timezone),
    [form.date, form.time, form.timezone]
  );
  const instant = parsed?.ok ? parsed.iso : null;
  const clockRefusal = parsed && !parsed.ok ? parsed.message : null;

  /** The zone the contest is actually set in, even if it is not one of our six. */
  const extraZone =
    form.timezone && !LEAD_ZONES.includes(form.timezone) && !ALL_ZONES.includes(form.timezone)
      ? form.timezone
      : null;

  function focusFirst(next: FieldErrors) {
    const order: [FieldKey, React.RefObject<HTMLInputElement | null>][] = [
      ['name', nameRef],
      ['date', dateRef],
      ['time', timeRef],
      ['briefUrl', briefRef],
      ['budget', budgetRef],
    ];
    for (const [key, ref] of order) {
      if (next[key]) {
        ref.current?.focus();
        return;
      }
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    // ------------------------------------------------------- what we refuse --
    const next: FieldErrors = {};
    const money = readMoney(form.budget);

    if (!form.name.trim()) next.name = 'Give this contest a name';
    if (!form.date || !form.time) next.date = 'When does this contest close?';
    else if (clockRefusal) next.time = clockRefusal;
    else if (!instant) next.date = 'When does this contest close?';
    else if (Date.parse(instant) <= Date.now()) {
      next.date = 'That deadline has already passed';
    }
    if (form.briefUrl.trim() && !/^https:\/\/\S{4,}/i.test(form.briefUrl.trim())) {
      next.briefUrl = 'A brief link has to be a full web address starting with https://';
    }
    if (money.kind === 'invalid') next.budget = money.message;

    if (Object.keys(next).length > 0) {
      setErrors(next);
      focusFirst(next);
      return;
    }
    setErrors({});

    // ------------------------------------------------------------ the save --
    const targetId = isNew ? createdId : contestId!;

    let id: string;
    try {
      const contest = (await manage.mutateAsync({
        action: 'contest.save',
        contestId: targetId,
        brandId: brandId!,
        name: form.name.trim(),
        description: form.description.trim() || null,
        expiresAt: instant!,
        expiresAtTimezone: form.timezone,
        briefUrl: form.briefUrl.trim() || null,
        // Carried through rather than nulled. There is no banner control on this
        // screen yet (rule B8, step 1), and `save_contest` writes this column
        // unconditionally, so sending null here would erase artwork set by
        // anything else the day one exists.
        bannerUrl: existing?.contest?.bannerUrl ?? null,
        currency: form.currency,
        status: form.status,
        needsAdminApproval: form.needsAdminApproval,
      })) as { id: string };
      id = contest.id;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'That did not save');
      return;
    }

    /*
     * THE ROW IS COMMITTED, so the screen stops being a create screen HERE,
     * before anything else can fail. The budget lives behind a second call, and
     * a refusal from it used to leave the URL on /new with Create still armed:
     * pressing it again wrote a second contest, which no screen in the product
     * could then delete.
     */
    setCreatedId(id);
    clearDraft(draftKey);
    if (isNew) {
      // Seeded already, by the admin, so the screen keeps showing what they
      // typed instead of flashing a skeleton at them while it reads back the
      // row it just wrote.
      filledFor.current = id;
      navigate(`/admin/brands/${brandId}/contests/${id}`, { replace: true });
    }

    /*
     * Its own action, so the setup form cannot touch the money by sending a
     * stale copy of it back with an unrelated edit. ALWAYS SENT when a contest
     * already exists: emptying the box is an edit, and skipping the call left
     * the old figure in place, enforcing all three M7 checks invisibly, under a
     * green Saved tick.
     */
    const note = form.internalNote.trim() || null;
    const touchesMoney = !isNew || money.kind === 'number' || note !== null;

    if (touchesMoney) {
      try {
        await manage.mutateAsync({
          action: 'contest.commercials',
          contestId: id,
          totalBudget: money.kind === 'number' ? money.value : null,
          internalNote: note,
        });
      } catch (err) {
        setErrors({ budget: err instanceof Error ? err.message : 'That budget did not save' });
        setFormError(
          'The contest itself is saved. Only the budget and the note did not go through.'
        );
        budgetRef.current?.focus();
        return;
      }
    }

    // Both keys, because a create moves the form from the "new" key to the
    // contest's own one part way through this function.
    clearDraft(draftKeyFor(user?.id, brandId, id));
    setDirty(false);
    setSaved(true);
  }

  const busy = manage.isPending;

  /*
   * The submit button lives in the header, OUTSIDE the form it owns, so any
   * state that does not render the form leaves `form="contest-form"` pointing
   * at nothing and the button does nothing at all, silently, while still
   * looking enabled and primary.
   *
   * `seeded` is read rather than `loadingContest` alone because the create flow
   * ends in exactly that state: the navigate makes this an existing contest,
   * its query is pending, and the form the admin is looking at is already
   * correct. There is nothing to wait for.
   */
  const seeded = filledFor.current === contestKey;
  const showSkeleton = !isNew && !contestFailed && loadingContest && !seeded;
  const showGone = !isNew && !contestFailed && !loadingContest && !existing?.contest && !seeded;
  const formMissing = (!isNew && contestFailed) || showSkeleton || showGone;

  /*
   * The id the four sections below hang off, and the reason they appear only
   * once it exists rather than as dead boxes on a new contest: every one of them
   * reads or writes against a contest_id, and there is no contest until Create
   * is pressed.
   *
   * `createdId` covers the single render between the row being written and the
   * URL catching up, so the lists do not appear and then blink out again.
   */
  const liveContestId = isNew ? createdId : contestId!;

  /*
   * Read from the SAVED contest rather than from the form.
   *
   * Deliverables carry amounts in the currency the contest is stored in.
   * Reading the form here would put a GBP label on USD figures the moment
   * somebody touched the currency select without saving it.
   */
  const savedCurrency = existing?.contest?.currency ?? form.currency;
  const listsLoading = loadingContest && !existing;

  return (
    <>
      <div className="mx-0 w-full max-w-[1128px]">
        {/* ------------------------------------------------------- header -- */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
          <div className="min-w-0">
            <Link
              to={`/admin/brands/${brandId}?section=contests`}
              className="text-muted hover:text-text ease-brand inline-flex min-h-[44px] items-center gap-1.5 text-[0.8125rem] font-semibold transition-colors"
            >
              <ArrowLeft size={15} aria-hidden />
              {brand?.name ?? 'Back'}
            </Link>
            {/* An `<h2>` since 2026-08-16, not a demotion of the record. The
                shell's top bar owns the page's one `<h1>` and names the section
                you are in; this names the contest you have open, which is a
                level under that. Size and weight are unchanged, so nothing
                about it reads smaller. */}
            <h2 className="font-display text-text mt-1 truncate text-[1.625rem] leading-tight font-bold">
              {isNew ? 'New contest' : form.name || 'Contest'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Permanently in the tree, so a screen reader hears the result of
                pressing the button instead of nothing at all. */}
            <p
              role="status"
              aria-live="polite"
              className="text-success text-[0.8125rem] font-semibold"
            >
              {saved ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check size={15} aria-hidden />
                  Saved
                </span>
              ) : null}
            </p>
            <Button type="submit" form="contest-form" disabled={busy || formMissing}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
              {isNew ? 'Create contest' : 'Save changes'}
            </Button>
          </div>
        </div>

        {contestFailed && !isNew ? (
          <div className="border-line bg-surface-1 flex flex-col items-start gap-3 rounded-xl border p-8 shadow-md">
            <h2 className="font-display text-text text-[1.3125rem] leading-tight font-bold">
              That contest could not be opened
            </h2>
            <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
              It may have been deleted, or the connection dropped on the way. Nothing has been
              changed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void refetchContest()}>
                Try again
              </Button>
              <Link
                to={`/admin/brands/${brandId}?section=contests`}
                className="text-accent inline-flex min-h-[44px] items-center text-[0.8125rem] font-semibold hover:underline"
              >
                Back to {brand?.name ?? 'the brand'}
              </Link>
            </div>
          </div>
        ) : showSkeleton ? (
          <div className="wx-skeleton h-[420px] rounded-xl" />
        ) : showGone ? (
          <div className="border-line bg-surface-1 flex flex-col items-start gap-3 rounded-xl border p-8 shadow-md">
            <h2 className="font-display text-text text-[1.3125rem] leading-tight font-bold">
              There is no contest here any more
            </h2>
            <p className="text-muted max-w-prose text-[0.875rem] leading-relaxed">
              It has been deleted, or it belongs to another brand.
            </p>
            <Link
              to={`/admin/brands/${brandId}?section=contests`}
              className="text-accent inline-flex min-h-[44px] items-center text-[0.8125rem] font-semibold hover:underline"
            >
              Back to {brand?.name ?? 'the brand'}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <form
              id="contest-form"
              onSubmit={onSubmit}
              aria-busy={busy}
              className="flex flex-col gap-4"
            >
              {formError ? (
                <p
                  role="alert"
                  className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-[0.8125rem] font-medium"
                >
                  {formError}
                </p>
              ) : null}

              {/* -------------------------------------------------- the job -- */}
              <Card title="The contest">
                <Field label="Name" error={errors.name}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      ref={nameRef}
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder="e.g. Back to school sprint"
                      // 120, the length the column actually allows.
                      maxLength={120}
                      readOnly={busy}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      required
                    />
                  )}
                </Field>

                <Field
                  label="What creators do"
                  hint="Shown to every creator who can see this contest."
                >
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      rows={3}
                      maxLength={4000}
                      readOnly={busy}
                      placeholder="e.g. Four videos featuring the lunchbox range, parent facing."
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  )}
                </Field>

                {/*
                  "How it is judged" was here and is gone with placings, on
                  Rashid's redesign of 2026-08-13. Nobody finishes first any
                  more: a contest is a list of deliverables, and each one says
                  what a creator has to reach in numbers. The sentence existed
                  because a placing with no stated basis feels arbitrary, and
                  there is no placing left to explain. The column is dropped in
                  the same step, so there is nothing to write it into either.
                */}
                <Field
                  label="Content brief link"
                  hint="Optional. Opens in a new tab for creators."
                  error={errors.briefUrl}
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      ref={briefRef}
                      type="url"
                      value={form.briefUrl}
                      onChange={(e) => set('briefUrl', e.target.value)}
                      maxLength={500}
                      readOnly={busy}
                      placeholder="https://"
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  )}
                </Field>
              </Card>

              {/* ------------------------------------------------ the clock -- */}
              <Card title="When it closes">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Date" error={errors.date}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        ref={dateRef}
                        type="date"
                        value={form.date}
                        onChange={(e) => set('date', e.target.value)}
                        readOnly={busy}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        required
                      />
                    )}
                  </Field>
                  <Field label="Time" error={errors.time ?? clockRefusal ?? undefined}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        ref={timeRef}
                        type="time"
                        value={form.time}
                        onChange={(e) => set('time', e.target.value)}
                        readOnly={busy}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        required
                      />
                    )}
                  </Field>
                  <Field label="Timezone">
                    {({ id, describedBy, invalid }) => (
                      <Select
                        id={id}
                        value={form.timezone}
                        onChange={(e) => set('timezone', e.target.value)}
                        disabled={busy}
                        aria-describedby={describedBy}
                        invalid={invalid}
                      >
                        {/* The zone the contest is already set in always has an
                          option, even when it is one nobody here would pick. An
                          unmatched value renders as an empty box, and touching
                          it silently reinterprets the deadline. */}
                        {extraZone ? (
                          <option value={extraZone}>{zoneLabel(extraZone)}</option>
                        ) : null}
                        <optgroup label="Where Wurx works">
                          {LEAD_ZONES.map((z) => (
                            <option key={z} value={z}>
                              {zoneLabel(z)}
                            </option>
                          ))}
                        </optgroup>
                        {ALL_ZONES.length > 0 ? (
                          <optgroup label="Everywhere else">
                            {ALL_ZONES.filter((z) => !LEAD_ZONES.includes(z)).map((z) => (
                              <option key={z} value={z}>
                                {zoneLabel(z)}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </Select>
                    )}
                  </Field>
                </div>

                {/* The echo is the entire justification for the three control
                  design in rule L6, so it has to speak when the zone changes. */}
                <p className="text-muted text-[0.8125rem]" aria-live="polite">
                  {instant ? (
                    <>
                      A creator reads this as{' '}
                      <span className="text-text font-semibold">
                        {formatDeadline(instant, form.timezone)}
                      </span>
                      , wherever they are.
                    </>
                  ) : clockRefusal ? (
                    clockRefusal
                  ) : (
                    'Pick a date and a time, and the deadline appears here exactly as a creator will read it.'
                  )}
                </p>
              </Card>

              {/* ----------------------------------------------- who gets in -- */}
              <Card title="Who gets in">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Entry">
                    {({ id, describedBy, invalid }) => (
                      <Select
                        id={id}
                        value={form.needsAdminApproval ? 'review' : 'instant'}
                        onChange={(e) => set('needsAdminApproval', e.target.value === 'review')}
                        disabled={busy}
                        aria-describedby={describedBy}
                        invalid={invalid}
                      >
                        <option value="review">Someone at Wurx approves each entry</option>
                        <option value="instant">
                          Anyone eligible is in the moment they tap
                        </option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Currency">
                    {({ id, describedBy, invalid }) => (
                      <Select
                        id={id}
                        value={form.currency}
                        onChange={(e) => set('currency', e.target.value)}
                        disabled={busy}
                        aria-describedby={describedBy}
                        invalid={invalid}
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
                <p className="text-muted text-[0.8125rem]">
                  Changing this later approves nobody who is waiting, and removes nobody already
                  in.
                </p>
              </Card>

              {/* ---------------------------------------------------- money -- */}
              <Card
                title="Only Wurx sees this"
                note="No creator can read anything in this box. It is not hidden by a filter, it is in a table they cannot reach."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={`Total budget, ${form.currency}`}
                    error={errors.budget}
                    hint="Leave it empty for no ceiling. Emptying it removes the one that is there."
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        ref={budgetRef}
                        inputMode="decimal"
                        value={form.budget}
                        onChange={(e) => set('budget', e.target.value)}
                        readOnly={busy}
                        placeholder="e.g. 5000"
                        aria-describedby={describedBy}
                        invalid={invalid}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Internal note">
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      value={form.internalNote}
                      onChange={(e) => set('internalNote', e.target.value)}
                      rows={2}
                      maxLength={2000}
                      readOnly={busy}
                      placeholder="e.g. Client signed off 12 August"
                      aria-describedby={describedBy}
                      invalid={invalid}
                    />
                  )}
                </Field>
              </Card>

              {/* ------------------------------------------------- live yet -- */}
              <Card title="Is it running">
                <Field label="Status">
                  {({ id, describedBy, invalid }) => (
                    <Select
                      id={id}
                      value={form.status}
                      onChange={(e) => set('status', e.target.value as 'active' | 'inactive')}
                      disabled={busy}
                      aria-describedby={describedBy}
                      invalid={invalid}
                    >
                      <option value="inactive">
                        Off, nobody can enter and nobody can see it
                      </option>
                      <option value="active">On, creators can see it and enter</option>
                    </Select>
                  )}
                </Field>
                <p className="text-muted text-[0.8125rem]">
                  Switching a contest off closes the door, never the work. Anybody already in
                  carries on filming and still gets paid.
                </p>
              </Card>
            </form>

            {/*
              OUTSIDE the form above, deliberately. Each of these three carries
              a form of its own, and a form inside a form is not a thing HTML
              has: the browser drops the inner one, and every button in it
              starts submitting the contest instead of doing its own job.
            */}
            {liveContestId ? (
              <>
                <ContestDeliverables
                  contestId={liveContestId}
                  currency={savedCurrency}
                  rows={existing?.deliverables ?? []}
                  loading={listsLoading}
                />
                {/*
                  Who is waiting to be let in, then what they say they have
                  achieved. Both are "somebody is waiting on us", and an entry
                  blocks everything downstream of it, so it comes first.
                */}
                <ContestEntryQueue contestId={liveContestId} />
                <ContestProgressQueue contestId={liveContestId} />
                <ContestProducts
                  contestId={liveContestId}
                  brandId={brandId!}
                  selected={existing?.products ?? []}
                  loading={listsLoading}
                />
                <ContestExclusions
                  contestId={liveContestId}
                  rows={existing?.exclusions ?? []}
                  loading={listsLoading}
                />
              </>
            ) : (
              <p className="text-faint max-w-prose text-[0.75rem] leading-relaxed">
                Deliverables, products and barred creators all hang off this contest, so they
                open the moment it exists. Press Create contest and they appear here, on this
                same screen.
              </p>
            )}

            {!isNew && existing?.contest ? (
              <>
                <CloseContest
                  contestId={contestId!}
                  currency={savedCurrency}
                  settledAt={existing.contest.settledAt}
                  cancelledAt={existing.contest.cancelledAt}
                />
                <DeleteContest
                  brandId={brandId!}
                  contestId={contestId!}
                  contestName={existing.contest.name}
                />
              </>
            ) : null}

            <div className="pb-8" />
          </div>
        )}
      </div>
    </>
  );
}

/**
 * CLOSING A CONTEST, which since 2026-08-14 moves no money at all.
 *
 * `settle_contest` shipped with no caller for the same reason `delete_contest`
 * did, and it stayed that way while it still meant "work out who won and pay
 * them". It does not mean that any more: a reward is owed the moment staff
 * confirm the figure that crosses its target, so by the time a contest closes
 * every penny is already recorded. Closing says the event is over.
 *
 * THE TWO REFUSALS ARE THE POINT, and both are good ones. The database declines
 * while an entry is still pending, because an applicant left waiting on a dead
 * contest is in no queue and gets no decision. And it declines while a PROGRESS
 * CLAIM is still pending, because that claim could never be confirmed
 * afterwards and confirming is the only thing that can owe somebody money, so
 * closing over the top of one would silently cancel a reward already earned.
 *
 * WHAT IS STILL OWED IS SHOWN, NOT REFUSED. Closing and paying genuinely finish
 * at different times, and `pay_contest_awards` keeps working on a closed
 * contest. So the figure is put in front of somebody before the click rather
 * than discovered after it.
 */
function CloseContest({
  contestId,
  currency,
  settledAt,
  cancelledAt,
}: {
  contestId: string;
  currency: string;
  settledAt: string | null;
  cancelledAt: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const manage = useManageContest();

  // What is still unpaid on this contest, from the staff-only rollup rather
  // than counted off a screen.
  const owed = useQuery({
    queryKey: ['admin', 'contest-awards', 'totals', contestId],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error: err } = await getSupabase()
        .from('contest_award_totals')
        .select('owed, awards_owed')
        .eq('contest_id', contestId);
      if (err) throw err;
      const rows = (data ?? []) as unknown as { owed: number | string; awards_owed: number }[];
      return {
        amount: rows.reduce((n, r) => n + Number(r.owed), 0),
        count: rows.reduce((n, r) => n + r.awards_owed, 0),
      };
    },
  });

  if (cancelledAt) {
    return (
      <p className="text-muted max-w-prose text-[0.8125rem] leading-relaxed">
        This contest was cancelled. Nothing more can be entered, claimed or confirmed on it.
      </p>
    );
  }

  if (settledAt) {
    return (
      <p className="text-muted max-w-prose text-[0.8125rem] leading-relaxed">
        This contest is closed. Rewards already earned can still be paid from{' '}
        <Link to="/admin/contests/rewards" className="text-accent font-semibold hover:underline">
          Contest rewards
        </Link>
        .
      </p>
    );
  }

  async function onClose() {
    setError('');
    try {
      await manage.mutateAsync({
        action: 'contest.settle',
        contestId,
        // MESSAGE, not reason. Every entrant reads it on their own timeline.
        message: message.trim() || null,
      });
      setConfirming(false);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not close');
    }
  }

  if (!confirming) {
    return (
      <div className="flex">
        <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
          <Lock size={15} aria-hidden />
          Close this contest
        </Button>
      </div>
    );
  }

  return (
    <div className="border-line-strong bg-surface-2 rounded-xl border p-4">
      <p className="text-text max-w-prose text-[0.8125rem] leading-relaxed font-medium">
        Close this contest? Nobody can enter it, claim on it or have figures confirmed on it
        again. Everybody in it is told on their own timeline.
      </p>

      {owed.data && owed.data.count > 0 ? (
        <p className="bg-stage-due-soft text-stage-due mt-3 rounded-xl px-3.5 py-2.5 text-[0.8125rem] leading-relaxed font-medium">
          {money(owed.data.amount, currency)} is still owed across {owed.data.count} reward
          {owed.data.count === 1 ? '' : 's'}. Closing does not cancel it, and you can still pay it
          from Contest rewards afterwards.
        </p>
      ) : null}

      <div className="mt-3">
        <Field label="Message to everybody in it" hint="They read this. Optional.">
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="close-message"
              rows={2}
              maxLength={500}
              value={message}
              disabled={manage.isPending}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. That is a wrap. Rewards go out with this month's run."
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      {error ? (
        <p role="alert" className="text-danger mt-2 text-[0.75rem]">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={manage.isPending} onClick={() => void onClose()}>
          {manage.isPending ? 'Closing...' : 'Yes, close it'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={manage.isPending}
          onClick={() => {
            setConfirming(false);
            setError('');
          }}
        >
          Keep it running
        </Button>
      </div>
    </div>
  );
}

/**
 * Rule L17: turning a contest off and deleting one are BOTH controls in this
 * step. `delete_contest` shipped in the first migration with no caller, and a
 * write function with no control is a capability nobody has: a contest created
 * by mistake would have sat on the brand's list for ever.
 *
 * Its own mutation, so a failed delete cannot paint an error over the save
 * button and vice versa. The refusal it is most likely to meet is the good one:
 * the database declines while anybody is pending or approved, and says how many.
 */
function DeleteContest({
  brandId,
  contestId,
  contestName,
}: {
  brandId: string;
  contestId: string;
  contestName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const manage = useManageContest();

  async function onDelete() {
    setError('');
    try {
      await manage.mutateAsync({ action: 'contest.delete', contestId });
      navigate(`/admin/brands/${brandId}?section=contests`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not delete');
    }
  }

  if (!confirming) {
    return (
      <div className="flex">
        <Button
          type="button"
          variant="ghost"
          aria-label={`Delete ${contestName}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={15} aria-hidden />
          Delete this contest
        </Button>
      </div>
    );
  }

  return (
    <div className="border-danger/40 bg-danger-soft rounded-xl border p-4">
      <p className="text-danger max-w-prose text-[0.8125rem] leading-relaxed font-medium">
        Delete this contest? It goes for good, along with its deliverables and its budget. The
        activity log keeps a record of what it was. Nobody can be in it: if anybody is waiting
        or approved, settle or decide them first.
      </p>
      {error ? (
        <p role="alert" className="text-danger mt-2 text-[0.75rem]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={manage.isPending} onClick={() => void onDelete()}>
          {manage.isPending ? 'Deleting...' : 'Yes, delete'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={manage.isPending}
          onClick={() => {
            setConfirming(false);
            setError('');
          }}
        >
          Keep it
        </Button>
      </div>
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-5 shadow-md">
      <div>
        <h2 className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          {title}
        </h2>
        {note ? (
          <p className={cn('text-faint mt-1.5 max-w-prose text-[0.75rem]')}>{note}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
