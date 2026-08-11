/**
 * Content, shared by both sides.
 *
 * The row shape, the vocabulary and the small amount of arithmetic that has to
 * give the same answer on a creator's screen and an admin's. Two copies of
 * "how many are still to come" is how the two sides start disagreeing.
 */

export type ContentStatus = 'submitted' | 'approved' | 'needs_another_take';

export const CONTENT_STATUS: Record<
  ContentStatus,
  { label: string; creatorLabel: string; tone: 'live' | 'due' | 'paid' }
> = {
  submitted: {
    label: 'With the team',
    creatorLabel: 'With the team',
    tone: 'live',
  },
  approved: {
    label: 'Approved',
    creatorLabel: 'Approved',
    tone: 'paid',
  },
  needs_another_take: {
    label: 'Another take',
    creatorLabel: 'Needs another take',
    tone: 'due',
  },
};

export interface ContentRow {
  id: string;
  application_id: string;
  creator_id: string;
  brand_id: string;
  offer_id: string;
  creator_handle: string | null;
  creator_name: string | null;
  video_url: string;
  ad_code: string;
  ad_authorized: boolean;
  status: ContentStatus;
  decision_note: string | null;
  decided_at: string | null;
  thumbnail_url: string | null;
  video_title: string | null;
  video_author: string | null;
  embed_id: string | null;
  created_at: string;
  brand: { id: string; name: string; slug: string; logo_url: string | null } | null;
  offer: { id: string; title: string; video_count: number | null } | null;
}

export const CONTENT_COLUMNS =
  'id, application_id, creator_id, brand_id, offer_id, creator_handle, creator_name, ' +
  'video_url, ad_code, ad_authorized, status, decision_note, decided_at, ' +
  'thumbnail_url, video_title, video_author, embed_id, created_at, ' +
  'brand:brands (id, name, slug, logo_url), ' +
  'offer:offers (id, title, video_count)';

/**
 * The numeric id inside a TikTok post URL, which is what the player needs.
 *
 * Prefer the one the platform gave us at submission; fall back to reading the
 * link. A short `vm.tiktok.com` link has no id in it at all, which is exactly
 * why we ask oEmbed rather than parsing and hoping.
 */
export function videoIdFrom(row: Pick<ContentRow, 'embed_id' | 'video_url'>): string | null {
  if (row.embed_id && /^\d+$/.test(row.embed_id)) return row.embed_id;
  return row.video_url.match(/\/video\/(\d+)/)?.[1] ?? null;
}

/**
 * How one job is going: what was asked for, what has landed, what counts.
 *
 * Only APPROVED submissions count towards the offer. Rashid's rule, and the
 * database enforces the same one: a link pasted into a form is a claim until
 * somebody has watched it, so it cannot be what finishes a job.
 */
export interface JobProgress {
  required: number | null;
  approved: number;
  waiting: number;
  needsAnotherTake: number;
  /** Everything posted, whatever came of it. */
  posted: number;
  /** Null when the offer names no number, so there is nothing to be short of. */
  remaining: number | null;
  done: boolean;
}

export function progressFor(
  rows: ContentRow[],
  applicationId: string,
  required: number | null
): JobProgress {
  const mine = rows.filter((r) => r.application_id === applicationId);
  const approved = mine.filter((r) => r.status === 'approved').length;
  const waiting = mine.filter((r) => r.status === 'submitted').length;
  const needsAnotherTake = mine.filter((r) => r.status === 'needs_another_take').length;
  const remaining = required === null ? null : Math.max(0, required - approved);

  return {
    required,
    approved,
    waiting,
    needsAnotherTake,
    posted: mine.length,
    remaining,
    done: required !== null && approved >= required,
  };
}
