import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * Creator profile pictures, for admin screens.
 *
 * WHERE THEY COME FROM. `sync-creator-avatars` fetched each one once, server
 * side, and put it in the private `creator-avatars` bucket. Nothing in the
 * browser ever asks a third party for a face: the vendored WurxBase does that,
 * per row, on every page view, and it costs handles leaving our domain, 429s on
 * long lists, and every picture in the product turning back into a letter the
 * day unavatar blocks us.
 *
 * STAFF ONLY, twice over. `creator_avatars` has one policy and it is
 * `is_staff()`, and the bucket is private with a matching policy on
 * `storage.objects`. A creator running this query gets nothing, and a creator
 * holding a path still cannot read the object.
 *
 * WHY IT TAKES IDS RATHER THAN FETCHING EVERYONE. Forty-one creators today,
 * fifty thousand later. Every screen passes the ids it is actually drawing,
 * which is one page's worth, and the whole page is signed in ONE call.
 *
 * NOTHING IN THIS FILE MAY BE IMPORTED BY CREATOR CODE, which `.oxlintrc.json`
 * enforces.
 */

/**
 * Eight hours. Long enough that an admin signs once and works all day, short
 * enough that a URL copied out of devtools is not a permanent key. The query
 * is held for six, so it always re-signs well before anything expires.
 */
const SIGNED_URL_SECONDS = 8 * 60 * 60;
const HOLD_MS = 6 * 60 * 60 * 1000;

export type CreatorAvatars = Record<string, string>;

export function useCreatorAvatars(profileIds: readonly (string | null | undefined)[]) {
  /*
   * Sorted and deduplicated so the cache key is about WHICH creators are on
   * screen, not the order a table happened to render them in. Without this,
   * sorting a list by name would re-sign every avatar on it.
   */
  const ids = [...new Set(profileIds.filter((id): id is string => Boolean(id)))].sort();

  const query = useQuery({
    queryKey: ['admin', 'creator-avatars', ids],
    enabled: ids.length > 0,
    staleTime: HOLD_MS,
    gcTime: HOLD_MS,
    queryFn: async (): Promise<CreatorAvatars> => {
      const supabase = getSupabase();

      const { data: rows, error } = await supabase
        .from('creator_avatars')
        .select('profile_id, path')
        .in('profile_id', ids)
        .not('path', 'is', null);
      if (error) throw new Error(error.message);
      if (!rows?.length) return {};

      const paths = rows.map((r) => r.path as string);
      // One call for the whole page. `createSignedUrls`, plural: signing them
      // one at a time would be forty requests to draw one table.
      const { data: signed, error: signErr } = await supabase.storage
        .from('creator-avatars')
        .createSignedUrls(paths, SIGNED_URL_SECONDS);
      if (signErr) throw new Error(signErr.message);

      const urlByPath = new Map<string, string>();
      for (const item of signed ?? []) {
        // Each entry carries its own error: an object that has gone missing
        // must not take the rest of the page's faces down with it.
        if (item.error || !item.signedUrl || !item.path) continue;
        urlByPath.set(item.path, item.signedUrl);
      }

      const out: CreatorAvatars = {};
      for (const row of rows) {
        const url = urlByPath.get(row.path as string);
        if (url) out[row.profile_id] = url;
      }
      return out;
    },
  });

  /*
   * An empty map while loading, and an empty map on failure. A missing picture
   * is not an error worth showing anybody: the face falls back to an initial,
   * which is what it does for creators who never had one either.
   */
  return query.data ?? {};
}
