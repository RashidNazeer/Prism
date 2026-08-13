import { useMemo, useState, type FormEvent } from 'react';
import { Archive, Gift, Loader2, Pencil, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { money } from '@/lib/money';
import { useManageContest } from '@/lib/admin/useManageContest';
import type { ContestDeliverable, DeliverableKind } from '@/lib/admin/useContests';

/**
 * What this contest pays for, as rows.
 *
 * Three shapes live in one table and the admin picks the shape per row:
 *   fixed     do this many videos, get paid.
 *   rank      finish in this place, get paid.
 *   milestone reach this number, get paid.
 *
 * THE TITLE IS TYPED BY THE ADMIN ON ALL THREE, EVERY TIME (decision Q11).
 * Nothing here generates one and a blank is refused, because those words end up
 * on every entrant's frozen promise and they have to be the admin's words.
 *
 * RETIRE, NEVER DELETE (rule F3). There is no delete function for a reward row
 * in the database at all: once somebody holds frozen terms against a row, the
 * row is part of a promise, and deleting it would leave the promise pointing at
 * nothing. A retired row stays here, dimmed, and saving it active again brings
 * it back.
 *
 * NOTHING HERE IMPLIES A PLACING WAS COMPUTED. There is no GMV or view data in
 * this product. A ranked contest is judged by the sentence in
 * `contests.judging_basis` and settled by a person, which is why a ranked row on
 * a contest with no sentence is refused by the database, and why this screen
 * says so before the admin gets that far.
 */

interface Props {
  contestId: string;
  /** The contest's currency, for reading an amount back. Never converted. */
  currency: string;
  /**
   * The judging sentence AS SAVED, not as typed above. The database checks the
   * saved value, so a sentence sitting unsaved in the form would still be
   * refused, and a warning that read the form would quietly disagree with it.
   */
  savedJudgingBasis: string | null;
  rows: ContestDeliverable[];
  loading: boolean;
}

const KIND_LABEL: Record<DeliverableKind, string> = {
  fixed: 'Fixed',
  rank: 'Ranked',
  milestone: 'Milestone',
};

/*
 * Neutral, on purpose. Rule C1 keeps the three stage tokens for where one
 * creator's work and money have got to, so a reward SHAPE must not borrow one:
 * a ranked row is not "due" and a fixed row is not "paid".
 */
const KIND_CHIP = 'bg-surface-2 text-muted';

/** 1st, 2nd, 3rd, 4th, and the teens that break the pattern. */
function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
}

