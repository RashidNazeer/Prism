import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * The "Categorise" button in the Creative angle testing header.
 *
 * THIS FILE IS THE SEAM, AND IT IS OURS. Like `collab-ad-figures.tsx`, it is the
 * only place that touches our backend on behalf of the vendored WurxBase
 * screen. `CreativeAngles.jsx` imports THIS component (through a fenced block
 * that `scripts/wurxbase-patches.mjs` applies) and never a Supabase client, so
 * `pnpm verify:isolation` still holds.
 *
 * WHAT IT DOES. One click asks the `collab-angles` Edge Function to queue every
 * video this brand posted in this month. A cron worker judges them in batches
 * of five against the brand's briefs and files them under the right angle. The
 * browser never sees a video list, a brief or an angle name: the function
 * derives all of it server side, and this button only says "do this brand and
 * month" and then watches a count.
 *
 * THE RING IS THE PROGRESS BAR. Done over total, where done means every state a
 * video can end in (filed, skipped, failed, needs review), so a run that fails
 * half its videos still reaches a full ring instead of hanging at 50.
 */

type Progress = {
  total: number;
  queued: number;
  sent: number;
  filed: number;
  skipped: number;
  failed: number;
  needs_review: number;
  running_batch: { state: string; last_phase: string | null; n_videos: number } | null;
  eta_seconds: number | null;
};

type StartResult = {
  queued: number;
  already: number;
  skipped_no_date: number;
};

/** How often to ask while work is in flight. */
const POLL_MS = 5000;

const PHASE_WORDS: Record<string, string> = {
  brief: 'Reading the brief',
  ingest: 'Downloading videos',
  phase1: 'Decoding',
  phase2: 'Transcribing',
  phase3: 'Watching',
  phase5: 'Judging',
  phase6: 'Judging',
  phase7: 'Judging',
  done: 'Done',
};

/**
 * `functions.invoke` hides the real error body behind `error.context`, which is
 * the raw Response. Same approach as `messageFrom` in `src/lib/tiktok.ts`.
 */
async function messageFrom(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* not JSON: fall through to the generic message */
    }
  }
  return (error as Error)?.message || fallback;
}

async function callAngles<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('collab-angles', { body });
  if (error) throw new Error(await messageFrom(error, fallback));
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Narrow the function's reply to what the button needs, tolerating gaps. */
function toProgress(raw: unknown): Progress {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rb = r.running_batch as { state?: unknown; last_phase?: unknown; n_videos?: unknown } | null | undefined;
  const eta = r.eta_seconds;
  return {
    total: num(r.total),
    queued: num(r.queued),
    sent: num(r.sent),
    filed: num(r.filed),
    skipped: num(r.skipped),
    failed: num(r.failed),
    needs_review: num(r.needs_review),
    running_batch: rb
      ? {
          state: String(rb.state ?? ''),
          last_phase: typeof rb.last_phase === 'string' ? rb.last_phase : null,
          n_videos: num(rb.n_videos),
        }
      : null,
    eta_seconds: typeof eta === 'number' && Number.isFinite(eta) && eta > 0 ? eta : null,
  };
}

const doneOf = (p: Progress) => p.filed + p.skipped + p.failed + p.needs_review;
const activeOf = (p: Progress | null) => !!p && p.queued + p.sent > 0;

type Props = {
  brand: string;
  month: string;
  canEdit: boolean;
  /** Called when more videos have been filed since the last look. */
  onFiled?: () => void;
};

