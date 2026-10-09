import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A SELECT WHOSE OPEN LIST IS OURS.
 *
 * Rashid, 2026-10-09: "All the dropdowns must follow the app's own theme." The
 * closed control on a native `<select>` can wear the neomorphic material, but
 * the OPEN list is drawn by the operating system. On Windows/Chrome that is a
 * white panel with a blue highlight bar on a dark app, and no CSS reaches it
 * (`color-scheme` was checked and is correct). The only way to guarantee the
 * list follows the theme on every OS is to draw it ourselves.
 *
 * A hand-built select that cannot be driven from the keyboard is strictly worse
 * than the native one it replaces, so the keyboard contract is the point:
 *
 *   closed   ArrowDown / ArrowUp / Enter / Space   open, on the current value
 *            a printable character                 open, on the next match
 *   open     ArrowDown / ArrowUp                   move the active option
 *            Home / End                            first / last option
 *            Enter / Space                         choose the active option
 *            Escape                                close, focus stays on trigger
 *            Tab                                   close, focus moves on
 *            a printable character                 jump to the next option that
 *                                                  starts with what was typed
 *
 * FOCUS NEVER LEAVES THE TRIGGER. The active option is announced with
 * `aria-activedescendant` on the trigger, not by moving focus into the list. The
 * choice matters beyond tidiness: the dialogs in this product trap focus inside
 * their own panel, and the list is portalled OUTSIDE that panel. A list that
 * took focus would be an escape the trap fights.
 *
 * CALL SITES KEEP THE NATIVE SHAPE. Children are `<option>` / `<optgroup>`, the
 * value is a string, and `onChange` receives an event whose `target.value` and
 * `target.name` are set, which is all any caller reads. The element is NOT a
 * real `<select>`, so a caller that reached for `e.target.selectedIndex` or a
 * form `FormData` read would need the hidden input (rendered when `name` is set).
 */

type Item = {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  group: string | undefined;
};

/** Plain text of a node, for type-ahead and for the `title` on long labels. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

/** `<option>` and `<optgroup>` children, flattened, through fragments. */
function parseItems(children: ReactNode): Item[] {
  const out: Item[] = [];
  const walk = (nodes: ReactNode, group: string | undefined) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const el = child as ReactElement<{
        children?: ReactNode;
        value?: string | number;
        disabled?: boolean;
        label?: string;
      }>;
      if (el.type === Fragment) {
        walk(el.props.children, group);
      } else if (el.type === 'optgroup') {
        walk(el.props.children, el.props.label);
      } else if (el.type === 'option') {
        const text = textOf(el.props.children);
        out.push({
          value: el.props.value != null ? String(el.props.value) : text,
          label: el.props.children,
          text,
          disabled: Boolean(el.props.disabled),
          group,
        });
      }
    });
  };
  walk(children, undefined);
  return out;
}

export type SelectProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  title?: string;
  className?: string;
  invalid?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
};

const MARGIN = 8; // the 8px gutter check-responsive measures against
const GAP = 6;

