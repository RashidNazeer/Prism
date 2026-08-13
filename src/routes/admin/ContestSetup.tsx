import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { formatDeadline } from '@/lib/contest-time';
import { useBrand } from '@/lib/admin/useBrands';
import { useContest } from '@/lib/admin/useContests';
import { useManageContest } from '@/lib/admin/useManageContest';

/**
 * The contest setup screen.
 *
 * A FULL SCREEN, not a dialog, ruled 2026-08-13. A contest carries a dozen
 * fields plus three lists inside it, which is past what a dialog can hold
 * honestly, and the designer drew both of their directions as full pages
 * without being asked to.
 *
 * The owner's admin layout rules apply here in full: the working content starts
 * high, the header stays compact, nothing is centred, and no id, slug or route
 * is ever shown.
 *
 * NOTHING IS SAVED UNTIL SAVE IS PRESSED. There is no draft row, by decision:
 * `contests.name` and `expires_at` are both NOT NULL, so a half filled contest
 * cannot exist in the database and therefore can never leak into a count, a
 * list, a policy or a creator's screen. The cost, which was accepted: a half
 * filled form does not follow an admin to a different computer.
 */

/** Led by the zones Wurx actually works across. The rest follow. See rule L6. */
const ZONES = [
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
];

const CURRENCIES = ['USD', 'GBP', 'EUR'];

/** The browser's own zone, if we recognise it, so the common case needs no thought. */
function defaultZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && ZONES.includes(tz) ? tz : 'Europe/London';
  } catch {
    return 'Europe/London';
  }
}

interface FormState {
  name: string;
  description: string;
  judgingBasis: string;
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
  judgingBasis: '',
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

/**
 * A wall clock date and time IN A NAMED ZONE, turned into a real instant.
 *
 * Built by asking Intl what the zone's offset was at roughly that moment,
 * rather than trusting the browser's own zone, which is the entire failure L6
 * exists to prevent.
 */
function toInstant(date: string, time: string, timeZone: string): string | null {
  if (!date || !time) return null;
  const naive = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(naive);

    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    const asZone = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second')
    );
    // The gap between the same wall clock read in UTC and read in the zone IS
    // the offset, so subtracting it turns the typed time into the instant.
    return new Date(naive.getTime() * 2 - asZone).toISOString();
  } catch {
    return null;
  }
}

