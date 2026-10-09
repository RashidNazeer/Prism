import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, MoreVertical, X } from 'lucide-react';

/**
 * The per-row action menu: look at their TikTok, approve, reject.
 *
 * Rendered into a portal rather than inside the row. The table is a rounded
 * card with `overflow-hidden`, so an in-place dropdown on the last row would be
 * sliced off at the card's edge, which is exactly the row people act on most.
 *
 * A portal puts the menu at the end of `<body>`, far from its trigger in the
 * document, so focus has to be moved deliberately: without that, opening the
 * menu with a keyboard leaves the caret back on the row and Tab walks into the
 * page behind. Focus goes into the menu on open and returns to the button on
 * close, and the arrow keys move between items the way a menu should.
 *
 * It closes on page scroll instead of trying to follow the button, because a
 * menu that drifts away from its row is worse than one that gets out of the
 * way. Scrolling INSIDE the menu is exempt, or moving focus to a lower item
 * would slam it shut.
 */
export function RowActions({
  handle,
  onApprove,
  onReject,
}: {
  handle: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    // Flip above the button when there is not enough room below, so the menu
    // is never half off the bottom of a phone screen.
    const below = window.innerHeight - r.bottom;
    setPos({
      top: below < 190 ? Math.max(8, r.top - 186) : r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
    });
  }, [open]);

  // Move focus in once the menu has a position, and hand it back on close.
  useEffect(() => {
    if (!open || !pos) return;
    // Captured now, because by the time the cleanup runs React may have
    // detached the node this ref points at.
    const trigger = buttonRef.current;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => trigger?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;

    const items = () => [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    ];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Tab means "I am done here". Closing hands focus back to the trigger, so
      // the next Tab continues from the row rather than from the end of body.
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') {
        return;
      }
      const list = items();
      if (list.length === 0) return;
      e.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? list.length - 1
            : e.key === 'ArrowDown'
              ? (at + 1 + list.length) % list.length
              : (at - 1 + list.length) % list.length;
      list[next]?.focus();
    };

    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };

    // Scrolling the page moves the row out from under the menu. Scrolling
    // inside the menu itself must not close it.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);

    document.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const item =
    'flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[0.8125rem] transition-colors duration-150';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for @${handle}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent pointer-events-auto grid size-10 place-items-center rounded-lg transition-colors duration-200"
      >
        <MoreVertical size={16} aria-hidden />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for @${handle}`}
              style={{ top: pos.top, right: pos.right }}
              className="wx-neo-raised fixed z-50 w-56 overflow-hidden rounded-xl py-1"
            >
              <a
                role="menuitem"
                href={`https://www.tiktok.com/@${encodeURIComponent(handle)}`}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => setOpen(false)}
                className={`${item} text-muted hover:bg-surface-2 hover:text-accent`}
              >
                <ExternalLink size={15} aria-hidden />
                View TikTok profile
              </a>

              <div role="separator" className="bg-line my-1 h-px" />

              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  onApprove();
                }}
                className={`${item} text-success hover:bg-success-soft`}
              >
                <Check size={15} aria-hidden />
                Approve
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  onReject();
                }}
                className={`${item} text-danger hover:bg-danger-soft`}
              >
                <X size={15} aria-hidden />
                Reject
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
