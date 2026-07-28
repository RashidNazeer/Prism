import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion, motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';

/**
 * The product visual in the hero: a stylised "My Numbers" card.
 *
 * This is an ILLUSTRATION, not a real creator's data, and it is labelled
 * "Example" on the card so nobody can mistake it for a live figure. It exists
 * because the whole pitch is "you get a dashboard, not a screenshot" - showing
 * the dashboard is more convincing than describing it.
 */

const BARS = [38, 52, 41, 67, 58, 74, 63, 88, 79, 96, 85, 100];

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const count = (n: number) => Math.round(n).toLocaleString('en-US');

const STATS = [
  { label: 'Orders', value: 1284, format: count },
  { label: 'Commission', value: 4892, format: money },
  { label: 'Ad spend', value: 2310, format: money },
];

/**
 * Counts up to `to` once, when scrolled into view. Writes straight to the DOM
 * so it runs at 60fps without re-rendering React on every frame.
 */
function CountUp({
  to,
  format,
  className,
}: {
  to: number;
  format: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;

    // Respect the OS "reduce motion" setting - show the final number at once.
    if (reduced) {
      el.textContent = format(to);
      return;
    }

    const controls = animate(0, to, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [inView, to, format, reduced]);

  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}

export function NumbersPreview() {
  const reduced = useReducedMotion();

  return (
    <div className="relative">
      {/* Soft brand glow behind the card so it lifts off the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-accent-soft blur-3xl"
      />

      <div className="relative rounded-2xl border border-line bg-surface-1 p-6 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="size-6 rounded-lg bg-accent" aria-hidden />
            <span className="text-sm font-semibold">Brand Hub</span>
          </div>
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            Example
          </span>
        </div>

        <div className="mt-7">
          <p className="font-mono text-[10px] tracking-[0.16em] text-faint uppercase">
            GMV this month
          </p>
          <div className="mt-2 flex items-end gap-3">
            <CountUp
              to={48920}
              format={money}
              className="wx-lining font-display text-[2.75rem] leading-none font-extrabold tracking-tight"
            />
            <span className="mb-1 inline-flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
              <ArrowUpRight size={12} aria-hidden />
              34%
            </span>
          </div>
        </div>

        {/* Bar chart - decorative, so hidden from screen readers. */}
        <div className="mt-7 flex h-20 items-end gap-1.5" aria-hidden>
          {BARS.map((h, i) => (
            <motion.span
              key={i}
              initial={reduced ? false : { height: 0 }}
              whileInView={{ height: `${h}%` }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.7, delay: i * 0.045, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 rounded-t-sm bg-accent"
              style={{ opacity: 0.25 + (i / BARS.length) * 0.75 }}
            />
          ))}
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {STATS.map((s) => (
            <div key={s.label} className="bg-surface-2 px-3 py-3.5">
              <dt className="font-mono text-[10px] tracking-[0.12em] text-faint uppercase">
                {s.label}
              </dt>
              <dd className="mt-1.5">
                <CountUp to={s.value} format={s.format} className="wx-lining text-[15px] font-bold" />
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 font-mono text-[10px] tracking-[0.12em] text-faint uppercase">
          Updated 2 hours ago
        </p>
      </div>
    </div>
  );
}
