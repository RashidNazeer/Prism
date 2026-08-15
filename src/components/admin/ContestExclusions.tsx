import { useState, type FormEvent } from 'react';
import { Ban, Loader2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { useManageContest } from '@/lib/admin/useManageContest';
import type { ContestExclusion } from '@/lib/admin/useContests';

/**
 * Who cannot enter this contest.
 *
 * FORWARD LOOKING ONLY, and the database is built that way: barring somebody
 * touches no entry row of any kind. Anybody already in stays in, keeps their
 * frozen terms and keeps their place at settlement, so a mistyped handle cannot
 * destroy live work with one keystroke.
 *
 * A BAR IS NOT A LOCKED BUTTON. Row security removes the contest from an
 * excluded creator's reads entirely, so there is nothing for them to press and
 * nothing for them to read. That is why the attempts counter is worded as a
 * blocked attempt rather than a click: reaching this contest at all means going
 * straight at the API.
 *
 * THE REASON IS STAFF ONLY. It sits in a table no creator can read, and it is
 * labelled here so nobody writes it as if the person will see it.
 */

interface Props {
  contestId: string;
  rows: ContestExclusion[];
  loading: boolean;
}

/**
 * A staff timestamp, in the reader's own zone.
 *
 * Deliberately NOT `formatDeadline`. A deadline is shown in the zone the admin
 * chose because a creator has to act before it; this is a record of something
 * that already happened, read by the person sitting in front of it.
 */
function whenLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const withAt = (handle: string) => (handle.startsWith('@') ? handle : `@${handle}`);

export function ContestExclusions({ contestId, rows, loading }: Props) {
  const manage = useManageContest();

  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ handle?: string; email?: string }>({});
  const [formError, setFormError] = useState('');
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const busy = manage.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const h = handle.trim();
    const m = email.trim();
    const next: { handle?: string; email?: string } = {};

    if (!h && !m) next.handle = 'Give a handle or an email address';
    // The same shape the Edge Function refuses on, said before the round trip.
    if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m))
      next.email = 'That is not an email address';

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});

    try {
      await manage.mutateAsync({
        action: 'exclusion.save',
        contestId,
        handle: h || null,
        email: m || null,
        reason: reason.trim() || null,
      });
      setHandle('');
      setEmail('');
      setReason('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'That bar did not save');
    }
  }

  async function onLift(row: ContestExclusion) {
    setRowError((e) => ({ ...e, [row.id]: '' }));
    try {
      await manage.mutateAsync({ action: 'exclusion.remove', exclusionId: row.id });
    } catch (err) {
      setRowError((e) => ({
        ...e,
        [row.id]: err instanceof Error ? err.message : 'That bar could not be lifted',
      }));
    }
  }

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-5 shadow-md">
      <div>
        <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
          Barred from this contest
        </h2>
        <p className="text-faint mt-1.5 max-w-prose text-[12px]">
          A bar covers this contest only, never the brand and never the account. Anybody already
          in stays in: this stops a new entry, it does not undo one.
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        aria-busy={busy}
        className="border-line-strong bg-surface-2 flex flex-col gap-4 rounded-xl border p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="TikTok handle"
            error={errors.handle}
            hint="Either this or an email is enough."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  setErrors((x) => ({ ...x, handle: undefined }));
                  setFormError('');
                }}
                maxLength={64}
                readOnly={busy}
                placeholder="e.g. @creatorname"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Email address" error={errors.email}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((x) => ({ ...x, email: undefined }));
                  setFormError('');
                }}
                maxLength={320}
                readOnly={busy}
                placeholder="e.g. name@example.com"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        </div>

        <Field
          label="Reason, staff only"
          hint="No creator can ever read this. It is in a table they cannot reach, not behind a filter."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              readOnly={busy}
              placeholder="e.g. Chargebacks on the last two campaigns"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>

        {formError ? (
          <p
            role="alert"
            className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-[13px] font-medium"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex">
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Ban size={16} aria-hidden />
            )}
            Bar this person
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="wx-skeleton h-[84px] rounded-xl" />
          <div className="wx-skeleton h-[84px] rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <div className="bg-surface-3 border-line-strong grid size-11 place-items-center rounded-lg border">
            <UserX size={19} className="text-muted" aria-hidden />
          </div>
          <h3 className="font-display text-text text-[19px] leading-tight font-bold">
            Nobody is barred
          </h3>
          <p className="text-muted max-w-prose text-[14px] leading-relaxed">
            Every creator this brand works with can enter, subject to how entries are handled
            above.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <ExclusionRow
                row={row}
                busy={busy}
                error={rowError[row.id] ?? ''}
                onLift={() => void onLift(row)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExclusionRow({
  row,
  busy,
  error,
  onLift,
}: {
  row: ContestExclusion;
  busy: boolean;
  error: string;
  onLift: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const who = row.handle ? withAt(row.handle) : (row.email ?? 'Somebody');
  const second = row.handle && row.email ? row.email : null;

  return (
    <div className="border-line bg-surface-1 rounded-xl border p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-text text-[15px] font-semibold break-words">{who}</p>
          {second ? (
            <p className="text-muted mt-0.5 text-[13px] break-words">{second}</p>
          ) : null}

          <p className={cn('mt-1.5 text-[13px]', row.userId ? 'text-muted' : 'text-faint')}>
            {row.userId
              ? 'Matched to an account, so a rename cannot get around it'
              : 'This bar has not matched an account yet, which is normal for somebody who has not signed up'}
          </p>

          {row.attempts > 0 ? (
            <p className="text-warning mt-1.5 font-mono text-[12px]">
              {row.attempts} blocked attempt{row.attempts === 1 ? '' : 's'}
              {row.lastAttemptAt ? `, last on ${whenLocal(row.lastAttemptAt)}` : ''}
            </p>
          ) : null}

          {row.reason ? (
            <p className="border-line bg-surface-2 text-muted mt-2.5 max-w-prose rounded-xl border px-3 py-2 text-[13px] leading-relaxed break-words">
              <span className="text-faint mr-2 font-mono text-[10px] tracking-[0.12em] uppercase">
                Staff only
              </span>
              {row.reason}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0">
          {confirming ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={busy}
              aria-label={`Lift the bar on ${who}`}
              onClick={() => setConfirming(true)}
            >
              Lift the bar
            </Button>
          )}
        </div>
      </div>

      {confirming ? (
        <div className="border-line-strong bg-surface-2 mt-3 rounded-xl border p-3">
          <p className="text-muted max-w-prose text-[13px] leading-relaxed">
            Lift the bar on {who}? They can enter this contest again from that moment. The
            blocked attempts counter goes with it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={busy}
              onClick={onLift}
            >
              Yes, lift it
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep the bar
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="bg-danger-soft text-danger mt-3 rounded-xl px-3 py-2 text-[13px] font-medium"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
