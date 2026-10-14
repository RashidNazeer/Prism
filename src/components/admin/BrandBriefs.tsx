import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { ClipboardList, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataError } from '@/components/ui/DataState';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import { useBriefs, type BrandBrief } from '@/lib/admin/useBrands';
import { briefSchema, collectFieldErrors, type BriefInput } from '@/lib/schemas/brand';
import { cn } from '@/lib/utils';

/**
 * Step three of a hub: what a creator should make.
 *
 * A brief is a title, a plain description of the idea, a few hooks to open
 * with, and two short lists, what to do and what to avoid. Most brands have one;
 * a brand with two focus products may have two. Creators read these in the hub
 * before they film, so the words are theirs to read and ours to keep short.
 */
export function BrandBriefs({ brandId, brandName }: { brandId: string; brandName: string }) {
  const { data: briefs, isLoading, isError, refetch } = useBriefs(brandId);
  const [dialog, setDialog] = useState<{ brief?: BrandBrief } | null>(null);

  const rows = briefs ?? [];

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-[0.875rem] leading-relaxed">
          {rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? 'brief' : 'briefs'} creators can read before they film.`
            : 'What to make, the hooks, the do’s and the don’ts.'}
        </p>
        <Button onClick={() => setDialog({})} className="min-h-[44px] shrink-0 sm:min-h-0">
          <Plus size={15} aria-hidden />
          New brief
        </Button>
      </div>

      {isLoading ? (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-48 rounded-xl" />
          ))}
        </ul>
      ) : isError ? (
        <DataError
          className="mt-4"
          title="The briefs would not load"
          body="Nothing has been changed. Try again in a moment."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="wx-neo-raised mt-4 rounded-xl px-6 py-12 text-center shadow-md">
          <ClipboardList size={24} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">No brief yet</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            A brief tells creators what {brandName} wants them to make, so they start from
            something specific instead of a blank screen.
          </p>
          <Button className="mt-6" onClick={() => setDialog({})}>
            <Plus size={16} aria-hidden />
            Write the first brief
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {rows.map((brief) => (
            <li key={brief.id}>
              <BriefCard brief={brief} onEdit={() => setDialog({ brief })} />
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <BriefDialog
          brandId={brandId}
          {...(dialog.brief ? { brief: dialog.brief } : {})}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- card ----- */

function BriefList({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-muted text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        {label}
      </p>
      <ul className="mt-1.5 grid gap-1">
        {items.map((line, i) => (
          <li key={i} className="flex gap-2 text-[0.875rem] leading-relaxed">
            <span
              aria-hidden
              className={cn('mt-[0.55em] size-1.5 shrink-0 rounded-full', tone)}
            />
            <span className="min-w-0 break-words">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BriefCard({ brief, onEdit }: { brief: BrandBrief; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const manage = useManageBrand();

  const empty =
    !brief.what_to_make &&
    brief.hooks.length === 0 &&
    brief.dos.length === 0 &&
    brief.donts.length === 0;

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-xl p-5',
        brief.is_active ? 'wx-neo-raised' : 'bg-surface-1 shadow-md'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-lg font-bold break-words">{brief.title}</h3>
        {!brief.is_active ? (
          <span className="wx-neo-raised text-muted rounded-full px-2.5 py-0.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
            Hidden from creators
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-4">
        {brief.what_to_make ? (
          <p className="text-muted text-[0.875rem] leading-relaxed whitespace-pre-line">
            {brief.what_to_make}
          </p>
        ) : null}
        <BriefList label="Hooks to open with" items={brief.hooks} tone="bg-accent" />
        <BriefList label="Do" items={brief.dos} tone="bg-success" />
        <BriefList label="Avoid" items={brief.donts} tone="bg-danger" />
        {empty ? (
          <p className="text-faint text-[0.8125rem]">
            Nothing written yet. Open it to add the idea, hooks and guidance.
          </p>
        ) : null}
      </div>

      {confirming ? (
        <div className="bg-danger-soft mt-4 rounded-xl p-4">
          <p className="text-danger text-[0.8125rem] leading-relaxed font-medium">
            Delete this brief? It goes for good, though the audit log keeps a record of what it
            was.
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
              onClick={() => manage.mutate({ action: 'brief.delete', briefId: brief.id })}
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
      ) : (
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={onEdit}
            className="min-h-[44px] sm:min-h-0"
          >
            <Pencil size={14} aria-hidden />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${brief.title}`}
            onClick={() => setConfirming(true)}
            className="min-h-[44px] sm:min-h-0"
          >
            <Trash2 size={14} aria-hidden />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- dialog ----- */

