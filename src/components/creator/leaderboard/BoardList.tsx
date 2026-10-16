import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { CreatorFace } from '@/components/work/CreatorFace';
import { cn } from '@/lib/utils';
import { faceMoney, num, tipMoney, videosLabel, type BoardItem } from './board-kit';

/**
 * THE BOARD FROM RANK FOUR DOWN, twenty-five at a time.
 *
 * EVERY ROW IS A REAL FIGURE. Nobody appears here on a zero, because a zero on
 * this board does not mean "sold nothing", it means "not measured yet" — which
 * is what the line under the list says, and why this list never pads itself out
 * to a round number.
 *
 * THE BAR BEHIND EACH ROW is that creator's GMV as a share of the leader's, so
 * the shape of the board reads at a glance without reading a single number. It
 * is drawn from the totals already printed on the row; it is NOT the per-creator
 * daily sparkline §7.4 asks for, which the board function cannot supply. See
 * the note at the top of `board-kit.ts`.
 */
export function BoardList({
  items,
  faces,
  best,
  page,
  pages,
  onPage,
  fetching,
}: {
  items: BoardItem[];
  faces: Record<string, string>;
  /** The leader's GMV, which every bar is measured against. */
  best: number;
  page: number;
  pages: number;
  onPage: (n: number) => void;
  fetching: boolean;
}) {
  return (
    <section
      aria-label="The board"
      /* `-sm`: the same glass, no blur of its own. The sticky "You" card is
         this screen's one blurred layer. */
      className="wx-neo-raised-sm overflow-hidden rounded-xl p-2 sm:p-3"
    >
      {/* A header row only where there is room for one. Below `sm` the videos
          count folds under the name so nothing pushes the page sideways. */}
      <div className="text-muted hidden px-3 py-2 font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase sm:grid sm:grid-cols-[3rem_minmax(0,1fr)_5rem_9rem] sm:gap-4">
        <span>Rank</span>
        <span>Creator</span>
        <span className="text-right">Videos</span>
        <span className="text-right">GMV</span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {items.map((item) =>
          item.kind === 'gap' ? (
            <li
              key="gap"
              className="text-faint flex min-h-11 items-center justify-center gap-2 text-[0.75rem]"
            >
              <MoreHorizontal size={16} aria-hidden />
              <span>
                <span className="wx-numeric font-mono">{item.hidden}</span> more
                {item.hidden === 1 ? ' creator' : ' creators'} between
              </span>
            </li>
          ) : (
            <li
              key={item.row.creator_id}
              className={cn(
                'relative overflow-hidden rounded-md px-3 py-2',
                item.row.is_me ? 'bg-accent-soft outline-accent outline-2' : 'wx-neo-inset'
              )}
            >
              <div
                aria-hidden
                className="bg-accent/10 pointer-events-none absolute inset-y-0 left-0"
                style={{
                  width: `${best > 0 ? Math.max(2, ((num(item.row.gmv) ?? 0) / best) * 100) : 0}%`,
                }}
              />

              <div className="relative grid min-h-11 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[3rem_minmax(0,1fr)_5rem_9rem] sm:gap-4">
                <span className="wx-numeric text-muted font-mono text-[0.875rem] font-bold">
                  {String(item.row.rank).padStart(2, '0')}
                </span>

                <span className="flex min-w-0 items-center gap-2.5">
                  <CreatorFace
                    /* px by this shared component's own API, not a length this
                       screen chose. */
                    size={36}
                    src={item.row.avatar_path ? faces[item.row.avatar_path] : undefined}
                    name={item.row.display_name}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.875rem] font-semibold">
                      {item.row.display_name ?? 'A creator'}
                      {item.row.is_me ? <span className="text-accent"> · you</span> : null}
                    </span>
                    <span className="text-faint block text-[0.75rem] sm:hidden">
                      {videosLabel(item.row.videos)}
                    </span>
                  </span>
                </span>

                <span className="wx-numeric text-muted hidden text-right font-mono text-[0.875rem] sm:block">
                  {item.row.videos}
                </span>
                <span
                  title={`${tipMoney(item.row.gmv, item.row.currency)} GMV`}
                  className="wx-numeric text-right font-mono text-[1rem] font-extrabold"
                >
                  {faceMoney(item.row.gmv, item.row.currency)}
                </span>
              </div>
            </li>
          )
        )}
      </ul>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 px-1 pt-3 pb-1">
          <button
            type="button"
            disabled={page === 0 || fetching}
            onClick={() => onPage(Math.max(0, page - 1))}
            className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-[0.8125rem] font-semibold disabled:opacity-30"
          >
            <ChevronLeft size={15} aria-hidden />
            Back
          </button>
          <span className="wx-numeric text-muted font-mono text-[0.75rem]">
            {page + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages || fetching}
            onClick={() => onPage(page + 1)}
            className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-[0.8125rem] font-semibold disabled:opacity-30"
          >
            Next
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
