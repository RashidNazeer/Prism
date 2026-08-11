import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase';
import type { ContentRow } from '@/lib/content';

/**
 * The picture on a content card.
 *
 * A 9:16 well, because these are TikToks and a 16:9 box would letterbox every
 * one of them.
 *
 * The thumbnail is hotlinked from the platform's CDN, and the URL oEmbed gives
 * us is SIGNED with about two days on the clock. So a card that worked on
 * Monday shows a broken image on Thursday, and this asks our own Edge Function
 * for a fresh one when that happens: once, quietly, same origin.
 *
 * It cannot ask TikTok directly. That endpoint omits its CORS headers on error
 * responses, so every deleted post would put a CORS violation in the console,
 * and this product does not ship console errors.
 *
 * `no-referrer` matters too: the CDN serves nothing when it can see the request
 * came from somewhere that is not TikTok.
 */

function useRefreshedThumb(row: ContentRow) {
  const queryClient = useQueryClient();
  const tried = useRef(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabase().functions.invoke('manage-content', {
        body: { action: 'content.refresh', contentId: row.id },
      });
      if (error) return null;
      return (data as { result: ContentRow | null }).result;
    },
    onSuccess: (result) => {
      if (!result?.thumbnail_url) return;
      setFresh(result.thumbnail_url);
      // Everything else showing this video wants the new URL too.
      void queryClient.invalidateQueries({ queryKey: ['creator', 'my-content'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    },
  });

  /** Once per card, ever. A post that has been deleted never comes back. */
  const attempt = () => {
    if (tried.current) return;
    tried.current = true;
    refresh.mutate();
  };

  return { fresh, attempt };
}

export function VideoThumb({
  row,
  onPlay,
  className,
}: {
  row: ContentRow;
  onPlay?: () => void;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const { fresh, attempt } = useRefreshedThumb(row);

  const src = fresh ?? (broken ? null : row.thumbnail_url);

  // Nothing stored at all: the platform was slow or down when this was posted.
  // Ask once now rather than leaving a permanent grey box.
  useEffect(() => {
    if (!row.thumbnail_url) attempt();
    // `attempt` is stable enough for this: it guards itself with a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.thumbnail_url]);

  const inner = (
    <>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            setBroken(true);
            attempt();
          }}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <span className="bg-surface-2 text-faint grid size-full place-items-center">
          <Video size={26} aria-hidden />
        </span>
      )}

      {onPlay ? (
        <>
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            <span className="grid size-12 place-items-center rounded-full bg-white/95 text-black shadow-lg">
              <Play size={20} fill="currentColor" aria-hidden />
            </span>
          </span>
        </>
      ) : null}
    </>
  );

  const shell = cn(
    'group border-line bg-surface-2 relative block aspect-[9/16] w-full overflow-hidden rounded-[14px] border',
    className
  );

  if (!onPlay) return <span className={shell}>{inner}</span>;

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${row.video_title ?? 'this video'}`}
      className={cn(shell, 'cursor-pointer')}
    >
      {inner}
    </button>
  );
}