function BriefDialog({
  brandId,
  brief,
  onClose,
}: {
  brandId: string;
  /** Absent means create. */
  brief?: BrandBrief;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'input' });

  const [values, setValues] = useState<BriefInput>({
    title: brief?.title ?? '',
    whatToMake: brief?.what_to_make ?? '',
    // One line per row in the box, so the lists are typed the way they are read.
    hooks: (brief?.hooks ?? []).join('\n'),
    dos: (brief?.dos ?? []).join('\n'),
    donts: (brief?.donts ?? []).join('\n'),
    isActive: brief?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const save = useManageBrand();
  const busy = save.isPending;

  const set = <K extends keyof BriefInput>(key: K, value: BriefInput[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(collectFieldErrors(briefSchema, next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const next = collectFieldErrors(briefSchema, values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const parsed = briefSchema.parse(values);
    save.mutate(
      {
        action: 'brief.save',
        briefId: brief?.id ?? null,
        brandId,
        title: parsed.title,
        whatToMake: parsed.whatToMake || null,
        hooks: parsed.hooks,
        dos: parsed.dos,
        donts: parsed.donts,
        isActive: parsed.isActive,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={brief ? `Edit ${brief.title}` : 'New brief'}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => !busy && onClose()}
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="wx-neo-raised relative max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl p-6 sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">{brief ? 'Edit brief' : 'New brief'}</h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-5">
          <FormError>{save.error ? (save.error as Error).message : ''}</FormError>

          <div className="grid gap-5">
            <Field label="Title" error={errors.title}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  name="title"
                  maxLength={120}
                  placeholder="e.g. Morning routine, hero product"
                  value={values.title}
                  disabled={busy}
                  onChange={(e) => set('title', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field
              label="What to make"
              error={errors.whatToMake}
              hint="The idea in plain words. Optional."
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name="whatToMake"
                  maxLength={2000}
                  rows={4}
                  placeholder="e.g. A 30 to 45 second video showing the cream in a real routine."
                  value={values.whatToMake}
                  disabled={busy}
                  onChange={(e) => set('whatToMake', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <Field
              label="Hooks"
              error={errors.hooks}
              hint="Opening lines that work. One per line, up to ten. Optional."
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  name="hooks"
                  rows={3}
                  placeholder={
                    'e.g. I did not expect this to work\nThree things I wish I knew sooner'
                  }
                  value={values.hooks}
                  disabled={busy}
                  onChange={(e) => set('hooks', e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Do" error={errors.dos} hint="One per line. Optional.">
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    name="dos"
                    rows={4}
                    placeholder={'e.g. Show the product in use\nFilm in natural light'}
                    value={values.dos}
                    disabled={busy}
                    onChange={(e) => set('dos', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Avoid" error={errors.donts} hint="One per line. Optional.">
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    name="donts"
                    rows={4}
                    placeholder={'e.g. Health claims\nCompetitor names'}
                    value={values.donts}
                    disabled={busy}
                    onChange={(e) => set('donts', e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>
            </div>

            <label className="wx-neo-inset flex cursor-pointer items-start gap-3 rounded-xl p-4">
              <input
                type="checkbox"
                name="isActive"
                checked={values.isActive}
                disabled={busy}
                onChange={(e) => set('isActive', e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--wx-accent)]"
              />
              <span>
                <span className="block text-[0.875rem] font-medium">Show to creators</span>
                <span className="text-muted mt-0.5 block text-[0.8125rem] leading-relaxed">
                  Untick to keep a draft that creators cannot see yet.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : brief ? 'Save changes' : 'Save brief'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </m.div>
    </div>
  );
}
