import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

/**
 * One realtime channel per name, however many components ask for it.
 *
 * THE BUG THIS EXISTS TO KILL, seen in the browser on 2026-08-13:
 *
 *   Unexpected Application Error!
 *   cannot add `postgres_changes` callbacks for realtime:job-progress:<uuid>
 *   after `subscribe()`.
 *
 * `supabase.channel(name)` does NOT always make a new channel. If one with that
 * name is already open it hands back the existing one. So when two components
 * on the same screen both run a hook that subscribes, the second one calls
 * `.on()` on a channel the first has already subscribed, supabase-js throws,
 * and because it throws during render the whole page is replaced by an error
 * screen. A creator clicking "Add a video" saw exactly that.
 *
 * Naming each channel uniquely would stop the crash and cause a quieter
 * problem: N components on one screen opening N subscriptions to the same rows,
 * and the first to unmount tearing the channel out from under the others,
 * because `removeChannel` does not care who else is listening.
 *
 * So: reference counting. The first caller opens the channel and subscribes,
 * every later caller just adds a listener, and the channel is removed when the
 * last listener goes. Everything in this product that listens to Postgres
 * should come through here rather than calling `.channel()` itself.
 */

interface Binding {
  /** The table to watch. */
  table: string;
  /** A PostgREST filter, for example `creator_id=eq.<uuid>`. */
  filter?: string;
  /** Defaults to every event. */
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema?: string;
}

interface Entry {
  channel: RealtimeChannel;
  listeners: Set<() => void>;
  /** What the first caller asked for, so a mismatch can be caught in dev. */
  signature: string;
}

const open = new Map<string, Entry>();

const signatureOf = (bindings: Binding[]) =>
  bindings
    .map((b) => `${b.schema ?? 'public'}.${b.table}:${b.event ?? '*'}:${b.filter ?? ''}`)
    .sort()
    .join('|');

/**
 * Listen to some tables, and get back the function that stops listening.
 *
 * Call it from a `useEffect` and return its result, which is exactly the shape
 * React wants:
 *
 *   useEffect(() => {
 *     if (!user?.id) return;
 *     return joinChannel(`job-progress:${user.id}`, [...], () => refetch());
 *   }, [user?.id]);
 */
export function joinChannel(
  name: string,
  bindings: Binding[],
  onChange: () => void
): () => void {
  const signature = signatureOf(bindings);
  let entry = open.get(name);

  if (entry && entry.signature !== signature) {
    // Two different sets of bindings sharing one name. The second caller would
    // silently get the first one's rows, which is the kind of thing that gets
    // debugged as "realtime is flaky" for a week. Loud in development, and
    // survivable in production by giving this caller its own channel.
    if (import.meta.env.DEV) {
      console.error(
        `[realtime] two different subscriptions share the channel name "${name}". ` +
          `Give one of them a different name.`
      );
    }
    name = `${name}#${signature.length}`;
    entry = open.get(name);
  }

  if (!entry) {
    const supabase = getSupabase();
    const listeners = new Set<() => void>();
    // Read the set at fire time rather than closing over it, so a listener
    // added after subscribe still hears the next event.
    const fire = () => {
      for (const listener of listeners) listener();
    };

    let channel = supabase.channel(name);
    for (const b of bindings) {
      channel = channel.on(
        'postgres_changes',
        {
          event: b.event ?? '*',
          schema: b.schema ?? 'public',
          table: b.table,
          ...(b.filter ? { filter: b.filter } : {}),
        },
        fire
      );
    }
    channel.subscribe();

    entry = { channel, listeners, signature };
    open.set(name, entry);
  }

  entry.listeners.add(onChange);
  const key = name;

  return () => {
    const current = open.get(key);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size === 0) {
      open.delete(key);
      void getSupabase().removeChannel(current.channel);
    }
  };
}
