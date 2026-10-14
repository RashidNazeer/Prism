import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { m } from 'motion/react';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { DataError } from '@/components/ui/DataState';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { cn } from '@/lib/utils';
import { type ContentRow } from '@/lib/content';
import { useMyContentMutation } from '@/lib/creator/useMyContent';
import type { MyWorkRow } from '@/lib/creator/useMyWork';
import { useMyJobProgress, type JobProgress } from '@/lib/work/job-progress';

/**
 * Posting a video against a job, and fixing one already posted.
 *
 * The two dropdowns are deliberately in that order: brand, then the offer
 * inside it. A creator thinks "the BruMate one", not "application
 * 8f3c...". Picking the pair is what identifies the job, and the moment it is
 * picked the form says what that job asked for and how much of it is in, which
 * is the number they actually came here to check.
 *
 * Only jobs they are approved on can be chosen. That is enforced again in the
 * database, which matches on `creator_id` as well as the id, so a doctored
 * request cannot post onto somebody else's work.
 */
/**
 * What the creator typed, checked before anything is sent. The database checks
 * it again; this is only so a typo is caught while the form is still in front
 * of them.
 */
const postSchema = z.object({
  applicationId: z.string().min(1, 'Pick which job this is for'),
  videoUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/\S+$/i, 'Paste the full link to the post, starting with https://'),
  adCode: z.string().trim().min(3, 'That ad code looks too short'),
});
/** The tail of an option label: what this job is still short of. */
function needLabel(p: JobProgress | undefined): string {
  if (!p || p.required === null) return '';
  if (p.done) return ' (covered)';
  if (p.remaining === 1) return ' (1 to go)';
  return ` (${p.remaining} to go)`;
}

