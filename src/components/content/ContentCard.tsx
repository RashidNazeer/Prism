import { Button } from '@/components/ui/Button';
import { VideoThumb } from '@/components/content/VideoThumb';
import { cn } from '@/lib/utils';
import { CONTENT_STATUS, type ContentRow } from '@/lib/content';

/**
 * One posted video, on either side of the product.
 *
 * NEUTRAL, and that is the point. The admin content screen used to import this
 * straight out of `routes/app/Content`, which pulled a creator screen into the
 * admin bundle; `.oxlintrc.json` now fails the build for that, in both
 * directions.
 *
 * It contains NO role check and must never grow one. Everything staff-only
 * arrives through `children`, so a component that renders on a creator's screen
 * has no branch in it that could put another creator's facts there. A card that
 * decides for itself whether the viewer is staff is one wrong boolean away from
 * being the leak.
 */

const TONE = {
  live: { text: 'text-stage-live', soft: 'bg-stage-live-soft' },
  due: { text: 'text-stage-due', soft: 'bg-stage-due-soft' },
  paid: { text: 'text-stage-paid', soft: 'bg-stage-paid-soft' },
} as const;

export function ContentCard({
  row,
  onPlay,
  onEdit,
  aboutTheJob,
  children,
}: {
  row: ContentRow;
  onPlay: () => void;
  onEdit?: () => void;
  /**
   * Anything extra about the job behind this video, under the offer title.
   *
   * A SLOT, not a flag. The admin screen puts who filmed it and how much of
   * their job is left in here; the creator screen puts nothing, because they
   * already know both. This component never asks who is looking.
   */
  aboutTheJob?: React.ReactNode;
  /** The admin card slots its decision controls in here. */
  children?: React.ReactNode;
}) {
  const meta = CONTENT_STATUS[row.status];
  const tone = TONE[meta.tone];

  return (
    <article className="wx-neo-raised ease-brand flex h-full flex-col gap-3 rounded-xl p-3 transition-transform duration-300 hover:-translate-y-0.5">
      <VideoThumb row={row} onPlay={onPlay} />

      <div className="flex min-w-0 flex-1 flex-col gap-2 px-1 pb-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted min-w-0 truncate text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
            {row.brand?.name ?? 'A brand'}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
              tone.soft,
              tone.text
            )}
          >
            {meta.label}
          </span>
        </div>

        <p className="text-[0.875rem] leading-[1.3] font-semibold break-words">
          {row.offer?.title ?? 'An offer'}
        </p>

        {aboutTheJob}

        <p className="text-muted font-mono text-[0.71875rem] break-all">{row.ad_code}</p>

        {row.ad_authorized ? null : (
          <p className="text-stage-due text-[0.75rem] font-medium">Not marked authorised</p>
        )}

        {row.decision_note ? (
          <p className="text-muted border-line border-t pt-2 text-[0.78125rem] leading-relaxed">
            {row.decision_note}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <time dateTime={row.created_at} className="text-faint text-[0.71875rem]">
            {new Date(row.created_at).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
          </time>
          {onEdit ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
        </div>

        {children}
      </div>
    </article>
  );
}
