import { adStateOf, type AdState, type VideoPerformance } from '@/lib/creator/usePerformance';
import type { TikTokVideo } from '@/lib/creator/useTikTokAccount';
import { videoIdFrom, type ContentRow } from '@/lib/content';

/**
 * THE JOIN, AND WHAT EACH ABSENCE MEANS.
 *
 * Three sources, none of which knows about the others, stitched together in the
 * browser because no single one of them has a whole video in it:
 *
 *   1. `useMyContent`        the video we hold and where its review got to
 *   2. `useVideoPerformance` the ad spend and the GMV behind it, by submission
 *   3. `useTikTokVideos`     views, likes and comments, by the post id
 *
 * EVERY ONE IS OPTIONAL, and a missing match is not a zero — but it is also not
 * one single thing. A card with no views can mean four different facts, and a
 * creator does something different about each:
 *
 *   off      TikTok is not connected          → connect it
 *   loading  we have not heard back yet        → wait (so: a skeleton, no words)
 *   failed   the request broke                 → retry
 *   ok       answered, and this video is absent → nothing to do, it is not there
 *
 * Flattening those four into "Not reported" with no reason is how a product
 * teaches people to distrust every figure on the screen. So the state travels
 * with the join, and every `NotReported` on this page carries the one line that
 * says which of the four it is.
 */

export type SourceState = 'ok' | 'loading' | 'failed' | 'off';

export interface Sources {
  /** `useVideoPerformance`: our nightly ad and GMV table. */
  ads: SourceState;
  /** `useTikTokVideos`: the creator's own connected account. */
  tiktok: SourceState;
}

export interface JoinedVideo {
  row: ContentRow;
  perf: VideoPerformance | null;
  tiktok: TikTokVideo | null;
  /** Null while the ad source has not answered, so "no ads" is never guessed. */
  adState: AdState | null;
  /** Ad money is on this video at all. The "Ad backed" tag. */
  adBacked: boolean;
  /** All-time, in `currency`. Null means not reported. */
  gmv: number | null;
  spend: number | null;
  orders: number | null;
  currency: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/**
 * Join one video. `latest` is the newest complete day in our own table, which
 * is what decides whether ads on it are running or merely ran.
 */
export function joinVideo(
  row: ContentRow,
  perfBySubmission: Map<string, VideoPerformance>,
  tiktokById: Map<string, TikTokVideo>,
  sources: Sources,
  latest: string | null
): JoinedVideo {
  const perf = perfBySubmission.get(row.id) ?? null;
  const id = videoIdFrom(row);
  const tiktok = sources.tiktok === 'ok' && id ? (tiktokById.get(id) ?? null) : null;

  /*
   * ADS ARE ONLY A FACT ONCE THE SOURCE HAS SPOKEN, and only ever about an
   * approved video. A video still with the team says NOTHING about ads rather
   * than "no ads": nobody has had the chance to run any.
   */
  const adState: AdState | null = perf
    ? adStateOf(perf, latest)
    : sources.ads === 'ok' && row.status === 'approved'
      ? 'none'
      : null;

  return {
    row,
    perf,
    tiktok,
    adState,
    adBacked: Boolean(perf && (perf.lifetime_cost > 0 || perf.ads_ever)),
    gmv: perf ? perf.lifetime_revenue : null,
    spend: perf ? perf.lifetime_cost : null,
    orders: perf ? perf.orders : null,
    currency: perf?.currency ?? null,
    views: tiktok ? tiktok.view_count : null,
    likes: tiktok ? tiktok.like_count : null,
    comments: tiktok ? tiktok.comment_count : null,
    shares: tiktok ? tiktok.share_count : null,
  };
}

/* ------------------------------------------------------------ why lines --- */

/** One line saying why there is no money figure on this video. */
export function whyNoMoney(row: ContentRow, sources: Sources): string {
  if (sources.ads === 'failed') return 'Your ad figures did not load. Try again.';
  if (sources.ads === 'loading') return 'Still loading your ad figures.';
  if (row.status !== 'approved')
    return 'Ads can only run behind an approved video, so there is nothing to report yet.';
  return 'No ad figures on this one yet. They appear once ads run behind it.';
}

/** One line saying why there are no views, likes or comments. */
export function whyNoEngagement(sources: Sources, hasFigure: boolean): string {
  if (sources.tiktok === 'off') return 'Connect TikTok to see views.';
  if (sources.tiktok === 'failed') return 'Your TikTok figures did not load. Try again.';
  if (sources.tiktok === 'loading') return 'Still loading your TikTok figures.';
  if (hasFigure) return 'TikTok did not share this figure for this video.';
  return 'TikTok has not shared this video yet. It covers your most recent posts.';
}