export function PostContentDialog({
  jobs,
  editing,
  presetApplicationId,
  onClose,
}: {
  /** Their approved work, which is the only thing content can attach to. */
  jobs: MyWorkRow[];
  editing?: ContentRow | null;
  presetApplicationId?: string | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: '[aria-haspopup="listbox"], input' });

  const mutate = useMyContentMutation();
  const busy = mutate.isPending;
  const { data: progressByJob } = useMyJobProgress();

  /**
   * A job is SHORT when a number was agreed and it has not been reached.
   *
   * A job with no fixed count can never be short, so it neither wins the guess
   * below nor blocks it. Without that rule a commission-only job would either
   * be picked at random or would suppress the guess for somebody with exactly
   * one real job to film.
   */
  const short = (id: string) => {
    const p = progressByJob?.get(id);
    return Boolean(p && p.required !== null && !p.done);
  };

  /*
   * Where the dialog opens.
   *
   * Editing pins it to that video's job. A link from a card pins it to that
   * card's job. Otherwise, if exactly one job is short, that is the one they
   * came here for and guessing it saves two taps on a phone. Two or more and
   * we ask, because picking the wrong job posts a video against the wrong deal.
   */
  const guess = jobs.filter((j) => short(j.id));
  const startingJob = editing
    ? (jobs.find((j) => j.id === editing.application_id) ?? null)
    : (jobs.find((j) => j.id === presetApplicationId) ??
      (guess.length === 1 ? guess[0] : null));

  /*
   * Fewer taps for the common case. Somebody working with one brand should not
   * have to pick it, and somebody with exactly one job in total should not have
   * to pick that either. Anyone with a real choice is still asked.
   */
  const brandIdsOnJobs = new Set(jobs.map((j) => j.brand_id));
  const soleBrandId = brandIdsOnJobs.size === 1 ? ([...brandIdsOnJobs][0] ?? '') : '';
  const soleJob = !editing && jobs.length === 1 ? (jobs[0] ?? null) : null;

  const [brandId, setBrandId] = useState(startingJob?.brand_id ?? soleBrandId);
  const [applicationId, setApplicationId] = useState(startingJob?.id ?? soleJob?.id ?? '');
  const [videoUrl, setVideoUrl] = useState(editing?.video_url ?? '');
  const [adCode, setAdCode] = useState(editing?.ad_code ?? '');
  const [authorized, setAuthorized] = useState(editing?.ad_authorized ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const job of jobs) if (job.brand) seen.set(job.brand.id, job.brand.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs]);

  const jobsForBrand = useMemo(
    () => jobs.filter((j) => j.brand_id === brandId),
    [jobs, brandId]
  );

  const job = jobs.find((j) => j.id === applicationId) ?? null;
  /*
   * From the view, not from arithmetic in here, and measured against the count
   * FROZEN ON THE JOB rather than whatever the offer says today. This used to
   * read `job.offer.video_count`, which meant re-scoping an offer silently
   * changed how many videos somebody already filming still owed.
   */
  const progress: JobProgress | null = job ? (progressByJob?.get(job.id) ?? null) : null;

  const validate = () => {
    const parsed = postSchema.safeParse({
      // Editing never changes the job, so it cannot be the thing that blocks a save.
      applicationId: editing ? editing.application_id : applicationId,
      videoUrl,
      adCode,
    });
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!next[key]) next[key] = issue.message;
      }
    }
    return next;
  };

  /*
   * WHAT THEY TYPED SURVIVES EVERYTHING. The form state lives here and this
   * component stays mounted through a failed send, so an error only ever adds a
   * message; it never clears a field. Closing by tapping the backdrop is also
   * ignored once there is something typed, because a stray tap on a phone is
   * the other way to lose a half-filled form.
   */
  const dirty = videoUrl !== (editing?.video_url ?? '') || adCode !== (editing?.ad_code ?? '');

  const requestClose = () => {
    if (!busy) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const send = () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    mutate.mutate(
      editing
        ? {
            action: 'content.update',
            contentId: editing.id,
            videoUrl: videoUrl.trim(),
            adCode: adCode.trim(),
            adAuthorized: authorized,
          }
        : {
            action: 'content.create',
            applicationId,
            videoUrl: videoUrl.trim(),
            adCode: adCode.trim(),
            adAuthorized: authorized,
          },
      { onSuccess: onClose }
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  const remove = () => {
    if (!editing) return;
    mutate.mutate({ action: 'content.delete', contentId: editing.id }, { onSuccess: onClose });
  };

  const title = editing ? 'Edit this video' : 'Add a video';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => !dirty && requestClose()}
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      {/*
        ONE SURFACE, TWO SHAPES. Under the sm breakpoint it is a sheet: pinned to
        the bottom edge, rounded on top only, rising from below, with a grip and
        a footer that stays put so the Add button is always under the thumb. From
        sm up it is the same panel centred as a modal.
      */}
      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="wx-neo-raised relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl sm:max-h-[calc(100dvh-3rem)] sm:max-w-xl sm:rounded-xl"
      >
        <span
          aria-hidden
          className="bg-line-strong mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full sm:hidden"
        />

        <div className="flex items-start justify-between gap-4 px-5 pt-3 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <p className="text-muted mt-1 text-[0.875rem]">
              {editing
                ? 'Fix the link or the code and it goes back to the team.'
                : 'Pick the job, paste the link to your post and its ad code.'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-2 sm:px-7">
            {editing ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Brand"
                  error={errors.applicationId && !brandId ? errors.applicationId : undefined}
                >
                  {({ id }) => (
                    <Select
                      id={id}
                      name="brand"
                      value={brandId}
                      disabled={busy}
                      onChange={(e) => {
                        const nextBrand = e.target.value;
                        setBrandId(nextBrand);
                        // A brand with one offer needs no second tap.
                        const options = jobs.filter((j) => j.brand_id === nextBrand);
                        setApplicationId(options.length === 1 ? (options[0]?.id ?? '') : '');
                      }}
                    >
                      <option value="">Pick a brand</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  label="Offer"
                  error={errors.applicationId && brandId ? errors.applicationId : undefined}
                >
                  {({ id }) => (
                    <Select
                      id={id}
                      name="offer"
                      value={applicationId}
                      disabled={busy || !brandId}
                      onChange={(e) => setApplicationId(e.target.value)}
                    >
                      <option value="">{brandId ? 'Pick an offer' : 'Brand first'}</option>
                      {/* Each one says what it still needs, so the choice can be
                          made from the list rather than by picking one and
                          reading the panel underneath. */}
                      {jobsForBrand.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.offer?.title ?? 'An offer'}
                          {needLabel(progressByJob?.get(j.id))}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            )}

            {/* What this job asked for, and where it has got to. The number they
                came to check, so it sits above the fields rather than under. */}
            {progress ? (
              <div className={cn('wx-neo-inset rounded-lg px-4 py-3.5', editing ? '' : 'mt-4')}>
                {progress.required === null ? (
                  <p className="text-[0.875rem] leading-relaxed">
                    This one has no set number of videos. Post what you agreed and the team will
                    confirm.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-[0.875rem] font-semibold">
                        {progress.approved} of {progress.required} approved
                      </span>
                      <span className="text-muted text-[0.8125rem]">
                        {progress.done
                          ? 'This job is covered'
                          : `${progress.remaining} still to come`}
                      </span>
                    </div>
                    <div className="wx-neo-inset mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
                      {Array.from({ length: progress.required }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-full flex-1 rounded-full',
                            i < progress.approved
                              ? 'bg-stage-paid'
                              : i < progress.approved + progress.waiting
                                ? 'bg-stage-live'
                                : 'bg-line'
                          )}
                        />
                      ))}
                    </div>
                    {progress.waiting > 0 ? (
                      <p className="text-muted mt-2 text-[0.78125rem]">
                        {progress.waiting} more with the team
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4">
              <Field
                label="Video link"
                error={errors.videoUrl}
                hint="The link to your post, exactly as it appears in the app."
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="videoUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://www.tiktok.com/@you/video/..."
                    value={videoUrl}
                    disabled={busy}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Ad code" error={errors.adCode}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="adCode"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="Paste the code for this video"
                    value={adCode}
                    disabled={busy}
                    onChange={(e) => setAdCode(e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    className="font-mono"
                  />
                )}
              </Field>

              {/* Their statement, recorded as theirs. We cannot check it from
                  here, so the wording never claims we did. */}
              <button
                type="button"
                role="switch"
                aria-checked={authorized}
                disabled={busy}
                onClick={() => setAuthorized((v) => !v)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left transition-colors duration-200 disabled:opacity-60',
                  authorized ? 'bg-stage-paid-soft' : 'wx-neo-inset'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
                    authorized ? 'bg-stage-paid' : 'bg-line-strong'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[transform,opacity,background-color,border-color,color] duration-200',
                      authorized ? 'left-[1.375rem]' : 'left-0.5'
                    )}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-semibold">Authorised</span>
                  <span className="text-muted block text-[0.78125rem] leading-relaxed">
                    Turn this on once the code is live on your side.
                  </span>
                </span>
                {authorized ? (
                  <Check size={16} aria-hidden className="text-stage-paid ml-auto shrink-0" />
                ) : null}
              </button>
            </div>

            {/* A FAILED SEND ADDS A MESSAGE AND NOTHING ELSE. Every field above
                is still filled in, and Try again sends exactly what is there. */}
            {mutate.isError ? (
              <DataError
                className="mt-5"
                title="That did not go through"
                body={`${(mutate.error as Error).message || 'Something went wrong on our side.'} Everything you typed is still here.`}
                onRetry={send}
              />
            ) : null}
          </div>

          {/* The footer does not scroll away, so on a phone the button is always
              in reach however long the form gets. */}
          <div className="flex flex-wrap items-center gap-2.5 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-7 sm:pb-7">
            <Button type="submit" disabled={busy} className="max-sm:flex-1">
              {busy ? <Loader2 size={16} aria-hidden className="animate-spin" /> : null}
              {busy ? 'Sending...' : editing ? 'Save changes' : 'Add video'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={requestClose}>
              Cancel
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={remove}
                className="text-danger hover:text-danger ml-auto"
              >
                <Trash2 size={15} aria-hidden />
                Remove
              </Button>
            ) : null}
          </div>
        </form>
      </m.div>
    </div>
  );
}
