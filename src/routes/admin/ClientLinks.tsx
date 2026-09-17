import { useMemo, useState } from 'react';
import { Check, Copy, Link2, Plus, ShieldOff } from 'lucide-react';
import { z } from 'zod';
import { FilterBar } from '@/components/layout/FilterBar';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import {
  useClientLinks,
  useCollabScope,
  useCreateClientLink,
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
 * THE LINK APPEARS ONCE. Only its fingerprint is stored, so this screen can
 * never show it again; the panel after creating is the only chance to copy it.
 * That is deliberate, and the reason is in DECISIONS, 2026-09-17.
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? '?'} ${y}`;
};
const dayLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

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

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [label, setLabel] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [allMonths, setAllMonths] = useState(true);
  const [months, setMonths] = useState<string[]>([]);
  const [days, setDays] = useState(90);
  const [sections, setSections] = useState({ kpis: true, topVideos: true, creators: true, videos: true });
  const [problem, setProblem] = useState('');
  const [minted, setMinted] = useState<{ url: string; label: string; expires: string } | null>(null);
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
    return all.filter((l) =>
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
          <Button size="sm" onClick={() => { setOpen((v) => !v); setProblem(''); }}>
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
        <div className="border-accent bg-accent-soft mt-4 rounded-xl border p-5">
          <p className="font-bold">Copy this link now. It cannot be shown again.</p>
          <p className="text-muted mt-1 text-[0.875rem]">
            {minted.label} · works until {minted.expires}. Anyone who has it can read the brands on it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="bg-surface-1 border-line min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-[0.8125rem]">
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
        <div className="border-line bg-surface-1 mt-4 rounded-xl border p-5">
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
                      setMonths((m) => m.filter((x) =>
                        (scope.data ?? []).filter((s) => next.includes(s.brand)).some((s) => s.months.includes(x))));
                    }}
                  >
                    {b.brand}
                  </Chip>
                ))}
                {scope.isLoading && <span className="text-muted text-[0.8125rem]">Loading brands…</span>}
              </div>
            </div>

            <div>
              <p className="text-[0.8125rem] font-bold">Months</p>
              <p className="text-muted text-[0.75rem]">
                Every month, or only the ones you pick. The client sees no others.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip on={allMonths} onClick={() => { setAllMonths(true); setMonths([]); }}>
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
                    <Chip key={m} on={months.includes(m)} onClick={() => setMonths(toggle(months, m))}>
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
                <Chip on={sections.kpis} onClick={() => setSections((s) => ({ ...s, kpis: !s.kpis }))}>
                  Top numbers
                </Chip>
                <Chip on={sections.topVideos} onClick={() => setSections((s) => ({ ...s, topVideos: !s.topVideos }))}>
                  Top videos
                </Chip>
                <Chip on={sections.creators} onClick={() => setSections((s) => ({ ...s, creators: !s.creators }))}>
                  Creators
                </Chip>
                <Chip on={sections.videos} onClick={() => setSections((s) => ({ ...s, videos: !s.videos }))}>
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

          {problem && <p className="text-danger mt-4 text-[0.875rem] font-semibold">{problem}</p>}

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
              <li key={i} className="border-line bg-surface-1 rounded-xl border p-5">
                <div className="wx-skeleton h-4 w-48 rounded" />
                <div className="wx-skeleton mt-3 h-3 w-72 rounded" />
              </li>
            ))}
          </ul>
        ) : links.isError ? (
          <div className="border-line bg-surface-1 rounded-xl border px-6 py-14 text-center">
            <p className="font-semibold">The links would not load</p>
            <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem]">
              {(links.error as Error)?.message ?? 'Something went wrong reaching the database.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="border-line bg-surface-1 rounded-xl border px-6 py-16 text-center">
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
              <li key={l.id} className="border-line bg-surface-1 rounded-xl border p-5">
                <LinkRow
                  link={l}
                  confirming={confirming === l.id}
                  onAskRevoke={() => setConfirming(l.id)}
                  onCancel={() => setConfirming(null)}
                  onRevoke={() => {
                    revoke.mutate(l.id);
                    setConfirming(null);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function LinkRow({
  link,
  confirming,
  onAskRevoke,
  onCancel,
  onRevoke,
}: {
  link: ClientLink;
  confirming: boolean;
  onAskRevoke: () => void;
  onCancel: () => void;
  onRevoke: () => void;
}) {
  const parts = [
    link.show_kpis && 'top numbers',
    link.show_top_videos && 'top videos',
    link.show_creators && 'creators',
    link.show_videos && 'their videos',
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{link.label}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold uppercase tracking-wider',
              link.is_live ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'
            )}
          >
            {link.revoked_at ? 'Revoked' : link.is_live ? 'Live' : 'Expired'}
          </span>
          <span className="text-faint font-mono text-[0.75rem]">{link.token_hint}…</span>
        </div>
        <p className="text-muted mt-1 text-[0.8125rem]">
          {link.brands.join(', ')} ·{' '}
          {link.months.length === 0 ? 'every month' : link.months.map(monthLabel).join(', ')} · {parts.join(', ')}
        </p>
        <p className="text-faint mt-1 text-[0.75rem]">
          {link.revoked_at
            ? `Revoked ${dayLabel(link.revoked_at)}`
            : `Works until ${dayLabel(link.expires_at)}`}
          {' · '}
          {link.view_count === 0
            ? 'never opened'
            : `opened ${link.view_count} time${link.view_count === 1 ? '' : 's'}, last ${dayLabel(link.last_viewed_at)}`}
        </p>
      </div>

      {link.is_live &&
        (confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-[0.8125rem] font-semibold">Stop this link?</span>
            <Button size="sm" variant="secondary" className="text-danger hover:text-danger" onClick={onRevoke}>
              Yes, stop it
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={onAskRevoke}>
            <ShieldOff size={15} aria-hidden />
            Stop sharing
          </Button>
        ))}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'rounded-md border px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors',
        on
          ? 'border-accent bg-accent text-on-accent'
          : 'border-line bg-surface-1 hover:bg-surface-2'
      )}
    >
      {children}
    </button>
  );
}
