import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { WurxMark } from '@/components/brand/WurxMark';
import { money } from '@/lib/money';

/**
 * WHAT A CLIENT SEES, WITH NO ACCOUNT AT ALL.
 *
 * Rashid, 2026-09-17: a link per brand (or several brands) that Asad or an
 * admin can hand to a client. "Clients would need no login at all ... Only read
 * access and only the brand they have been shared."
 *
 * THIS PAGE HOLDS NO SECRETS AND NO CLIENT. It never imports our Supabase
 * client, so it carries no key, no session and no way to reach a table. It
 * POSTs the link to the `collab-share` function and renders whatever comes
 * back. The function decides what a client may see; this file decides only how
 * it looks. If that ever inverts — if this page starts hiding a field the
 * server sent — the hiding is decoration and the field is one "view source"
 * away from being read.
 *
 * There is nothing to click that writes. No form, no status, no export.
 */

type Video = {
  url: string;
  date: string | null;
  views: number;
  gmv: number;
  items: number;
  product: string | null;
  thumb: string | null;
  spark: string | null;
};

type Creator = {
  name: string;
  tiktok: string[];
  hiredBy: string | null;
  deals: number;
  category: string | null;
  onboarded: string | null;
  completedOn: string | null;
  deal: number;
  perVideo: number | null;
  committed: number;
  delivered: number;
  views: number;
  gmv: number;
  items: number;
  videos?: Video[];
};

type BrandBlock = {
  brand: string;
  contentGuide?: string;
  kpis?: {
    budget: number;
    remaining: number;
    creators: number;
    delivered: number;
    committed: number;
    views: number;
    gmv: number;
  };
  topVideos?: { url: string; thumb: string | null; gmv: number; views: number; name: string }[];
  creators?: Creator[];
};

type Payload = {
  label: string;
  sections: { kpis: boolean; topVideos: boolean; creators: boolean; videos: boolean };
  months: string[];
  month: string;
  expiresAt: string;
  data: BrandBlock[];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string) => {
  if (key === 'all') return 'All time';
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1] ?? '?'} ${y}`;
};
const dayLabel = (iso: string | null) => {
  if (!iso) return '–';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '–' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const handleOf = (raw: string) => {
  const t = String(raw).trim().replace(/\/$/, '');
  if (t.startsWith('http')) {
    const last = t.split('/').pop() ?? '';
    return last.startsWith('@') ? last : `@${last}`;
  }
  return t.startsWith('@') ? t : `@${t}`;
};
const profileUrl = (raw: string) =>
  String(raw).trim().startsWith('http') ? String(raw).trim() : `https://www.tiktok.com/${handleOf(raw)}`;

