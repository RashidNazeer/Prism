import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up to its value.
 *
 * Hand-rolled rather than pulled from Motion, because it has to obey
 * `prefers-reduced-motion` by landing on the final value instantly, and because
 * the thing being animated is a formatted currency string rather than a
 * transform. Sixteen lines beats reaching for a spring and then fighting it.
 *
 * The value is announced to screen readers as its final number, not as the
 * ticking one, so nobody hears a slot machine.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduce || duration <= 0) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const begin = from.current;
    const delta = value - begin;
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease out. The number should arrive, not screech to a halt.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(begin + delta * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else from.current = value;
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      from.current = value;
    };
  }, [value, duration]);

  return (
    <span className={className}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
