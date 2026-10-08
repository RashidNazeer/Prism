import { useRef } from 'react';
import { m } from 'motion/react';
import { ExternalLink, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { videoIdFrom, type ContentRow } from '@/lib/content';

/**
 * Watching a video without leaving the product.
 *
 * The platform's own player in an iframe. We never hold a byte of video, so
 * there is nothing else this could be, and it keeps the view count and the
 * creator's attribution where they belong.
 *
 * A link we cannot get an id out of (a short link nobody has resolved, or a
 * post that has since been taken down) gets an honest panel and a way out to
 * the original, rather than an empty black rectangle.
 */
export function VideoPlayer({ row, onClose }: { row: ContentRow; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { initialSelector: 'button' });

  const id = videoIdFrom(row);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={row.video_title ?? 'Video'}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="bg-surface-1 relative flex max-h-[100dvh] w-full max-w-[420px] flex-col overflow-y-auto rounded-t-[20px] p-4 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold">
              {row.video_title ?? 'Your video'}
            </p>
            <p className="text-muted truncate text-[0.8125rem]">
              {row.brand?.name}
              {row.offer?.title ? `, ${row.offer.title}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="wx-neo-inset mt-3 overflow-hidden rounded-lg">
          {id ? (
            <iframe
              // `?autoplay=0` so opening a card never blares sound at somebody
              // going through a queue of them.
              src={`https://www.tiktok.com/embed/v2/${id}?autoplay=0`}
              title={row.video_title ?? 'Video'}
              allow="encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              className="block h-[70vh] max-h-[720px] w-full border-0"
            />
          ) : (
            <div className="px-6 py-14 text-center">
              <p className="font-semibold">This one will not play here</p>
              <p className="text-muted mx-auto mt-2 max-w-xs text-[0.875rem] leading-relaxed">
                The link does not carry a video id we can build a player from. It should still
                open on TikTok.
              </p>
            </div>
          )}
        </div>

        <a
          href={row.video_url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-muted hover:text-accent mt-3 inline-flex items-center gap-1.5 self-start text-[0.8125rem] transition-colors"
        >
          <ExternalLink size={14} aria-hidden />
          Open on TikTok
        </a>
      </m.div>
    </div>
  );
}
