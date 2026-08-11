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

/*
 * HOW MUCH OF A JOB HAS BEEN FILMED NOW LIVES IN THE DATABASE.
 *
 * `progressFor()` used to work it out here, from whatever content rows the
 * calling screen happened to be holding, against whatever the offer said at
 * that moment. It was correct and it was only ever imported by two files out of
 * the nine that show a job, so seven screens showed the work and said nothing
 * about it.
 *
 * It is now the `job_progress` view, read through `src/lib/work/job-progress.ts`,
 * for two reasons beyond reach. It counts against the number FROZEN on the job
 * at approval rather than the offer's current one, so re-scoping an offer
 * cannot change what somebody already filming still owes. And it is one
 * question asked one way, so two screens cannot answer it differently.
 */
