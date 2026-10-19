import { useState } from 'react';
import { Eye, Heart, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CONTENT_STATUS } from '@/lib/content';
import { Count, Money } from './figures';
import type { JoinedVideo, Sources } from './joined';

/**
 * ONE VIDEO, AS A TILE IN THE GRID.
 *
 * MATERIAL: `wx-neo-raised-sm`, which is the same glass as a panel with the
 * BLUR DROPPED. That is not a detail on this page, it is the page's whole
 * performance budget: the grid holds twenty of these at a time and a phone
 * compositing twenty `backdrop-filter` layers over the aurora is the most
 * expensive thing this redesign could ask of it. The one blurred layer belongs
 * to the panel these sit inside (see `Content.tsx`), so the glass still reads
 * and the cost is paid once.
 *
 * THE WHOLE FACE OPENS THE SHEET, and it does it with a stretched button over
 * the card rather than by wrapping the card in one. A button cannot contain a
 * button, and these cards carry info dots that have to be tappable on their own
 * — "why is this missing" must not also open the sheet. The overlay sits under
 * them (`z-10` against the dots' `z-20`), which gives one 2.75rem-plus tap
 * target for the card and a separate one for each dot, with no invalid nesting.
 *
 * Every figure on it obeys null-is-not-zero; see `figures.tsx` for how the two
 * read differently, and `joined.ts` for which of the four absences this one is.
 */
