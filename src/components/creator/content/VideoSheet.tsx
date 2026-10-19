import { useRef } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { ExternalLink, Eye, Heart, MessageCircle, Play, Share2, X } from 'lucide-react';
import { TrendLine } from '@/components/charts';
import { Button } from '@/components/ui/Button';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { cn } from '@/lib/utils';
import { CONTENT_STATUS, videoIdFrom } from '@/lib/content';
import type { AdState } from '@/lib/creator/usePerformance';
import { Count, Money, NotReported, Stat } from './figures';
import { SpendVsGmv } from './SpendVsGmv';
import { toSeries, useVideoDaily } from './useVideoDaily';
import type { JoinedVideo, Sources } from './joined';

const AD_LINE: Record<AdState, string> = {
  running: 'Ads running',
  ran: 'Ads stopped',
  none: 'No ads',
};

/**
 * ONE VIDEO IN FULL: a bottom sheet on a phone, a centred dialog on a desktop.
 *
 * Same component, same markup, one breakpoint: `items-end` and a top-rounded
 * panel below `sm`, `items-center` and a fully rounded one above it. A sheet
 * and a dialog are the same object at two sizes, and two components would drift.
 *
 * BLUR BUDGET. This is layer three — the top bar and the page's one panel are
 * the other two — so the panel takes `wx-neo-raised` and NOTHING ELSE IN HERE
 * BLURS. The scrim is a flat black wash on purpose: `backdrop-blur` on it would
 * be a fourth layer, and every block inside takes the small, blur-free glass.
 *
 * WHAT IT SHOWS, from §9: the day-by-day GMV line, ad spend against GMV as two
 * bars on one scale, and the engagement numbers. All three are missing far more
 * often than they are present, so each one says which absence it is rather than
 * drawing a zero.
 */
export function VideoSheet({
  video,
  sources,
  onClose,
  onWatch,
  onEdit,
}: {
  video: JoinedVideo;
  sources: Sources;
  onClose: () => void;
  onWatch: () => void;
  onEdit?: (() => void) | undefined;
}) {
  const quiet = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'button' });

  const { row } = video;
  const meta = CONTENT_STATUS[row.status];
  const title = row.offer?.title ?? row.video_title ?? 'Your video';

  /* The day series is fetched ONLY while this sheet is open — see
     `useVideoDaily` for why it reads the daily table directly. */
  const daily = useVideoDaily(videoIdFrom(row));
  const series = toSeries(daily.data ?? []);
  const currency = series.currency ?? video.currency;


  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/70"
      />

      <m.div
        ref={panelRef}
        initial={quiet ? undefined : { opacity: 0, y: 24 }}
        animate={quiet ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="wx-neo-raised relative flex max-h-[92dvh] w-full max-w-[32rem] flex-col gap-4 overflow-y-auto rounded-t-xl p-4 sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl sm:p-5"
      >
        {/* ------------------------------------------------------ header -- */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted truncate text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
              {row.brand?.name ?? 'A brand'}
            </p>
            <p className="truncate text-[1rem] leading-[1.25] font-semibold">{title}</p>
            <span
              className={cn(
                'mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
                meta.tone === 'live'
                  ? 'bg-stage-live-soft text-stage-live'
                  : meta.tone === 'due'
                    ? 'bg-stage-due-soft text-stage-due'
                    : 'bg-stage-paid-soft text-stage-paid'
              )}
            >
              {meta.creatorLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* ------------------------------------------------ day by day -- */}
        <section className="flex flex-col gap-2">
          <h3 className="text-muted text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
            GMV by day
          </h3>
          {daily.isPending ? (
            <div className="wx-skeleton h-[13.75rem] rounded-md" />
          ) : daily.isError ? (
            <div className="wx-neo-inset flex flex-col items-start gap-2 rounded-md px-3 py-3">
              <p className="text-muted text-[0.8125rem] leading-[1.45]">
                Could not load.
              </p>
              <Button variant="secondary" size="sm" onClick={() => void daily.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <TrendLine
              data={series.gmv}
              spend={series.spend}
              spendScale="own"
              currency={currency}
              ariaLabel={`GMV for ${title} day by day, with ad spend drawn behind it on its own scale`}
            />
          )}
        </section>

        {/* --------------------------------------- spend against GMV -- */}
        <section className="wx-neo-raised-sm flex flex-col gap-3 rounded-lg p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-muted text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
              Ad spend against GMV
            </h3>
          </div>
          <SpendVsGmv spend={video.spend} gmv={video.gmv} currency={currency} />
          {video.adState ? (
            <p className="text-muted text-[0.75rem] leading-[1.4]">{AD_LINE[video.adState]}</p>
          ) : null}
        </section>

        {/* ------------------------------------------------ engagement -- */}
        <section className="flex flex-col gap-2">
          <h3 className="text-muted text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
            Engagement
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Views">
              <Eye className="text-muted mr-1.5 size-3.5 shrink-0" aria-hidden />
              <Count value={video.views} />
            </Stat>
            <Stat label="Likes">
              <Heart className="text-muted mr-1.5 size-3.5 shrink-0" aria-hidden />
              <Count value={video.likes} />
            </Stat>
            <Stat label="Comments">
              <MessageCircle className="text-muted mr-1.5 size-3.5 shrink-0" aria-hidden />
              <Count value={video.comments} />
            </Stat>
            <Stat label="Shares">
              <Share2 className="text-muted mr-1.5 size-3.5 shrink-0" aria-hidden />
              <Count value={video.shares} />
            </Stat>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Items sold">
              <Count value={video.orders} />
            </Stat>
            <Stat label="GMV">
              <Money value={video.gmv} currency={currency} />
            </Stat>
          </div>
        </section>

        {/* ----------------------------------------------- the details -- */}
        <dl className="wx-neo-inset flex flex-col gap-2 rounded-md px-3 py-2.5 text-[0.75rem]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Ad code</dt>
            <dd className="text-text min-w-0 truncate font-mono">{row.ad_code}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Filed</dt>
            <dd className="text-text">
              <time dateTime={row.created_at}>
                {new Date(row.created_at).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
            </dd>
          </div>
          {row.ad_authorized ? null : (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Ad authorisation</dt>
              <dd className="text-stage-due font-medium">Not marked authorised</dd>
            </div>
          )}
          {!video.perf && sources.ads === 'ok' ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Ad figures</dt>
              <dd>
                <NotReported />
              </dd>
            </div>
          ) : null}
        </dl>

        {row.decision_note ? (
          <p className="wx-neo-inset text-muted rounded-md px-3 py-2 text-[0.78125rem] leading-relaxed">
            {row.decision_note}
          </p>
        ) : null}

        {/* --------------------------------------------------- actions -- */}
        <div className="wx-tap-row flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onWatch}>
            <Play className="size-3.5" aria-hidden />
            Watch
          </Button>
          <a
            href={row.video_url}
            target="_blank"
            rel="noreferrer noopener"
            className="wx-neo-raised-sm wx-neo-press text-accent inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-semibold pointer-coarse:min-h-11"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Open on TikTok
          </a>
          {onEdit ? (
            <Button variant="ghost" size="sm" onClick={onEdit} className="ml-auto">
              Edit
            </Button>
          ) : null}
        </div>
      </m.div>
    </div>
  );
}
