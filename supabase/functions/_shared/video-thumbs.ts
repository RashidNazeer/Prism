/**
 * A THUMBNAIL FOR A TIKTOK VIDEO WE FILED OURSELVES.
 * ---------------------------------------------------------------------------
 * Rashid, 2026-09-29: "for irwin naturals the top videos row does not show
 * thumbnail please check that".
 *
 * He was right and it was every one of them: on dev, 0 of the 66 videos filed
 * from Reacher carried a thumbnail, against 4,882 of 6,126 everywhere else.
 * `reacher-sync` has written `thumb: ''` since the day it shipped, because
 * REACHER HAS NO THUMBNAIL TO GIVE US. Checked against their own
 * `/public/v1/openapi.json` on 2026-09-29: `/videos/list` returns video_id,
 * video_url, tiktok_url, creator_handle, product_id, product_name, title,
 * views, like/comment/share counts, units_sold, video_gmv, posted_date — and
 * no image field of any kind. `/videos/performance` is the same. The three
 * schemas in their spec that DO carry one are a trending feed, a weekly
 * report's top-five, and an ads row; none is a lookup for a video we hold.
 * Their `social-intelligence` routes answered 404 for us — and so did the
 * control, an impossible handle, so that is "not on our plan", not "no data".
 *
 * ── WHY NOT TIKTOK'S OWN oEMBED, WHICH WORKS PERFECTLY ────────────────────
 * `https://www.tiktok.com/oembed?url=…` needs no key and returned a real
 * `thumbnail_url` for the first Irwin video tried, and the image behind it was
 * a 234KB JPEG. It is also useless to us, and the reason is in the URL:
 *
 *   …tiktokcdn.com/…?dr=14575&x-expires=1790802000&x-signature=…
 *
 * `x-expires` on that lookup was 2026-09-30 21:00 UTC — THE NEXT DAY. Storing
 * that string would have put pictures on Rashid's screen the afternoon it
 * shipped and quietly emptied them again by the weekend, with nothing failing
 * and no test going red. This project has shipped that shape of bug before and
 * it is the one that is hardest to find.
 *
 * ── WHERE THE PICTURES ACTUALLY COME FROM ─────────────────────────────────
 * Every one of the 4,885 thumbnails already on these screens is served from
 * ONE host — `database.euka.ai` — as a permanent public object named after
 * TikTok's own video id:
 *
 *   https://database.euka.ai/storage/v1/object/public/creator_videos_photos/<videoId>.webp
 *
 * Not a signed URL, no expiry, and a thumbnail for a video posted on
 * 2025-11-10 still answered 200 when this was written. Because the key is
 * TikTok's video id rather than anything of EUKA's, that store answers for
 * videos on brands EUKA does not run: 60 of Irwin's 66 are in it (91%), while
 * two impossible ids asked before and after answered 400, so that is a real
 * measurement and not a bucket saying yes to everything.
 *
 * This adds NO new dependency. It is the host every thumbnail on these screens
 * already comes from; Irwin was simply the one brand never asking it.
 *
 * ── EXISTENCE IS CHECKED, NEVER ASSUMED ───────────────────────────────────
 * Six of Irwin's sixty-six have no object there. Writing the URL without
 * looking would put a broken-image icon in the strip for those six, which is
 * worse than the play-symbol placeholder they have now, so each id is asked
 * for once and only a real 200 is stored.
 *
 * ── AND THERE IS NO CACHE TABLE, DELIBERATELY ─────────────────────────────
 * The row IS the cache: a video with a thumbnail is never looked up again, and
 * the only ids re-asked on a later run are the ones with no picture yet —
 * which is exactly the set worth retrying, because a video posted this morning
 * may be indexed by this evening.
 */

/** The public object store every thumbnail on these screens is already served from. */
const PHOTO_BASE = 'https://database.euka.ai/storage/v1/object/public/creator_videos_photos';

/** TikTok's numeric video id, out of any of the URL shapes we store. */
export function tiktokVideoId(url: unknown): string | null {
  const m = String(url ?? '').match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * HOW LONG A SYNC MAY SPEND LOOKING FOR PICTURES, and how many it may ask for.
 *
 * Both are here so a first run over a long backlog cannot push the function
 * past its own time limit and lose the figures, which are the part that
 * matters. Whatever is not resolved this run is simply asked for on the next
 * one, because an unresolved video is still an unresolved video in the row.
 */
const BUDGET_MS = 12_000;
const MAX_LOOKUPS = 400;
const CONCURRENCY = 8;

/** One id, asked once. `null` means "asked, and there is no picture". */
async function lookup(id: string, signal?: AbortSignal): Promise<string | null> {
  const url = `${PHOTO_BASE}/${id}.webp`;
  try {
    /* HEAD, because the answer is yes-or-no and the image itself is for the
       browser to fetch, not for an Edge Function to pull through itself. */
    const r = await fetch(url, { method: 'HEAD', signal });
    return r.ok ? url : null;
  } catch {
    /* A network fault is NOT "there is no picture". Returning null here would
       write that conclusion into nothing — we simply do not fill this one, and
       the next run asks again. */
    return null;
  }
}

export type ThumbFillResult = {
  /** Videos that got a picture on this run. */
  filled: number;
  /** Ids asked for that had none. They are retried on the next run. */
  missing: number;
  /** True when the budget ran out with work still to do. */
  truncated: boolean;
};

/**
 * Fill the blank `thumb` on every video in `lists` that we filed ourselves.
 *
 * `lists` is mutated in place: each entry is one row's `video_codes` array.
 * Only entries matching `src` are touched — a typed video, or one EUKA filed,
 * is not ours to write on, which is the same rule the figures obey.
 */
export async function fillVideoThumbs(
  lists: Record<string, unknown>[][],
  src = 'reacher',
): Promise<ThumbFillResult> {
  const started = Date.now();

  /* Every id that needs one, deduped — the same video can sit on two rows, and
     asking twice for one answer is a request spent on nothing. */
  const need = new Map<string, Record<string, unknown>[]>();
  for (const list of lists) {
    for (const rec of list) {
      if (!rec || rec.src !== src) continue;
      if (String(rec.thumb ?? '').trim()) continue;
      const id = tiktokVideoId(rec.video);
      if (!id) continue;
      const bucket = need.get(id) ?? [];
      bucket.push(rec);
      need.set(id, bucket);
    }
  }

  const ids = [...need.keys()];
  const truncated = ids.length > MAX_LOOKUPS;
  const todo = ids.slice(0, MAX_LOOKUPS);

  let filled = 0, missing = 0, ranOut = false;
  const ctl = new AbortController();
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (Date.now() - started > BUDGET_MS) { ranOut = true; return; }
      const i = cursor++;
      if (i >= todo.length) return;
      const id = todo[i];
      const url = await lookup(id, ctl.signal);
      if (url) {
        for (const rec of need.get(id)!) { rec.thumb = url; filled++; }
      } else {
        missing++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));

  return { filled, missing, truncated: truncated || ranOut };
}
