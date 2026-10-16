import { useEffect, useState } from 'react';

/**
 * The ticking clock rule L5 asks for, lifted out of `Contests.tsx`.
 *
 * A deadline passing writes no row, so it fires no realtime event and
 * invalidates nothing. Without this, a creator who leaves the tab open across a
 * deadline keeps reading "3 days left" and a Join button on a contest the
 * database would refuse. `now` is passed INTO the helpers rather than read
 * inside them, which is also what makes them testable.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