export function CollabAngleCategorise({ brand, month, canEdit, onFiled }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* True once a run was started or seen in flight, so a finished run keeps its
     "12 of 12 done" line but a brand nobody has touched stays quiet. */
  const [touched, setTouched] = useState(false);

  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  /* Refs, so the poll never re-subscribes just because the parent re-rendered. */
  const onFiledRef = useRef(onFiled);
  useEffect(() => {
    onFiledRef.current = onFiled;
  }, [onFiled]);
  const lastFiled = useRef<number | null>(null);
  /* Guards a late answer for the previous brand or month from landing on this one. */
  const scope = useRef('');
  scope.current = `${brand}|${month}`;

  const ready = !!brand && !!month && canEdit;

  const look = useCallback(async (): Promise<Progress | null> => {
    const asked = `${brand}|${month}`;
    const raw = await callAngles<unknown>(
      { action: 'angles.progress', brand, month },
      'Could not read the progress.'
    );
    if (!alive.current || scope.current !== asked) return null;
    const next = toProgress(raw);
    const before = lastFiled.current;
    lastFiled.current = next.filed;
    setProgress(next);
    if (before !== null && next.filed > before) onFiledRef.current?.();
    return next;
  }, [brand, month]);

  /* A different brand or month is a different run: forget the old one. */
  useEffect(() => {
    lastFiled.current = null;
    setProgress(null);
    setError(null);
    setNote(null);
    setTouched(false);
  }, [brand, month]);

  /* One look on arrival, so a run begun earlier (or by a colleague) shows its ring. */
  useEffect(() => {
    if (!ready) return;
    look()
      .then((p) => {
        if (p && activeOf(p) && alive.current) setTouched(true);
      })
      .catch(() => {
        /* quiet: the button still works, and a click will surface a real error */
      });
  }, [ready, look]);

  const active = activeOf(progress);

  useEffect(() => {
    if (!ready || !active) return;
    const id = window.setInterval(() => {
      look().catch((e: unknown) => {
        if (alive.current) setError((e as Error).message);
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready, active, look]);

  const start = async () => {
    if (starting || active) return;
    setStarting(true);
    setError(null);
    setNote(null);
    try {
      const res = await callAngles<StartResult>(
        { action: 'angles.start', brand, month },
        'Could not start categorising.'
      );
      if (!alive.current) return;
      setTouched(true);
      if (num(res?.queued) === 0) {
        setNote(
          num(res?.already) > 0
            ? 'Nothing new to categorise.'
            : num(res?.skipped_no_date) > 0
              ? 'These videos have no date, so they cannot be filed by month.'
              : 'No videos to categorise.'
        );
      }
      await look();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setStarting(false);
    }
  };

  if (!brand || !month || !canEdit) return null;

  const busy = starting || active;
  const total = progress?.total ?? 0;
  const done = progress ? doneOf(progress) : 0;
  const pct = total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;

  let line = '';
  if (progress && total > 0 && (active || touched)) {
    line = `${done} of ${total} video${total === 1 ? '' : 's'} done`;
    const phase = progress.running_batch?.last_phase
      ? PHASE_WORDS[progress.running_batch.last_phase]
      : undefined;
    if (active && phase) line += `. ${phase}`;
    if (active && progress.eta_seconds !== null) {
      const mins = Math.max(1, Math.round(progress.eta_seconds / 60));
      line += `. About ${mins} min left (estimate)`;
    }
  }
  const shown = error ?? note ?? line;

  return (
    <div className="wx-cat" data-busy={busy ? 'true' : 'false'}>
      <div className="wx-cat-wrap">
        <button
          type="button"
          className="wx-cat-btn"
          onClick={start}
          disabled={busy}
          title={line || 'Sort the videos for this month into angles'}
          aria-busy={busy}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            <path d="M19 16v4M17 18h4" />
          </svg>
          Categorise
        </button>
        {busy && (
          <svg className="wx-cat-ring" aria-hidden="true" focusable="false">
            {/* The corner radius is set in CSS (rx/ry), because it must equal half the
                ring's height, and an SVG rx given as a big number would clamp to an
                ellipse instead of a pill. */}
            <rect className="wx-cat-track" x="0" y="0" width="100%" height="100%" fill="none" />
            <rect
              className="wx-cat-arc"
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="none"
              pathLength={100}
              strokeDasharray={100}
              strokeDashoffset={100 - pct}
            />
          </svg>
        )}
      </div>
      {shown && (
        <p
          className={'wx-cat-status' + (error ? ' wx-cat-status-err' : '')}
          role={error ? 'alert' : 'status'}
        >
          {shown}
        </p>
      )}
    </div>
  );
}

export default CollabAngleCategorise;