export function ShareCollab() {
  const { token = '' } = useParams();
  const [month, setMonth] = useState<string | null>(null);
  const [brandIdx, setBrandIdx] = useState(0);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /* A shared page must never turn up in a search result. */
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(async (askedMonth: string | null) => {
    setState((s) => (s === 'ready' ? 'ready' : 'loading'));
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collab-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(askedMonth ? { token, month: askedMonth } : { token }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 404) {
        setMessage(body?.error ?? 'This link is not active any more.');
        setState('gone');
        return;
      }
      if (!res.ok || !body?.data) {
        setMessage(body?.error ?? 'Something went wrong loading this page.');
        setState('error');
        return;
      }
      setPayload(body as Payload);
      setMonth((body as Payload).month);
      setState('ready');
    } catch {
      setMessage('We could not reach the server. Check your connection and try again.');
      setState('error');
    }
  }, [token]);

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    document.title = payload ? `${payload.data.map((b) => b.brand).join(', ')} · Wurx Media` : 'Wurx Media';
  }, [payload]);

  const brand = payload?.data[brandIdx] ?? payload?.data[0];
  const expires = useMemo(
    () => (payload ? new Date(payload.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : ''),
    [payload]
  );

  if (state === 'loading' && !payload) {
    return (
      <Shell>
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="h-8 w-56 animate-pulse rounded-md bg-surface-2" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
          <span className="sr-only">Loading this report</span>
        </div>
      </Shell>
    );
  }

  if (state === 'gone' || state === 'error') {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-xl border border-line bg-surface-1 p-8 text-center">
          <h1 className="text-xl font-extrabold">{state === 'gone' ? 'This link has ended' : 'Something went wrong'}</h1>
          <p className="mt-3 leading-relaxed text-muted">{message}</p>
          {state === 'error' && (
            <button
              type="button"
              onClick={() => void load(month)}
              className="mt-6 rounded-md border border-line-interactive px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Try again
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (!payload || !brand) return null;

  return (
    <Shell>
      {/* ── who this is for, and what it is ───────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4" data-month={payload.month}>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{brand.brand}</h1>
          <p className="mt-1 text-sm text-muted">
            Creator campaign report · {monthLabel(payload.month)}
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted">
          Read only
        </span>
      </header>

      {/* ── which brand, which month ──────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {payload.data.length > 1 &&
          payload.data.map((b, i) => (
            <button
              key={b.brand}
              type="button"
              onClick={() => setBrandIdx(i)}
              aria-pressed={i === brandIdx}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                i === brandIdx ? 'bg-accent text-on-accent' : 'border border-line bg-surface-1 hover:bg-surface-2'
              }`}
            >
              {b.brand}
            </button>
          ))}
        {payload.data.length > 1 && <span className="mx-1 h-5 w-px bg-line" aria-hidden />}
        {[...payload.months.slice(0, 12), 'all'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMonth(m); void load(m); }}
            aria-pressed={m === payload.month}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              m === payload.month ? 'bg-accent text-on-accent' : 'border border-line bg-surface-1 hover:bg-surface-2'
            }`}
          >
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {/* ── the numbers ───────────────────────────────────────────────── */}
      {brand.kpis && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Budget" value={money(brand.kpis.budget)} sub={`${brand.kpis.creators} creator${brand.kpis.creators === 1 ? '' : 's'}`} />
          <Card label="Remaining" value={money(brand.kpis.remaining)} sub={brand.kpis.remaining < 0 ? 'over budget' : 'left to allocate'} />
          <Card label="Videos delivered" value={`${brand.kpis.delivered}${brand.kpis.committed ? `/${brand.kpis.committed}` : ''}`} sub="posted so far" />
          <Card label="GMV" value={money(brand.kpis.gmv)} sub={`${compact(brand.kpis.views)} views`} accent />
        </div>
      )}

      {/* ── the best of the work ──────────────────────────────────────── */}
      {brand.topVideos && brand.topVideos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">Top videos by GMV</h2>
          <ul className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {brand.topVideos.map((v, i) => (
              <li key={v.url + i} className="w-[104px] flex-shrink-0">
                <a href={v.url} target="_blank" rel="noreferrer noopener" className="group block">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-lg border border-line bg-surface-2">
                    {v.thumb ? (
                      <img src={v.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-faint" aria-hidden>▶</span>
                    )}
                    <span className="absolute bottom-1 left-1 rounded-md bg-success px-1.5 py-0.5 text-[0.625rem] font-extrabold text-inverse">
                      {money(v.gmv)}
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-xs font-bold group-hover:underline">{v.name}</span>
                  <span className="block text-[0.6875rem] text-muted">{compact(v.views)} views</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── the creators ──────────────────────────────────────────────── */}
      {brand.creators && (
        <section className="mt-8">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">
            Creators · {brand.creators.length}
          </h2>

          {brand.creators.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line bg-surface-1 p-8 text-center text-muted">
              No creators posted for {brand.brand} in {monthLabel(payload.month)}.
            </p>
          ) : (
            <>
              <div className="mt-3 hidden gap-3 px-3 text-[0.6875rem] font-extrabold uppercase tracking-wider text-faint md:grid md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))]">
                <span>Creator</span>
                <span className="text-right">Deal</span>
                <span className="text-right">Videos</span>
                <span className="text-right">Views</span>
                <span className="text-right">GMV</span>
                <span className="text-right">Items sold</span>
              </div>
              <ul className="mt-2 space-y-2">
                {brand.creators.map((c, i) => {
                  const id = `${c.name}-${i}`;
                  const isOpen = open === id;
                  return (
                    /* The data- attributes are for verify:collab-share-ui, which
                       compares each row with the database rather than trusting
                       the words on screen. They carry nothing the row does not
                       already show. */
                    <li
                      key={id}
                      className="rounded-xl border border-line bg-surface-1"
                      data-creator={c.name}
                      data-deal={c.deal}
                      data-delivered={c.delivered}
                      data-views={c.views}
                      data-gmv={c.gmv}
                    >
                      <div className="grid gap-2 p-3 md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))] md:items-center md:gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-bold">{c.name}</span>
                            {c.deals > 1 && (
                              <span
                                title={`${c.deals} campaigns with this creator`}
                                className="rounded-full border border-line-strong bg-surface-2 px-1.5 text-[0.625rem] font-extrabold tabular-nums"
                              >
                                {c.deals}
                              </span>
                            )}
                          </div>
                          {c.tiktok.length > 0 && (
                            <a
                              href={profileUrl(c.tiktok[0]!)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-xs text-accent hover:underline"
                            >
                              {handleOf(c.tiktok[0]!)}
                            </a>
                          )}
                        </div>
                        <Cell label="Deal">
                          {c.deal > 0 ? money(c.deal) : '–'}
                          {c.perVideo ? <span className="block text-[0.6875rem] text-muted">{money(c.perVideo)}/video</span> : null}
                        </Cell>
                        <Cell label="Videos">
                          {c.delivered}
                          {c.committed ? <span className="text-muted">/{c.committed}</span> : null}
                        </Cell>
                        <Cell label="Views">{compact(c.views)}</Cell>
                        <Cell label="GMV">
                          <span className="font-bold text-success">{money(c.gmv)}</span>
                        </Cell>
                        <Cell label="Items sold">{c.items || '–'}</Cell>
                      </div>

                      {c.videos && c.videos.length > 0 && (
                        <div className="border-t border-line px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setOpen(isOpen ? null : id)}
                            aria-expanded={isOpen}
                            className="text-xs font-bold text-accent hover:underline"
                          >
                            {isOpen ? 'Hide' : 'Show'} {c.videos.length} video{c.videos.length === 1 ? '' : 's'}
                          </button>
                          {isOpen && (
                            <ul className="mt-3 space-y-2">
                              {c.videos.map((v, vi) => (
                                <li
                                  key={v.url + vi}
                                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-2 text-xs"
                                >
                                  <a
                                    href={v.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="font-semibold text-accent hover:underline"
                                  >
                                    Video {vi + 1}
                                  </a>
                                  <span className="text-muted">{dayLabel(v.date)}</span>
                                  <span>{compact(v.views)} views</span>
                                  <span className="font-semibold text-success">{money(v.gmv)}</span>
                                  {v.items > 0 && <span className="text-muted">{v.items} sold</span>}
                                  {v.spark && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void navigator.clipboard?.writeText(v.spark ?? '');
                                        setCopied(v.url + vi);
                                        window.setTimeout(() => setCopied(null), 1600);
                                      }}
                                      className="ml-auto rounded-md border border-line-interactive px-2 py-1 font-semibold hover:bg-surface-3"
                                    >
                                      {copied === v.url + vi ? 'Copied' : 'Copy spark code'}
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      <footer className="mt-10 border-t border-line pt-6 text-xs text-muted">
        <p>
          Shared with you by Wurx Media. This page is read only and works until {expires}.
        </p>
        <p className="mt-1">Figures come from TikTok Shop and update through the day.</p>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <WurxMark />
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <p className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${accent ? 'text-success' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm tabular-nums md:block md:text-right">
      <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-faint md:hidden">{label}</span>
      <span>{children}</span>
    </div>
  );
}