export function ContestSetup() {
  const { id: brandId, contestId } = useParams<{ id: string; contestId: string }>();
  const isNew = !contestId || contestId === 'new';
  const navigate = useNavigate();

  const { data: brand } = useBrand(brandId);
  const { data: existing, isPending: loadingContest } = useContest(isNew ? undefined : contestId);
  const manage = useManageContest();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Fill the form once the contest arrives. Keyed on the id so switching
  // between two contests does not leave the first one's values behind.
  useEffect(() => {
    const c = existing?.contest;
    if (!c) return;
    const d = new Date(c.expiresAt);
    const inZone = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: c.expiresAtTimezone, ...opts }).format(d);
    setForm({
      name: c.name,
      description: c.description ?? '',
      judgingBasis: c.judgingBasis ?? '',
      date: inZone({ year: 'numeric', month: '2-digit', day: '2-digit' }),
      time: inZone({ hour: '2-digit', minute: '2-digit', hour12: false }),
      timezone: c.expiresAtTimezone,
      currency: c.currency,
      briefUrl: c.briefUrl ?? '',
      needsAdminApproval: c.needsAdminApproval,
      status: c.status,
      budget: existing?.commercials?.totalBudget?.toString() ?? '',
      internalNote: existing?.commercials?.internalNote ?? '',
    });
  }, [existing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
    setError('');
  };

  const instant = useMemo(
    () => toInstant(form.date, form.time, form.timezone),
    [form.date, form.time, form.timezone]
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) return setError('Give this contest a name');
    if (!instant) return setError('When does this contest close?');
    if (Date.parse(instant) <= Date.now()) {
      return setError('That deadline has already passed');
    }

    try {
      const contest = (await manage.mutateAsync({
        action: 'contest.save',
        contestId: isNew ? null : contestId,
        brandId: brandId!,
        name: form.name.trim(),
        description: form.description.trim() || null,
        judgingBasis: form.judgingBasis.trim() || null,
        expiresAt: instant,
        expiresAtTimezone: form.timezone,
        briefUrl: form.briefUrl.trim() || null,
        bannerUrl: null,
        currency: form.currency,
        status: form.status,
        needsAdminApproval: form.needsAdminApproval,
      })) as { id: string };

      // Its own action, so the setup form cannot touch the money by sending a
      // stale copy of it back with an unrelated edit.
      const budget = form.budget.trim() ? Number(form.budget) : null;
      if (budget !== null || form.internalNote.trim()) {
        await manage.mutateAsync({
          action: 'contest.commercials',
          contestId: contest.id,
          totalBudget: Number.isFinite(budget as number) ? budget : null,
          internalNote: form.internalNote.trim() || null,
        });
      }

      if (isNew) {
        navigate(`/admin/brands/${brandId}/contests/${contest.id}`, { replace: true });
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save');
    }
  }

  const busy = manage.isPending;

  return (
    <AppShell>
      <div className="mx-0 w-full max-w-[1128px]">
        {/* ------------------------------------------------------- header -- */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
          <div className="min-w-0">
            <Link
              to={`/admin/brands/${brandId}?section=contests`}
              className="text-muted hover:text-text ease-brand inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold transition-colors"
            >
              <ArrowLeft size={15} aria-hidden />
              {brand?.name ?? 'Back'}
            </Link>
            <h1 className="font-display text-text mt-1 truncate text-[26px] leading-tight font-bold">
              {isNew ? 'New contest' : form.name || 'Contest'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {saved ? (
              <span className="text-stage-paid inline-flex items-center gap-1.5 text-[13px] font-semibold">
                <Check size={15} aria-hidden />
                Saved
              </span>
            ) : null}
            <Button type="submit" form="contest-form" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
              {isNew ? 'Create contest' : 'Save changes'}
            </Button>
          </div>
        </div>

        {!isNew && loadingContest ? (
          <div className="wx-skeleton h-[420px] rounded-[20px]" />
        ) : (
          <form id="contest-form" onSubmit={onSubmit} className="flex flex-col gap-4">
            {error ? (
              <p
                role="alert"
                className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-[13px] font-medium"
              >
                {error}
              </p>
            ) : null}

            {/* -------------------------------------------------- the job -- */}
            <Card title="The contest">
              <Field label="Name">
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Back to school sprint"
                    maxLength={160}
                    disabled={busy}
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
                    disabled={busy}
                    placeholder="e.g. Four videos featuring the lunchbox range, parent facing."
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field
                label="How it is judged"
                hint="Needed once this contest pays for finishing in a place. With no live scoreboard, this sentence is the only thing a creator has to go on."
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    value={form.judgingBasis}
                    onChange={(e) => set('judgingBasis', e.target.value)}
                    maxLength={600}
                    disabled={busy}
                    placeholder="e.g. Most approved videos by the deadline"
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Content brief link" hint="Optional. Opens in a new tab for creators.">
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="url"
                    value={form.briefUrl}
                    onChange={(e) => set('briefUrl', e.target.value)}
                    maxLength={500}
                    disabled={busy}
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
                <Field label="Date">
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      type="date"
                      value={form.date}
                      onChange={(e) => set('date', e.target.value)}
                      disabled={busy}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      required
                    />
                  )}
                </Field>
                <Field label="Time">
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      type="time"
                      value={form.time}
                      onChange={(e) => set('time', e.target.value)}
                      disabled={busy}
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
                      {ZONES.map((z) => (
                        <option key={z} value={z}>
                          {z.replace('_', ' ')}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <p className="text-muted text-[13px]">
                {instant ? (
                  <>
                    A creator reads this as{' '}
                    <span className="text-text font-semibold">
                      {formatDeadline(instant, form.timezone)}
                    </span>
                    , wherever they are.
                  </>
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
                      <option value="instant">Anyone eligible is in the moment they tap</option>
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
              <p className="text-muted text-[13px]">
                Changing this later approves nobody who is waiting, and removes nobody already in.
              </p>
            </Card>

            {/* ---------------------------------------------------- money -- */}
            <Card
              title="Only Wurx sees this"
              note="No creator can read anything in this box. It is not hidden by a filter, it is in a table they cannot reach."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Total budget, ${form.currency}`}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      value={form.budget}
                      onChange={(e) => set('budget', e.target.value)}
                      disabled={busy}
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
                    disabled={busy}
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
                    <option value="inactive">Off, nobody can enter and nobody can see it</option>
                    <option value="active">On, creators can see it and enter</option>
                  </Select>
                )}
              </Field>
              <p className="text-muted text-[13px]">
                Switching a contest off closes the door, never the work. Anybody already in carries
                on filming and still gets paid.
              </p>
            </Card>

            <p className="text-faint pb-8 text-[12px]">
              Reward rows, products and barred creators come next, and open once the contest exists.
            </p>
          </form>
        )}
      </div>
    </AppShell>
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
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-[20px] border p-5 shadow-md">
      <div>
        <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">{title}</h2>
        {note ? <p className={cn('text-faint mt-1.5 max-w-prose text-[12px]')}>{note}</p> : null}
      </div>
      {children}
    </section>
  );
}
