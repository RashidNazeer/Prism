import { useMemo } from 'react';
import { m, useReducedMotion } from 'motion/react';

/**
 * Colourful pieces falling, for the moment a creator is approved.
 *
 * Hand rolled rather than a library: this is one animation, and the brief says
 * no extra dependencies. Every colour is a `--wx-*` token, so it reads
 * correctly in both themes instead of confetti tuned for a dark background
 * turning invisible on a light one.
 *
 * Nothing renders at all when the OS asks for reduced motion. Simply letting
 * the global "no animations" rule apply would freeze forty coloured squares
 * across the middle of the screen, which is worse than no confetti.
 */
const COLOURS = [
  'var(--wx-accent)',
  'var(--wx-success)',
  'var(--wx-info)',
  'var(--wx-warning)',
  'var(--wx-text)',
];

export function Confetti({ pieces = 44 }: { pieces?: number }) {
  const reduced = useReducedMotion();

  // Generated once so a re-render does not restart every piece from the top.
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 2.6 + Math.random() * 1.9,
        drift: (Math.random() - 0.5) * 140,
        spin: (Math.random() - 0.5) * 900,
        size: 6 + Math.random() * 8,
        colour: COLOURS[i % COLOURS.length]!,
        round: Math.random() > 0.6,
      })),
    [pieces]
  );

  if (reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bits.map((b) => (
        <m.span
          key={b.id}
          initial={{ y: '-12vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{
            y: '112vh',
            x: b.drift,
            rotate: b.spin,
            opacity: [1, 1, 0.9, 0],
          }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            ease: 'linear',
            times: [0, 0.7, 0.9, 1],
          }}
          style={{
            position: 'absolute',
            left: `${b.left}%`,
            width: b.size,
            height: b.round ? b.size : b.size * 1.7,
            background: b.colour,
            borderRadius: b.round ? '9999px' : '2px',
          }}
        />
      ))}
    </div>
  );
}
