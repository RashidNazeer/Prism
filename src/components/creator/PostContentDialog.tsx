import { useMemo, useRef, useState } from 'react';
import { m } from 'motion/react';
import { Check, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { FormError } from '@/components/auth/AuthShell';
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
  useFocusTrap(panelRef, { initialSelector: 'select, input' });

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

  const [brandId, setBrandId] = useState(startingJob?.brand_id ?? '');
  const [applicationId, setApplicationId] = useState(startingJob?.id ?? '');
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
    const next: Record<string, string> = {};
    if (!applicationId) next.applicationId = 'Pick which job this is for';
    if (!/^https:\/\/\S+$/i.test(videoUrl.trim())) {
      next.videoUrl = 'Paste the full link to the post, starting with https://';
    }
    if (adCode.trim().length < 3) next.adCode = 'That ad code looks too short';
    return next;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
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

  const remove = () => {
    if (!editing) return;
    mutate.mutate({ action: 'content.delete', contentId: editing.id }, { onSuccess: onClose });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit this video' : 'Add a video'}
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
        className="wx-neo-raised relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] p-6 sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {editing ? 'Edit this video' : 'Add a video'}
            </h2>
            <p className="text-muted mt-1 text-[0.875rem]">
              {editing
                ? 'Fix the link or the code and it goes back to the team.'
                : 'Paste the link to your post and its ad code.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-6">
          <FormError>{mutate.error ? (mutate.error as Error).message : ''}</FormError>

          {editing ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand" error={errors.applicationId}>
                {({ id }) => (
                  <Select
                    id={id}
                    name="brand"
                    value={brandId}
                    disabled={busy}
                    onChange={(e) => {
                      setBrandId(e.target.value);
                      setApplicationId('');
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

              <Field label="Offer">
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
            <div className="wx-neo-inset mt-4 rounded-lg px-4 py-3.5">
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
                'flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors duration-200',
                authorized
                  ? 'bg-stage-paid-soft border-stage-paid/40'
                  : 'wx-neo-inset border-transparent'
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
                    'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all duration-200',
                    authorized ? 'left-[22px]' : 'left-0.5'
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

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending...' : editing ? 'Save changes' : 'Add video'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
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