export function ListboxSelect({
  id,
  name,
  value,
  defaultValue,
  disabled,
  required,
  autoFocus,
  title,
  className,
  invalid,
  onChange,
  children,
  ...aria
}: SelectProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const items = useMemo(() => parseItems(children), [children]);

  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? items[0]?.value ?? '');
  const current = controlled ? value : inner;
  const selectedIdx = items.findIndex((it) => it.value === current);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // True while the last input was the keyboard: only then does the active option
  // wear an outline. With a mouse the hover tint is already the indicator.
  const kbd = useRef(false);
  const typed = useRef({ buf: '', timer: 0 });

  const openList = (at?: number) => {
    if (disabled || items.length === 0) return;
    setActive(at ?? (selectedIdx >= 0 ? selectedIdx : step(-1, 1)));
    setOpen(true);
  };

  /** Next enabled option from `from` in `dir`; stays put at the ends. */
  function step(from: number, dir: 1 | -1): number {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
      if (!items[i]!.disabled) return i;
    }
    return from < 0 ? -1 : from;
  }

  const commit = (i: number) => {
    const it = items[i];
    if (!it || it.disabled) return;
    if (!controlled) setInner(it.value);
    if (it.value !== current) {
      const target = { value: it.value, name: name ?? '' };
      // Callers read `e.target.value` and nothing else; see the header note.
      onChange?.({
        target,
        currentTarget: target,
        type: 'change',
      } as unknown as ChangeEvent<HTMLSelectElement>);
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  /** Type-ahead. Returns the index to move to, or -1. */
  const typeahead = (ch: string, from: number): number => {
    const t = typed.current;
    window.clearTimeout(t.timer);
    t.buf += ch.toLowerCase();
    t.timer = window.setTimeout(() => (t.buf = ''), 700);
    // The same letter pressed repeatedly cycles through that letter's options.
    const cycling = t.buf.split('').every((c) => c === t.buf[0]);
    const needle = cycling ? t.buf[0]! : t.buf;
    const start = cycling ? from + 1 : from;
    for (let n = 0; n < items.length; n++) {
      const i = (start + n + items.length) % items.length;
      const it = items[i]!;
      if (!it.disabled && it.text.toLowerCase().startsWith(needle)) return i;
    }
    return -1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
    kbd.current = true;
    const k = e.key;
    const printable = k.length === 1 && (k !== ' ' || typed.current.buf !== '');

    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        e.preventDefault();
        openList();
      } else if (printable) {
        e.preventDefault();
        const hit = typeahead(k, selectedIdx);
        openList(hit >= 0 ? hit : undefined);
      }
      return;
    }

    switch (k) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => step(a, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => step(a, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(step(items.length, -1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(active);
        break;
      case 'Tab':
        // Native behaviour: leave, and let focus go where Tab was going.
        setOpen(false);
        break;
      default:
        if (printable) {
          e.preventDefault();
          const hit = typeahead(k, active);
          if (hit >= 0) setActive(hit);
        }
    }
  };

  /* Place the panel: below the trigger, flipped above when it does not fit,
     clamped to the viewport on both axes. Measured, not estimated, so it runs in
     a layout effect and the panel is `invisible` until it has been placed. */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;

    const width = Math.min(Math.max(r.width, 11 * rem), vw - 2 * MARGIN);
    const left = Math.min(Math.max(r.left, MARGIN), vw - MARGIN - width);
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.maxHeight = '';

    const natural = panel.scrollHeight;
    const below = vh - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const cap = 18 * rem;
    const flip = below < Math.min(natural, cap) && above > below;
    const height = Math.max(Math.min(natural, cap, flip ? above : below), 0);

    panel.style.maxHeight = `${height}px`;
    panel.style.top = `${flip ? r.top - GAP - height : r.bottom + GAP}px`;
    panel.style.visibility = 'visible';
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, items, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture + stopPropagation, the house pattern: a dialog behind this also
      // closes on Escape, and the first press must only close the list.
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      // Scrolling the list itself is not scrolling away from it.
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // Keep the active option in view by moving the LIST's scroll only. Using
  // `scrollIntoView` would also scroll the page behind it.
  useLayoutEffect(() => {
    if (!open || active < 0) return;
    const panel = panelRef.current;
    const el = document.getElementById(optId(active));
    if (!panel || !el) return;
    if (el.offsetTop < panel.scrollTop) panel.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > panel.scrollTop + panel.clientHeight)
      panel.scrollTop = el.offsetTop + el.offsetHeight - panel.clientHeight + 4;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  useEffect(() => {
    const t = typed.current;
    return () => window.clearTimeout(t.timer);
  }, []);

  const selected = selectedIdx >= 0 ? items[selectedIdx] : undefined;
  const isPlaceholder = selected?.disabled && selected.value === '';

  // Group headings: a heading precedes the first option of each distinct group.
  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        title={title}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        {...aria}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        // Space is handled on keydown; without this the browser would also fire
        // a click on keyup and toggle the list straight back.
        onKeyUp={(e) => {
          if (e.key === ' ') e.preventDefault();
        }}
        onPointerDown={() => {
          kbd.current = false;
        }}
        className={cn(
          'inline-flex cursor-pointer items-center justify-between gap-2 text-left',
          className
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', isPlaceholder && 'text-faint')}>
          {selected ? selected.label : ' '}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            'text-muted ease-brand shrink-0 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {name ? <input type="hidden" name={name} value={current} /> : null}

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={listId}
              role="listbox"
              aria-label={aria['aria-label']}
              aria-labelledby={aria['aria-labelledby']}
              // Keep focus on the trigger when the list is pressed.
              onMouseDown={(e) => e.preventDefault()}
              // Placed by `place()` before first paint; `invisible` until then.
              className="wx-neo-raised invisible fixed top-0 left-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl p-1"
            >
              {items.map((it, i) => {
                const heading =
                  it.group && it.group !== lastGroup ? (
                    <div
                      key={`g-${it.group}-${i}`}
                      role="presentation"
                      className="text-faint px-2.5 pt-2 pb-1 font-mono text-[0.6875rem] font-medium tracking-[0.14em] uppercase"
                    >
                      {it.group}
                    </div>
                  ) : null;
                lastGroup = it.group;
                const isSel = i === selectedIdx;
                const isActive = i === active;
                return (
                  <Fragment key={`${i}-${it.value}`}>
                    {heading}
                    <div
                      id={optId(i)}
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={it.disabled || undefined}
                      title={it.text.length > 28 ? it.text : undefined}
                      onClick={() => commit(i)}
                      onPointerMove={() => {
                        kbd.current = false;
                        if (!it.disabled && active !== i) setActive(i);
                      }}
                      className={cn(
                        'ease-brand flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[0.875rem] sm:min-h-9',
                        'transition-colors duration-150',
                        it.disabled
                          ? 'text-faint cursor-not-allowed'
                          : isSel
                            ? 'bg-accent-soft text-accent font-semibold'
                            : isActive
                              ? 'bg-surface-2 text-text'
                              : 'text-muted',
                        isActive && kbd.current && 'outline-accent outline-2 -outline-offset-2'
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {isSel ? <Check size={14} aria-hidden className="shrink-0" /> : null}
                    </div>
                  </Fragment>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
