import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Ad spend and ROI for the videos inside Paid Collabs.
 *
 * THIS FILE IS THE SEAM, AND IT IS OURS. The vendored WurxBase app in
 * `src/vendor/wurxbase/` holds the creators and their delivered video URLs; we
 * hold what those videos cost to advertise and what they sold. Everything that
 * touches OUR database lives here, and the vendored code only ever reads the
 * answers out of a context.
 *
 * That split is what `pnpm verify:isolation` is protecting, and the guard names
 * this exact arrangement itself: "If it needs something of ours, pass it in as
 * a prop from the route." The vendored app never imports our Supabase client
 * and never names our project; our code never names either of theirs. Three
 * separate databases, no connection between them, and the build says so.
 *
 * THE JOIN IS EXACT AND NEEDS NO BRAND MATCHING. Their videos are TikTok URLs;
 * `tiktok_video_daily.item_id` is TikTok's own id for the same video. So a
 * video either has ad figures or it does not, per video. No matching Paid
 * Collab brand names against ours, nothing to keep in step, and a brand lights
 * up the moment its ad account is connected.
 */

/*
 * THE ARITHMETIC LIVES IN `collab-ad-math.ts`, and is re-exported here.
 *
 * Not a tidiness split. That file is pure, imports nothing and touches no
 * database, which is what lets `pnpm verify:collab-ads` transpile it and test
 * the money rules directly in Node. Re-exporting rather than duplicating means
 * the implementation under test is the implementation that ships — a second
 * copy would pass its own tests forever while the screen used the other one.
 */
export {
  tiktokVideoId,
  videoIdsOf,
  totalsOf,
  money,
  roiText,
} from './collab-ad-math';
export type { AdFigures, AdTotals } from './collab-ad-math';

import type { AdFigures } from './collab-ad-math';

type Ctx = {
  /** Register video ids to fetch. Safe to call during render. */
  ensure: (itemIds: string[]) => void;
  /** What we know about one video. `null` means no ad data for it. */
  get: (itemId: string) => AdFigures | null;
  /** True once at least one fetch has come back, so the UI can skeleton. */
  ready: boolean;
  loading: boolean;
  error: string | null;
};

const AdFiguresContext = createContext<Ctx | null>(null);

/** At most this many ids per RPC call; the function refuses more than 2000. */
const BATCH = 500;

export function CollabAdFiguresProvider({ children }: { children: ReactNode }) {
  const [known, setKnown] = useState<Map<string, AdFigures | null>>(() => new Map());
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * `ensure` IS CALLED FROM RENDER, by a table cell that has just discovered
   * which videos its row holds. So it must not call setState: it collects into
   * a ref and schedules one flush, which is what turns dozens of per-row calls
   * into a single request and keeps React out of a render loop.
   */
  const pending = useRef<Set<string>>(new Set());
  const scheduled = useRef(false);
  const [wanted, setWanted] = useState<string[]>([]);
  const asked = useRef<Set<string>>(new Set());

  const ensure = useCallback((itemIds: string[]) => {
    let fresh = false;
    for (const id of itemIds) {
      if (!id || asked.current.has(id) || pending.current.has(id)) continue;
      pending.current.add(id);
      fresh = true;
    }
    if (!fresh || scheduled.current) return;
    scheduled.current = true;
    queueMicrotask(() => {
      scheduled.current = false;
      const batch = [...pending.current];
      pending.current.clear();
      if (batch.length) setWanted((w) => [...w, ...batch]);
    });
  }, []);

  useEffect(() => {
    if (wanted.length === 0) return;
    const batch = wanted.filter((id) => !asked.current.has(id));
    if (batch.length === 0) return;
    for (const id of batch) asked.current.add(id);

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const found = new Map<string, AdFigures>();
        for (let i = 0; i < batch.length; i += BATCH) {
          const slice = batch.slice(i, i + BATCH);
          const { data, error: rpcErr } = await getSupabase().rpc('ads_totals_for_videos', {
            p_item_ids: slice,
          });
          if (rpcErr) throw rpcErr;
          for (const row of (data ?? []) as Array<{
            item_id: string;
            cost: number | string;
            gross_revenue: number | string;
            orders: number | string;
            currency: string | null;
            mixed_currency: boolean;
          }>) {
            found.set(row.item_id, {
              cost: Number(row.cost) || 0,
              revenue: Number(row.gross_revenue) || 0,
              orders: Number(row.orders) || 0,
              currency: row.currency,
              mixedCurrency: Boolean(row.mixed_currency),
            });
          }
        }
        if (cancelled) return;
        setKnown((prev) => {
          const next = new Map(prev);
          /*
           * EVERY ID ASKED ABOUT IS RECORDED, including the ones with no rows,
           * as an explicit `null`. Otherwise "we have not looked yet" and "we
           * looked and there is nothing" are the same absence, the screen
           * cannot tell a skeleton from a dash, and the missing ids get asked
           * for again on every render.
           */
          for (const id of batch) next.set(id, found.get(id) ?? null);
          return next;
        });
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        /* Let them be asked for again, or a blip becomes permanent blanks. */
        for (const id of batch) asked.current.delete(id);
        setError((e as Error).message);
        setReady(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const get = useCallback((itemId: string) => known.get(itemId) ?? null, [known]);

  const value = useMemo<Ctx>(
    () => ({ ensure, get, ready, loading, error }),
    [ensure, get, ready, loading, error]
  );

  return <AdFiguresContext.Provider value={value}>{children}</AdFiguresContext.Provider>;
}

/**
 * Read the ad figures. Returns a no-op outside the provider.
 *
 * NEVER THROWS WHEN THE PROVIDER IS ABSENT, because the thing calling it is
 * vendored code we do not want to make fragile. Without a provider the columns
 * simply show nothing, which is the same as having no ad data.
 */
export function useCollabAdFigures(): Ctx {
  return (
    useContext(AdFiguresContext) ?? {
      ensure: () => {},
      get: () => null,
      ready: false,
      loading: false,
      error: null,
    }
  );
}
