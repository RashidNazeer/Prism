import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase';
import { useFocusTrap } from '@/lib/use-focus-trap';

/**
 * ONE HEADER FOR ALL THREE CONTEST SCREENS: the title, the three sections, and
 * the one thing this area creates.
 *
 * BUILT 2026-08-15 FROM RASHID'S LAYOUT NOTES, and it is worth writing down what
 * he actually asked for, because it is a layout instruction rather than a taste
 * one: the heading moves up right after the top; the three sections sit beside
 * it, on the same line, so they can come OUT of the sidebar; creating a contest
 * goes on the extreme right of that same line; and the row underneath holds
 * every filter on one line rather than stacked.
 *
 * The whole point is vertical space. The old screen spent roughly 300px before
 * a single contest appeared: a top bar, a gap, a title, a tab pill, a hint, and
 * a filter panel with three stacked labelled fields. He has told me twice not
 * to do that.
 *
 * The three sections ARE routes, not local state, so a link is a link, the
 * browser's back button works and any of them can be sent to somebody.
 */

const SECTIONS = [
  { label: 'All', to: '/admin/contests' },
  { label: 'Claims', to: '/admin/contests/claims' },
  { label: 'Rewards', to: '/admin/contests/rewards' },
] as const;

export function ContestsHeader({ subtitle }: { subtitle?: string }) {
  const { pathname } = useLocation();
  const [picking, setPicking] = useState(false);

  return (
    <>
      {/*
        ONE ROW: title, sections, action. `border-b` with the glass line rather
        than a solid rule, which is the "transparent borders" he pointed at in
        the design.
      */}
      {/*
        THE TITLE LEFT THIS ROW ON 2026-08-16. It says "Contests" in the top bar
        now, underlined, along with every other section in the product. Repeating
        it here was the same word twice, 40px apart.
      */}
      <div className="border-glass wx-tap-row flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-2.5">
        <nav aria-label="Contest sections" className="flex min-w-0 items-center gap-1">
          {SECTIONS.map((s) => {
            // Exact match on All, or /admin/contests would light up on every
            // one of its own children.
            const active = s.to === '/admin/contests' ? pathname === s.to : pathname === s.to;
            return (
              <Link
                key={s.to}
                to={s.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'ease-brand relative flex min-h-10 items-center rounded-md px-3 text-[0.875rem] transition-colors duration-200',
                  active
                    ? 'text-accent font-semibold'
                    : 'text-muted hover:bg-surface-2 hover:text-text'
                )}
              >
                {s.label}
                {/* The underline the design puts on its active section. Inside
                    the link so it cannot drift out of alignment. */}
                {active ? (
                  <span
                    aria-hidden
                    className="bg-accent absolute inset-x-3 -bottom-2.5 h-[2px] rounded-full"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Extreme right, from his note. `ml-auto` rather than a spacer, so it
            still lands sensibly when the row wraps on a phone. */}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="wx-gradient text-on-accent ease-brand ml-auto inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-4 text-[0.8125rem] font-semibold shadow-sm transition-all duration-200 hover:shadow-md active:translate-y-px"
        >
          <Plus size={16} aria-hidden />
          New contest
        </button>
      </div>

      {subtitle ? (
        <p className="text-muted mt-2.5 max-w-prose text-[0.8125rem] leading-relaxed">
          {subtitle}
        </p>
      ) : null}

      {picking ? <BrandPicker onClose={() => setPicking(false)} /> : null}
    </>
  );
}

/**
 * WHICH BRAND IS THIS CONTEST FOR.
 *
 * A contest belongs to a brand and is created inside one, so "New contest" has
 * to answer that question before it can do anything. The previous attempt at
 * this button dodged it by navigating to a list, which meant a button naming an
 * action and performing a walk. Asking one question is honest and is still one
 * click fewer than finding the brand yourself.
 */
function BrandPicker({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'brands', 'pickable'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await getSupabase()
        .from('brands')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .limit(200);
      if (error) throw error;
      return (rows ?? []) as unknown as { id: string; name: string }[];
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a brand for the new contest"
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        className="bg-surface-1 relative max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-xl p-6 shadow-lg sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[1.1875rem] leading-tight font-bold">
              Which brand is it for?
            </h2>
            <p className="text-muted mt-1 text-[0.8125rem] leading-relaxed">
              A contest belongs to one brand, and its budget and products come from that brand.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-accent -mt-1 -mr-1 grid size-[44px] shrink-0 place-items-center rounded-lg transition-colors"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        {isPending ? (
          <div className="mt-5 flex flex-col gap-2">
            <div className="wx-skeleton h-12 rounded-lg" />
            <div className="wx-skeleton h-12 rounded-lg" />
            <div className="wx-skeleton h-12 rounded-lg" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="text-muted mt-5 text-[0.875rem] leading-relaxed">
            There is no active brand to hang a contest off yet. Add one first, and it appears
            here.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-1.5">
            {(data ?? []).map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/admin/brands/${b.id}/contests/new`);
                  }}
                  className="wx-neo-raised-sm wx-neo-press hover:text-accent ease-brand flex min-h-12 w-full items-center rounded-lg px-4 text-left text-[0.875rem] font-medium transition-colors"
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