/** A plain figure, grouped. Not money: a threshold counts whatever the metric names. */
function figure(value: string | number | null): string {
  if (value === null || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '';
}

/**
 * The reward amount, in words rather than in zeroes.
 *
 * A row with no amount reads "Not set yet". Printing a currency formatted 0
 * there would be a number standing in for something nobody has decided, and
 * settlement refuses to award against a row carrying no amount anyway.
 */
function amountLabel(value: string | number | null, currency: string): string {
  if (value === null || value === '') return 'Not set yet';
  return money(value, currency);
}

/* ------------------------------------------------------------ reading in -- */

type Amount =
  { kind: 'empty' } | { kind: 'number'; value: number } | { kind: 'invalid'; message: string };

/**
 * Deliberately the same three answers as the budget box on the setup screen,
 * for the same reason: `Number('1,000')` is NaN, and treating that as "nothing
 * was typed" wipes a figure while showing a tick over the top of it.
 */
function readAmount(raw: string, noun: string, example: string): Amount {
  const t = raw.trim();
  if (!t) return { kind: 'empty' };

  const n = Number(t);
  if (!Number.isFinite(n)) {
    return { kind: 'invalid', message: `Give the ${noun} as a number, for example ${example}` };
  }
  if (n < 0) return { kind: 'invalid', message: `A ${noun} cannot be less than nothing` };
  if (n > 99_999_999)
    return { kind: 'invalid', message: `That ${noun} is larger than we can store` };
  return { kind: 'number', value: Math.round(n * 100) / 100 };
}

/** A whole number the database will take: 1 to 1000, the column's own bounds. */
function readWhole(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 1000 ? n : null;
}

/* ----------------------------------------------------------------- shapes -- */

/** Everything `deliverable.save` needs, already read out of the boxes. */
interface Parsed {
  id: string | null;
  kind: DeliverableKind;
  title: string;
  detail: string | null;
  videoCount: number | null;
  rankPosition: number | null;
  metric: string | null;
  threshold: number | null;
  rewardAmount: number | null;
  sortOrder: number;
  isActive: boolean;
}

interface Draft {
  id: string | null;
  kind: DeliverableKind;
  title: string;
  detail: string;
  videoCount: string;
  rankPosition: string;
  metric: string;
  threshold: string;
  rewardAmount: string;
  sortOrder: number;
  isActive: boolean;
}

const draftFrom = (row: ContestDeliverable): Draft => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  detail: row.detail ?? '',
  videoCount: row.videoCount === null ? '' : String(row.videoCount),
  rankPosition: row.rankPosition === null ? '' : String(row.rankPosition),
  metric: row.metric ?? '',
  threshold: row.threshold === null ? '' : String(row.threshold),
  rewardAmount: row.rewardAmount === null ? '' : String(row.rewardAmount),
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

const blankDraft = (sortOrder: number): Draft => ({
  id: null,
  kind: 'fixed',
  title: '',
  detail: '',
  videoCount: '',
  rankPosition: '',
  metric: '',
  threshold: '',
  rewardAmount: '',
  sortOrder,
  isActive: true,
});

/* ------------------------------------------------------------------ list -- */

export function ContestRewardRows({
  contestId,
  currency,
  savedJudgingBasis,
  rows,
  loading,
}: Props) {
  const manage = useManageContest();
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Keyed by row, because a refusal belongs against the row it is about. */
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const ordered = useMemo(() => {
    // Live work first, retired underneath, each in the order the admin set.
    return [...rows].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
  }, [rows]);

  const nextSortOrder = useMemo(() => {
    const highest = rows.reduce((max, r) => Math.max(max, r.sortOrder), 0);
    return Math.min(highest + 1, 9999);
  }, [rows]);

  const busy = manage.isPending;

  async function save(parsed: Parsed): Promise<string | null> {
    try {
      await manage.mutateAsync({
        action: 'deliverable.save',
        deliverableId: parsed.id,
        contestId,
        kind: parsed.kind,
        title: parsed.title,
        detail: parsed.detail,
        videoCount: parsed.videoCount,
        rankPosition: parsed.rankPosition,
        metric: parsed.metric,
        threshold: parsed.threshold,
        rewardAmount: parsed.rewardAmount,
        sortOrder: parsed.sortOrder,
        isActive: parsed.isActive,
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'That reward row did not save';
    }
  }

  async function onRetire(row: ContestDeliverable) {
    setRowError((e) => ({ ...e, [row.id]: '' }));
    try {
      await manage.mutateAsync({ action: 'deliverable.retire', deliverableId: row.id });
    } catch (err) {
      setRowError((e) => ({
        ...e,
        [row.id]: err instanceof Error ? err.message : 'That row could not be retired',
      }));
    }
  }

  /** Bringing a row back is the same call that made it, sent active again. */
  async function onRestore(row: ContestDeliverable) {
    setRowError((e) => ({ ...e, [row.id]: '' }));
    const message = await save({
      id: row.id,
      kind: row.kind,
      title: row.title,
      detail: row.detail,
      videoCount: row.videoCount === null ? null : Number(row.videoCount),
      rankPosition: row.rankPosition === null ? null : Number(row.rankPosition),
      metric: row.metric,
      threshold: row.threshold === null ? null : Number(row.threshold),
      rewardAmount: row.rewardAmount === null ? null : Number(row.rewardAmount),
      sortOrder: row.sortOrder,
      isActive: true,
    });
    if (message) setRowError((e) => ({ ...e, [row.id]: message }));
  }

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-[20px] border p-5 shadow-md">
      <div>
        <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
          What it pays
        </h2>
        <p className="text-faint mt-1.5 max-w-prose text-[12px]">
          Every creator who enters is promised these rows exactly as they read on the day they
          enter. Changing a row later never changes what somebody was already promised.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="wx-skeleton h-[92px] rounded-[20px]" />
          <div className="wx-skeleton h-[92px] rounded-[20px]" />
        </div>
      ) : ordered.length === 0 && !draft ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-[20px] border border-dashed p-6">
          <div className="bg-surface-3 border-line-strong grid size-11 place-items-center rounded-[14px] border">
            <Gift size={19} className="text-muted" aria-hidden />
          </div>
          <h3 className="font-display text-text text-[19px] leading-tight font-bold">
            Nothing is on offer yet
          </h3>
          <p className="text-muted max-w-prose text-[14px] leading-relaxed">
            A reward row is one promise: what a creator does, and what they get for it. Add as
            many as this contest needs, and every creator who enters carries a frozen copy of
            them.
          </p>
          <Button type="button" onClick={() => setDraft(blankDraft(nextSortOrder))}>
            <Plus size={16} aria-hidden />
            Add a reward row
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordered.map((row) =>
            draft && draft.id === row.id ? (
              <li key={row.id}>
                <RewardEditor
                  initial={draft}
                  currency={currency}
                  savedJudgingBasis={savedJudgingBasis}
                  busy={busy}
                  onCancel={() => setDraft(null)}
                  onSave={async (parsed) => {
                    const message = await save(parsed);
                    if (!message) setDraft(null);
                    return message;
                  }}
                />
              </li>
            ) : (
              <li key={row.id}>
                <RewardRow
                  row={row}
                  currency={currency}
                  busy={busy}
                  error={rowError[row.id] ?? ''}
                  onEdit={() => {
                    setRowError((e) => ({ ...e, [row.id]: '' }));
                    setDraft(draftFrom(row));
                  }}
                  onRetire={() => void onRetire(row)}
                  onRestore={() => void onRestore(row)}
                />
              </li>
            )
          )}
        </ul>
      )}

      {draft && draft.id === null ? (
        <RewardEditor
          initial={draft}
          currency={currency}
          savedJudgingBasis={savedJudgingBasis}
          busy={busy}
          onCancel={() => setDraft(null)}
          onSave={async (parsed) => {
            const message = await save(parsed);
            if (!message) setDraft(null);
            return message;
          }}
        />
      ) : !draft && ordered.length > 0 ? (
        <div className="flex">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDraft(blankDraft(nextSortOrder))}
          >
            <Plus size={16} aria-hidden />
            Add a reward row
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------- row -- */

function RewardRow({
  row,
  currency,
  busy,
  error,
  onEdit,
  onRetire,
  onRestore,
}: {
  row: ContestDeliverable;
  currency: string;
  busy: boolean;
  error: string;
  onEdit: () => void;
  onRetire: () => void;
  onRestore: () => void;
}) {
  const shape =
    row.kind === 'fixed'
      ? row.videoCount === null
        ? 'Videos not set yet'
        : `${row.videoCount} video${row.videoCount === 1 ? '' : 's'}`
      : row.kind === 'rank'
        ? row.rankPosition === null
          ? 'Place not set yet'
          : `${ordinal(row.rankPosition)} place`
        : row.threshold === null || !row.metric
          ? 'Milestone not set yet'
          : `${figure(row.threshold)} ${row.metric}`;

  return (
    <div
      className={cn(
        'bg-surface-1 rounded-[20px] border p-4',
        row.isActive ? 'border-line' : 'border-line border-dashed opacity-70'
      )}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em]',
                KIND_CHIP
              )}
            >
              {KIND_LABEL[row.kind]}
            </span>
            <span className="text-muted font-mono text-[12px]">{shape}</span>
            {!row.isActive ? (
              <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
                Retired
              </span>
            ) : null}
          </div>

          <p className="text-text mt-2 text-[15px] font-semibold break-words">{row.title}</p>

          {row.detail ? (
            <p className="text-muted mt-1 max-w-prose text-[13px] leading-relaxed break-words">
              {row.detail}
            </p>
          ) : null}
        </div>

        <div className="shrink-0">
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            Reward
          </span>
          <span
            className={cn(
              'wx-numeric font-display mt-0.5 block text-[17px] font-bold',
              row.rewardAmount === null ? 'text-faint' : 'text-text'
            )}
          >
            {amountLabel(row.rewardAmount, currency)}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil size={15} aria-hidden />
            Edit
          </Button>
          {row.isActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={busy}
              onClick={onRetire}
            >
              <Archive size={15} aria-hidden />
              Retire
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={busy}
              onClick={onRestore}
            >
              <Undo2 size={15} aria-hidden />
              Bring it back
            </Button>
          )}
        </div>
      </div>

      {!row.isActive ? (
        <p className="text-faint mt-3 max-w-prose text-[12px] leading-relaxed">
          Retired rows are off the contest for anybody entering from now on. Every creator who
          was already promised this one still holds it, and is still paid for it.
        </p>
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

/* ---------------------------------------------------------------- editor -- */

type EditorErrors = Partial<
  Record<
    'title' | 'videoCount' | 'rankPosition' | 'metric' | 'threshold' | 'rewardAmount',
    string
  >
>;

function RewardEditor({
  initial,
  currency,
  savedJudgingBasis,
  busy,
  onCancel,
  onSave,
}: {
  initial: Draft;
  currency: string;
  savedJudgingBasis: string | null;
  busy: boolean;
  onCancel: () => void;
  /** Returns the refusal to print against this row, or null when it went through. */
  onSave: (parsed: Parsed) => Promise<string | null>;
}) {
  const [values, setValues] = useState<Draft>(initial);
  const [errors, setErrors] = useState<EditorErrors>({});
  const [serverError, setServerError] = useState('');

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setValues((d) => ({ ...d, [k]: v }));
    setServerError('');
    setErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k as keyof EditorErrors];
      return next;
    });
  };

  const needsJudging = values.kind === 'rank' && values.isActive && !savedJudgingBasis?.trim();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: EditorErrors = {};

    const title = values.title.trim();
    if (!title) next.title = 'Give this reward row a short name';

    let videoCount: number | null = null;
    let rankPosition: number | null = null;
    let metric: string | null = null;
    let threshold: number | null = null;

    if (values.kind === 'fixed') {
      videoCount = readWhole(values.videoCount);
      if (videoCount === null) {
        next.videoCount = values.videoCount.trim()
          ? 'Give a whole number of videos, 1 to 1000'
          : 'How many videos does this row ask for?';
      }
    }

    if (values.kind === 'rank') {
      rankPosition = readWhole(values.rankPosition);
      if (rankPosition === null) {
        next.rankPosition = values.rankPosition.trim()
          ? 'A place is a whole number, 1 to 1000'
          : 'Which place does this row pay for?';
      }
    }

    if (values.kind === 'milestone') {
      metric = values.metric.trim();
      if (!metric) next.metric = 'What is being counted? For example, dollars of sales';

      const read = readAmount(values.threshold, 'target', '1000');
      if (read.kind === 'empty') next.threshold = 'What number do they have to reach?';
      else if (read.kind === 'invalid') next.threshold = read.message;
      else threshold = read.value;
    }

    const reward = readAmount(values.rewardAmount, 'reward', '250');
    if (reward.kind === 'invalid') next.rewardAmount = reward.message;

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});

    const message = await onSave({
      id: values.id,
      kind: values.kind,
      title,
      detail: values.detail.trim() || null,
      videoCount,
      rankPosition,
      metric,
      threshold,
      rewardAmount: reward.kind === 'number' ? reward.value : null,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
    });

    if (message) setServerError(message);
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      aria-busy={busy}
      className="border-line-strong bg-surface-2 flex flex-col gap-4 rounded-[20px] border p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={values.kind}
              onChange={(e) => set('kind', e.target.value as DeliverableKind)}
              disabled={busy}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              <option value="fixed">Do the work, get paid</option>
              <option value="rank">Finish in a place, get paid</option>
              <option value="milestone">Reach a number, get paid</option>
            </Select>
          )}
        </Field>

        <Field
          label="Name"
          error={errors.title}
          hint="Your words. Nothing writes this for you, and every entrant reads it."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={160}
              readOnly={busy}
              placeholder="e.g. 3 in-feed videos"
              aria-describedby={describedBy}
              invalid={invalid}
              required
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {values.kind === 'fixed' ? (
          <Field label="Videos" error={errors.videoCount}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                value={values.videoCount}
                onChange={(e) => set('videoCount', e.target.value)}
                readOnly={busy}
                placeholder="e.g. 3"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        ) : null}

        {values.kind === 'rank' ? (
          <Field
            label="Place"
            error={errors.rankPosition}
            hint="1 is first. Two rows cannot claim the same place."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                value={values.rankPosition}
                onChange={(e) => set('rankPosition', e.target.value)}
                readOnly={busy}
                placeholder="e.g. 1"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
        ) : null}

        {values.kind === 'milestone' ? (
          <>
            <Field label="What is counted" error={errors.metric}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={values.metric}
                  onChange={(e) => set('metric', e.target.value)}
                  maxLength={40}
                  readOnly={busy}
                  placeholder="e.g. dollars of sales"
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="Number to reach" error={errors.threshold}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={values.threshold}
                  onChange={(e) => set('threshold', e.target.value)}
                  readOnly={busy}
                  placeholder="e.g. 1000"
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </>
        ) : null}

        <Field
          label={`Reward, ${currency}`}
          error={errors.rewardAmount}
          hint="Leave it empty and this row reads Not set yet."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="decimal"
              value={values.rewardAmount}
              onChange={(e) => set('rewardAmount', e.target.value)}
              readOnly={busy}
              placeholder="e.g. 250"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      <Field
        label="Detail"
        hint="Optional. Anything a creator needs to know about this one row."
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            value={values.detail}
            onChange={(e) => set('detail', e.target.value)}
            rows={2}
            maxLength={1000}
            readOnly={busy}
            placeholder="e.g. Parent facing, filmed at home, no music over the voiceover."
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {/*
        Said BEFORE the database says it. A ranked prize on a contest with no
        judging sentence is refused outright, and being told that after typing
        the whole row is a worse way to learn it.
      */}
      {needsJudging ? (
        <p className="bg-info-soft text-info rounded-xl px-3 py-2 text-[13px] leading-relaxed font-medium">
          This contest does not say how it is judged yet. Fill in "How it is judged" at the top
          of this screen and save it first, or the database will refuse a ranked prize.
        </p>
      ) : null}

      {serverError ? (
        <p
          role="alert"
          className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-[13px] font-medium"
        >
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {values.id ? 'Save this row' : 'Add this row'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
