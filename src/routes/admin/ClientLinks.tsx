import { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  ShieldOff,
} from 'lucide-react';
import { z } from 'zod';
import { FilterBar } from '@/components/layout/FilterBar';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import {
  useClientLinkOpens,
  useClientLinks,
  useCollabScope,
  useCreateClientLink,
  useReplaceClientLink,
  useRevokeClientLink,
  type ClientLink,
} from '@/lib/admin/useClientLinks';

/**
 * CLIENT LINKS: read-only views of Paid Collabs Brands, for people with no
 * account.
 *
 * Rashid, 2026-09-17: "a client sharing section which asad and superadmin maybe
 * boss can manage", and then: "we need to have custom control we can set that
 * which data should be shared with them and which not like which month data".
 *
 * So one link carries: which brands, which months, which parts of the brand
 * page, and how long it lives. What the client then sees is the BRANDS SECTION
 * and nothing else — "no other section no other data please".
 *
 * A LINK CAN BE COPIED AGAIN, AND OPENED TO SEE EVERYTHING ABOUT IT. Rashid,
 * 2026-09-18: "no option to copy again and we should be able to open it and see
 * details please make it properly". Until then only a fingerprint was stored,
 * which protected a case that barely exists — the data a link opens lives in the
 * same database — and cost an admin the ability to send a client their link
 * twice. See DECISIONS, 2026-09-18.
 *
 * Links minted before that change have no stored address. They cannot be
 * recovered, only replaced, and the panel says so in those words.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? '?'} ${y}`;
};
const dayLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

const NewLink = z.object({
  label: z.string().trim().min(1, 'Give it a name you will recognise').max(80),
  brands: z.array(z.string()).min(1, 'Pick at least one brand'),
  months: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
  days: z.number().int().min(1).max(365),
});

export function ClientLinks() {
  const links = useClientLinks();
  const scope = useCollabScope();
  const create = useCreateClientLink();
  const revoke = useRevokeClientLink();
  const replace = useReplaceClientLink();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [label, setLabel] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [allMonths, setAllMonths] = useState(true);
  const [months, setMonths] = useState<string[]>([]);
  const [days, setDays] = useState(90);
  const [sections, setSections] = useState({
    kpis: true,
    topVideos: true,
    creators: true,
    videos: true,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [minted, setMinted] = useState<{ url: string; label: string; expires: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  /* The months on offer are the months the CHOSEN brands actually have work in,
     so a link can never point at a month with nothing behind it. */
  const monthsOnOffer = useMemo(() => {
    const picked = (scope.data ?? []).filter((b) => brands.includes(b.brand));
    return [...new Set(picked.flatMap((b) => b.months))].sort().reverse();
  }, [scope.data, brands]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = links.data ?? [];
    if (!q) return all;
    return all.filter(
      (l) =>
        l.label.toLowerCase().includes(q) || l.brands.some((b) => b.toLowerCase().includes(q))
    );
  }, [links.data, search]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const submit = async () => {
    setProblem('');
    const parsed = NewLink.safeParse({ label, brands, months: allMonths ? [] : months, days });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    if (!sections.kpis && !sections.topVideos && !sections.creators) {
      setProblem('Share at least one part of the page');
      return;
    }
    try {
      const row = await create.mutateAsync({
        ...parsed.data,
        showKpis: sections.kpis,
        showTopVideos: sections.topVideos,
        showCreators: sections.creators,
        showVideos: sections.videos,
      });
      setMinted({
        url: `${window.location.origin}/share/collabs/${row.token}`,
        label,
        expires: dayLabel(row.expires_at),
      });
      setOpen(false);
      setLabel('');
      setBrands([]);
      setMonths([]);
      setAllMonths(true);
    } catch (e) {
      setProblem((e as Error).message ?? 'The link could not be created');
    }
  };

  return (
    <>
      <FilterBar
        action={
          <Button
            size="sm"
            onClick={() => {
              setOpen((v) => !v);
              setProblem('');
            }}
          >
            <Plus size={15} aria-hidden />
            New link
          </Button>
        }
      >
        <Input
          id="client-link-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client or brand"
          className="w-full sm:w-64"
        />
      </FilterBar>

      {/* the link, the one time it can be seen */}
      {minted && (
        <div className="bg-accent-soft mt-4 rounded-xl p-5">
          <p className="font-bold">Your link is ready.</p>
          <p className="text-muted mt-1 text-[0.875rem]">
            {minted.label} · works until {minted.expires}. Anyone who has it can read the brands
            on it. You can copy it again later by opening it in the list.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="wx-neo-inset min-w-0 flex-1 truncate rounded-md px-3 py-2 text-[0.8125rem]">
              {minted.url}
            </code>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(minted.url);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMinted(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* the form */}
      {open && (
        <div className="wx-neo-raised mt-4 rounded-xl p-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <Label htmlFor="link-label">Who is it for</Label>
              <Input
                id="link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Penetrex — Sarah"
                className="mt-1.5 w-full"
              />

              <p className="mt-5 text-[0.8125rem] font-bold">Brands</p>
              <p className="text-muted text-[0.75rem]">One link can carry several.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(scope.data ?? []).map((b) => (
                  <Chip
                    key={b.brand}
                    on={brands.includes(b.brand)}
                    onClick={() => {
                      const next = toggle(brands, b.brand);
                      setBrands(next);
                      setMonths((m) =>
                        m.filter((x) =>
                          (scope.data ?? [])
                            .filter((s) => next.includes(s.brand))
                            .some((s) => s.months.includes(x))
                        )
                      );
                    }}
                  >
                    {b.brand}
                  </Chip>
                ))}
                {scope.isLoading && (
                  <span className="text-muted text-[0.8125rem]">Loading brands…</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-[0.8125rem] font-bold">Months</p>
              <p className="text-muted text-[0.75rem]">
                Every month, or only the ones you pick. The client sees no others.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip
                  on={allMonths}
                  onClick={() => {
                    setAllMonths(true);
                    setMonths([]);
                  }}
                >
                  Every month
                </Chip>
                <Chip on={!allMonths} onClick={() => setAllMonths(false)}>
                  Chosen months
                </Chip>
              </div>
              {!allMonths && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {monthsOnOffer.length === 0 && (
                    <span className="text-muted text-[0.8125rem]">Pick a brand first.</span>
                  )}
                  {monthsOnOffer.map((m) => (
                    <Chip
                      key={m}
                      on={months.includes(m)}
                      onClick={() => setMonths(toggle(months, m))}
                    >
                      {monthLabel(m)}
                    </Chip>
                  ))}
                </div>
              )}

              <p className="mt-5 text-[0.8125rem] font-bold">What they see</p>
              <p className="text-muted text-[0.75rem]">
                Ad spend, ROI, what we pay out and any contact details are never shared.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip
                  on={sections.kpis}
                  onClick={() => setSections((s) => ({ ...s, kpis: !s.kpis }))}
                >
                  Top numbers
                </Chip>
                <Chip
                  on={sections.topVideos}
                  onClick={() => setSections((s) => ({ ...s, topVideos: !s.topVideos }))}
                >
                  Top videos
                </Chip>
                <Chip
                  on={sections.creators}
                  onClick={() => setSections((s) => ({ ...s, creators: !s.creators }))}
                >
                  Creators
                </Chip>
                <Chip
                  on={sections.videos}
                  onClick={() => setSections((s) => ({ ...s, videos: !s.videos }))}
                >
                  Their videos
                </Chip>
              </div>

              <div className="mt-5 max-w-[12rem]">
                <Label htmlFor="link-days">Works for</Label>
                <Select
                  id="link-days"
                  value={String(days)}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="mt-1.5 w-full"
                >
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">a year</option>
                </Select>
              </div>
            </div>
          </div>

          {problem && (
            <p className="text-danger mt-4 text-[0.875rem] font-semibold">{problem}</p>
          )}

          <div className="mt-5 flex items-center gap-2">
            <Button onClick={() => void submit()} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create link'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* the links */}
      <div className="mt-4">
        {links.isLoading ? (
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="wx-neo-raised rounded-xl p-5">
                <div className="wx-skeleton h-4 w-48 rounded" />
                <div className="wx-skeleton mt-3 h-3 w-72 rounded" />
              </li>
            ))}
          </ul>
        ) : links.isError ? (
          <div className="wx-neo-raised rounded-xl px-6 py-14 text-center">
            <p className="font-semibold">The links would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem]">
              {(links.error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="wx-neo-raised rounded-xl px-6 py-16 text-center">
            <Link2 size={26} aria-hidden className="text-faint mx-auto" />
            <p className="mt-4 font-semibold">
              {search ? 'No link matches that' : 'No client links yet'}
            </p>
            <p className="text-muted mx-auto mt-2 max-w-md text-[0.875rem] leading-relaxed">
              {search
                ? 'Try the client name or the brand.'
                : 'A link shows a client their brand’s creators, videos and results, read only, with no login.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((l) => (
              <li key={l.id} className="wx-neo-raised overflow-hidden rounded-xl">
                <LinkRow
                  link={l}
                  open={expanded === l.id}
                  onToggle={() => setExpanded(expanded === l.id ? null : l.id)}
                  confirming={confirming === l.id}
                  onAskRevoke={() => setConfirming(l.id)}
                  onCancel={() => setConfirming(null)}
                  onRevoke={() => {
                    revoke.mutate(l.id);
                    setConfirming(null);
                  }}
                  onReplace={async () => {
                    const row = await replace.mutateAsync(l.id);
                    setMinted({
                      url: `${window.location.origin}/share/collabs/${row.token}`,
                      label: `${l.label} — new address`,
                      expires: dayLabel(row.expires_at),
                    });
                  }}
                  replacing={replace.isPending}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * ONE LINK: a headline that opens into everything about it.
 *
 * Rashid, 2026-09-18: "no option to copy again and we should be able to open it
 * and see details please make it properly". So the row copies without opening,
 * and opening shows the address, exactly what this client can see, and every
 * time somebody has looked.
 */
function LinkRow({
  link,
  open,
  onToggle,
  confirming,
  onAskRevoke,
  onCancel,
  onRevoke,
  onReplace,
  replacing,
}: {
  link: ClientLink;
  open: boolean;
  onToggle: () => void;
  confirming: boolean;
  onAskRevoke: () => void;
  onCancel: () => void;
  onRevoke: () => void;
  onReplace: () => void;
  replacing: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url = link.token ? `${window.location.origin}/share/collabs/${link.token}` : null;
  const parts = [
    link.show_kpis && 'top numbers',
    link.show_top_videos && 'top videos',
    link.show_creators && 'creators',
    link.show_videos && 'their videos',
  ].filter(Boolean) as string[];

  const copy = () => {
    if (!url) return;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <ChevronRight
              size={15}
              aria-hidden
              className={cn('text-faint transition-transform', open && 'rotate-90')}
            />
            <span className="font-bold">{link.label}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold tracking-wider uppercase',
                link.is_live ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'
              )}
            >
              {link.revoked_at ? 'Stopped' : link.is_live ? 'Live' : 'Expired'}
            </span>
          </span>
          <span className="text-muted mt-1 block text-[0.8125rem]">
            {link.brands.join(', ')} ·{' '}
            {link.months.length === 0 ? 'every month' : link.months.map(monthLabel).join(', ')}
          </span>
          <span className="text-faint mt-1 block text-[0.75rem]">
            {link.revoked_at
              ? `Stopped ${dayLabel(link.revoked_at)}`
              : `Works until ${dayLabel(link.expires_at)}`}
            {' · '}
            {link.view_count === 0
              ? 'never opened'
              : `opened ${link.view_count} time${link.view_count === 1 ? '' : 's'}, last ${dayLabel(link.last_viewed_at)}`}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {url && link.is_live && (
            <Button size="sm" variant="secondary" onClick={copy}>
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          )}
          {link.is_live &&
            (confirming ? (
              <>
                <span className="text-[0.8125rem] font-semibold">Stop it?</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-danger hover:text-danger"
                  onClick={onRevoke}
                >
                  Yes, stop
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                  Keep
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={onAskRevoke}>
                <ShieldOff size={15} aria-hidden />
                Stop sharing
              </Button>
            ))}
        </div>
      </div>

      {open && (
        <div className="border-line bg-surface-2 border-t p-5">
          {/* the address */}
          {url ? (
            <>
              <p className="text-[0.8125rem] font-bold">The link</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="wx-neo-inset min-w-0 flex-1 truncate rounded-md px-3 py-2 text-[0.8125rem]">
                  {url}
                </code>
                <Button size="sm" onClick={copy}>
                  {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open(url, '_blank', 'noopener')}
                >
                  <ExternalLink size={15} aria-hidden />
                  Open
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[0.8125rem]">
              <span className="font-bold">This link cannot be shown again.</span>{' '}
              <span className="text-muted">
                It was made before we started keeping a copy. Give it a new address and send
                that instead.
              </span>
            </p>
          )}

          {/* what this client can see */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Brands" value={link.brands.join(', ')} />
            <Fact
              label="Months"
              value={
                link.months.length === 0
                  ? 'Every month'
                  : link.months.map(monthLabel).join(', ')
              }
            />
            <Fact label="Sections" value={parts.join(', ') || 'nothing'} />
            <Fact
              label="Made"
              value={`${dayLabel(link.created_at)} · ends ${dayLabel(link.expires_at)}`}
            />
          </div>

          <Opens id={link.id} />

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onReplace} disabled={replacing}>
              <RefreshCw size={15} aria-hidden />
              {replacing ? 'Making a new address…' : 'Give it a new address'}
            </Button>
            <span className="text-muted text-[0.75rem]">
              The old address stops working at once. Everything else stays.
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/** When somebody looked. The visitor is a hash, so two readers can be told
    apart without anybody's address being kept. */
function Opens({ id }: { id: string }) {
  const opens = useClientLinkOpens(id);
  const rows = opens.data ?? [];
  return (
    <div className="mt-5">
      <p className="text-[0.8125rem] font-bold">Opens</p>
      {opens.isLoading ? (
        <div className="wx-skeleton mt-2 h-4 w-40 rounded" />
      ) : rows.length === 0 ? (
        <p className="text-muted mt-1 text-[0.8125rem]">Nobody has opened this link yet.</p>
      ) : (
        <>
          <p className="text-muted mt-1 text-[0.75rem]">
            {rows.length === 50 ? 'The 50 most recent' : `${rows.length} in total`} ·{' '}
            {new Set(rows.map((r) => r.visitor)).size} different reader
            {new Set(rows.map((r) => r.visitor)).size === 1 ? '' : 's'}
          </p>
          <ul className="wx-neo-raised divide-line mt-2 max-h-52 divide-y overflow-auto rounded-md">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 px-3 py-2 text-[0.8125rem]"
              >
                <span>{new Date(r.viewed_at).toLocaleString()}</span>
                <span className="text-faint font-mono text-[0.75rem]">{r.visitor || '—'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-faint text-[0.6875rem] font-extrabold tracking-wider uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-[0.8125rem]">{value}</p>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'rounded-md px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors',
        on ? 'bg-accent text-on-accent' : 'wx-neo-raised-sm wx-neo-press'
      )}
    >
      {children}
    </button>
  );
}