export function VideoCard({
  video,
  sources,
  onOpen,
  adTag = null,
}: {
  video: JoinedVideo;
  sources: Sources;
  onOpen: () => void;
  /**
   * AD BACKED MARKS THE EXCEPTION, NOT THE RULE. The page works out which way
   * round it is: when most videos have ads behind them, the odd one out is
   * tagged `unbacked`; when most do not, the odd one out is tagged `backed`.
   * `null` means no tag at all (a clear majority does not exist).
   */
  adTag?: 'backed' | 'unbacked' | null;
}) {
  const { row } = video;
  const meta = CONTENT_STATUS[row.status];
  const title = row.offer?.title ?? row.video_title ?? 'Your video';

  const [step, setStep] = useState(0);
  const images = [row.thumbnail_url, video.tiktok?.cover_image_url ?? null].filter(
    (s): s is string => Boolean(s)
  );
  const src = images[step];

  const stats = [
    { key: 'views', Icon: Eye, label: 'views', value: video.views },
    { key: 'likes', Icon: Heart, label: 'likes', value: video.likes },
    { key: 'comments', Icon: MessageCircle, label: 'comments', value: video.comments },
  ];

  return (
    <article className="wx-neo-raised-sm ease-brand relative flex h-full w-full flex-col gap-2 rounded-lg p-2 transition-transform duration-300 motion-safe:hover:-translate-y-0.5">
      {src ? (
        <Cover
          src={src}
          label={meta.creatorLabel}
          tone={meta.tone}
          onError={() => setStep((s) => s + 1)}
        />
      ) : (
        /* NO PICTURE, NO SQUARE. The status is a line of text, not a plate. */
        <p className="text-muted flex items-center gap-1.5 px-1 pt-0.5 text-[0.6875rem] font-semibold">
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              meta.tone === 'live'
                ? 'bg-stage-live'
                : meta.tone === 'due'
                  ? 'bg-stage-due'
                  : 'bg-stage-paid'
            )}
          />
          <span className="truncate">{meta.creatorLabel}</span>
        </p>
      )}

      {/* GMV, the figure this page is for, so it is the biggest thing on the tile. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
        {sources.ads === 'loading' ? (
          <span className="wx-skeleton h-5 w-20 rounded-sm" />
        ) : (
          <Money
            value={video.gmv}
            currency={video.currency}
            className="text-[1.0625rem] leading-none"
          />
        )}
        <span className="text-muted text-[0.625rem] font-semibold tracking-[0.08em] uppercase">
          GMV
        </span>
        {adTag ? (
          <span
            className={cn(
              'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold',
              adTag === 'backed'
                ? 'bg-stage-live-soft text-stage-live'
                : 'text-muted bg-surface-2'
            )}
          >
            {adTag === 'backed' ? 'Ad backed' : 'No ads yet'}
          </span>
        ) : null}
      </div>

      {/* Views, likes, comments. While TikTok is not connected (or its request
          broke) the PAGE says so once, in its banner, and this row is simply
          not here. Once connected, a video TikTok did not report is still
          "Not reported", for that one figure: null is not zero. */}
      {sources.tiktok === 'off' || sources.tiktok === 'failed' ? null : sources.tiktok ===
        'loading' ? (
        <div className="wx-skeleton mx-1 h-4 rounded-sm" />
      ) : video.tiktok ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          {stats.map(({ key, Icon, label, value }) => (
            <li key={key} className="text-muted flex min-w-0 items-center gap-1">
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <Count value={value} small />
              <span className="sr-only">{label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted flex items-center gap-1 px-1 text-[0.625rem]">
          <Eye className="size-3.5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap italic">Views not reported</span>
        </p>
      )}

      <div className="mt-auto flex min-w-0 items-center justify-between gap-2 px-1 pb-0.5">
        <p className="text-muted min-w-0 truncate text-[0.625rem] font-semibold tracking-[0.06em] uppercase">
          {row.brand?.name ?? 'A brand'}
        </p>
        <time dateTime={row.created_at} className="text-faint shrink-0 text-[0.625rem]">
          {new Date(row.created_at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}
        </time>
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${title}`}
        className="focus-visible:ring-accent/50 absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      />
    </article>
  );
}

/** True when this video has a picture to show, so the page can pick a grid. */
export function hasPicture(video: JoinedVideo): boolean {
  return Boolean(video.row.thumbnail_url || video.tiktok?.cover_image_url);
}

/**
 * The cover, with a quiet fallback chain: our copy, then TikTok's, then a plate.
 *
 * The review status rides the corner of it. Over a photograph a translucent
 * pill cannot be relied on for contrast, so this one is a dark scrim with white
 * text — the same treatment `VideoPlayer` gives its own backdrop — and the tone
 * is carried by a DOT beside the words rather than by the text colour, so the
 * status is readable whatever the still behind it happens to be, and it is
 * never colour alone.
 *
 * SQUARE, AND THE GRID FILLS RATHER THAN STRETCHES.
 *
 * Rashid, looking at the live page: "the card is looking bad fix it make it
 * smaller square type shaped and also fix for 1 or 2 videos it is very huge."
 *
 * Both halves were the same bug seen twice. The still is 4:5, so each card was
 * a portrait poster; and the grid was a fixed `grid-cols-2 md:3 xl:4`, which
 * divides the FULL WIDTH however many cards there are — so two videos on a
 * desktop got half a screen each. It is now
 * `repeat(auto-fill, minmax(9rem, 1fr))`: the row is cut into as many 9rem
 * tracks as fit and the cards occupy the first few, so two videos look like
 * two videos. The thumbnail is square, which also stops a 9:16 still from
 * making the card taller than the figures beside it.
 *
 * The old note, kept because the reasoning still applies to the cap: 4:5 was
 * column does not turn a grid of four into a wall of poster art. The cap never
 * bites at phone width, where the column is about 9rem across.
 */
function Cover({
  src,
  label,
  tone,
  onError,
}: {
  src: string;
  label: string;
  tone: 'live' | 'due' | 'paid';
  onError: () => void;
}) {
  return (
    <div className="bg-surface-2 wx-neo-inset relative aspect-square w-full overflow-hidden rounded-md">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={onError}
        className="size-full object-cover"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/55 to-transparent"
      />
      <span className="absolute top-1.5 left-1.5 inline-flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            tone === 'live'
              ? 'bg-stage-live'
              : tone === 'due'
                ? 'bg-stage-due'
                : 'bg-stage-paid'
          )}
        />
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}
