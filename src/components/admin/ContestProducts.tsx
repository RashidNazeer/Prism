import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, Loader2, Package } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { money, percent } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { useManageContest } from '@/lib/admin/useManageContest';
import type { ContestProduct } from '@/lib/admin/useContests';

/**
 * Which of the brand's products this contest is about.
 *
 * `products.set` takes the WHOLE list, so ticking one and unticking one are the
 * same call. That is why this holds a local copy while a call is in flight and
 * drops it the moment the server list agrees: a per row mutation would race
 * itself, and two ticks in quick succession would send two lists that each
 * believed they were complete.
 *
 * PRICE AND COMMISSION ARE LIVE FROM THE BRAND, decision D15. They are read
 * here every time this list is drawn and are never copied onto the contest, so
 * a price corrected on the brand is corrected everywhere at once. The contest
 * stores the product id and nothing else about it.
 */

interface Props {
  contestId: string;
  brandId: string;
  /** What the contest already carries, from the contest query. */
  selected: ContestProduct[];
  loading: boolean;
}

interface PickerProduct {
  id: string;
  name: string;
  external_product_id: string;
  image_url: string | null;
  /** Both optional: a product can be listed before its numbers are confirmed. */
  price: string | number | null;
  currency: string;
  commission_rate: string | number | null;
  is_active: boolean;
}

const PICKER_COLUMNS =
  'id, name, external_product_id, image_url, price, currency, commission_rate, is_active';

/**
 * The brand's live products, for this picker only.
 *
 * Its own query rather than the brand screen's, because that one reads every
 * product including the hidden ones and carries columns this list has no use
 * for. Never `select('*')`: `brand_products` is a wide table.
 */
function useBrandProductsForPicker(brandId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'contest-product-picker', brandId],
    enabled: Boolean(brandId),
    staleTime: 30_000,
    queryFn: async (): Promise<PickerProduct[]> => {
      const { data, error } = await getSupabase()
        .from('brand_products')
        .select(PICKER_COLUMNS)
        .eq('brand_id', brandId!)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PickerProduct[];
    },
  });
}

export function ContestProducts({ contestId, brandId, selected, loading }: Props) {
  const manage = useManageContest();
  const { data: products, isPending, isError, refetch } = useBrandProductsForPicker(brandId);

  const [override, setOverride] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  /** A stable description of what the server holds, so an identical refetch is quiet. */
  const serverKey = useMemo(
    () =>
      selected
        .map((p) => p.productId)
        .sort()
        .join(','),
    [selected]
  );

  // The server has caught up with the local copy, or moved on its own. Either
  // way the local copy has stopped being the truth, so it goes.
  useEffect(() => {
    setOverride(null);
  }, [serverKey]);

  const chosen = useMemo(
    () => new Set(override ?? selected.map((p) => p.productId)),
    [override, selected]
  );

  // Memoised so `strays` below is not rebuilt on every keystroke elsewhere on
  // this screen: `products ?? []` is a new array each render.
  const live = useMemo(() => products ?? [], [products]);

  /**
   * On the contest, but not among the brand's live products any more.
   *
   * Without this they would vanish from the list while still being attached,
   * and the next tick anywhere else would send a list that quietly dropped
   * them. Shown, labelled, and only removed on purpose.
   */
  const strays = useMemo(
    () => selected.filter((s) => !live.some((p) => p.id === s.productId)),
    [selected, live]
  );

  const busy = manage.isPending;

  async function toggle(productId: string, next: boolean) {
    setError('');
    setSaved(false);

    const ids = new Set(chosen);
    if (next) ids.add(productId);
    else ids.delete(productId);
    const list = [...ids];

    setOverride(list);
    try {
      await manage.mutateAsync({ action: 'products.set', contestId, productIds: list });
      setSaved(true);
    } catch (err) {
      // Back to whatever the contest actually holds, rather than leaving a tick
      // on screen for a product this contest is not about.
      setOverride(null);
      setError(err instanceof Error ? err.message : 'That product list did not save');
    }
  }

  return (
    <section className="border-line bg-surface-1 flex flex-col gap-4 rounded-xl border p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-muted text-[11px] font-semibold tracking-[0.14em] uppercase">
            Products
          </h2>
          <p className="text-faint mt-1.5 max-w-prose text-[12px]">
            Price and commission come from the brand and stay live. Nothing is copied onto the
            contest, so correcting a price on the brand corrects it here.
          </p>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={cn(
            'text-[13px] font-semibold',
            error ? 'text-danger' : saved ? 'text-success' : 'text-muted'
          )}
        >
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={15} className="animate-spin" aria-hidden />
              Saving
            </span>
          ) : error ? (
            error
          ) : saved ? (
            <span className="inline-flex items-center gap-1.5">
              <Check size={15} aria-hidden />
              Saved
            </span>
          ) : loading || isPending ? (
            /*
              Nothing, rather than "0 of 0 chosen". Both halves of that sentence
              are unknown until the two reads land, and a zero standing in for
              something we have not read yet is the one number this product does
              not print.
            */
            <span className="wx-skeleton block h-4 w-24 rounded-md" />
          ) : (
            <span className="font-mono text-[12px]">
              {chosen.size} of {live.length + strays.length} chosen
            </span>
          )}
        </p>
      </div>

      {loading || isPending ? (
        <div className="flex flex-col gap-3">
          <div className="wx-skeleton h-[76px] rounded-xl" />
          <div className="wx-skeleton h-[76px] rounded-xl" />
        </div>
      ) : isError ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <h3 className="font-display text-text text-[19px] leading-tight font-bold">
            The products did not load
          </h3>
          <p className="text-muted max-w-prose text-[14px] leading-relaxed">
            Nothing has changed on this contest. This is a read, so trying again is safe.
          </p>
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : live.length === 0 && strays.length === 0 ? (
        <div className="border-line flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <div className="bg-surface-3 border-line-strong grid size-11 place-items-center rounded-lg border">
            <Package size={19} className="text-muted" aria-hidden />
          </div>
          <h3 className="font-display text-text text-[19px] leading-tight font-bold">
            No more products to link with this contest
          </h3>
          <p className="text-muted max-w-prose text-[14px] leading-relaxed">
            This brand has none yet. Products belong to the brand rather than to the contest, so
            they are added once there and every one of them can be picked here afterwards. A
            contest does not need any.
          </p>
          <ButtonLink to={`/admin/brands/${brandId}?section=about`} variant="secondary">
            Add products to this brand
            <ExternalLink size={15} aria-hidden />
          </ButtonLink>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {live.map((product) => (
            <li key={product.id}>
              <ProductRow
                product={product}
                checked={chosen.has(product.id)}
                busy={busy}
                onToggle={(next) => void toggle(product.id, next)}
              />
            </li>
          ))}

          {strays.map((stray) => (
            <li key={stray.productId}>
              <StrayRow
                name={stray.productName}
                busy={busy}
                onRemove={() => void toggle(stray.productId, false)}
              />
            </li>
          ))}
        </ul>
      )}

      {/*
        Rashid's wording, and his case: everything this brand has is already on
        the contest, so there is nothing left to offer. Without this the list
        just sits there fully ticked and an admin has to count it themselves to
        work out whether anything is missing.
      */}
      {!loading && !isPending && !isError && live.length > 0 && live.every((p) => chosen.has(p.id)) ? (
        <p className="text-muted text-[13px]">
          No more products to link with this contest. Every product this brand has is already on
          it.
        </p>
      ) : null}
    </section>
  );
}

function ProductRow({
  product,
  checked,
  busy,
  onToggle,
}: {
  product: PickerProduct;
  checked: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const rate = percent(product.commission_rate);

  return (
    <label
      className={cn(
        'ease-brand flex min-h-11 cursor-pointer flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border p-4 transition-colors',
        checked
          ? 'border-accent bg-accent-soft'
          : 'border-line bg-surface-1 hover:border-line-strong',
        busy && 'cursor-not-allowed opacity-70'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(e) => onToggle(e.target.checked)}
        className="size-5 shrink-0 cursor-pointer accent-[var(--wx-accent)]"
      />

      <span className="border-line bg-surface-2 grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="size-full object-cover" />
        ) : (
          <Package size={17} aria-hidden className="text-faint" />
        )}
      </span>

      <span className="min-w-0 flex-1 basis-40 text-[14px] font-semibold break-words">
        {product.name}
      </span>

      <span className="flex items-center gap-5">
        <span>
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            Price
          </span>
          <span className="wx-numeric mt-0.5 block text-[15px] font-semibold">
            {money(product.price, product.currency)}
          </span>
        </span>
        <span>
          <span className="text-muted block text-[11px] font-semibold tracking-[0.14em] uppercase">
            Commission
          </span>
          <span className="wx-numeric text-accent mt-0.5 block text-[15px] font-bold">
            {rate || 'Not set'}
          </span>
        </span>
      </span>
    </label>
  );
}

/** On the contest, hidden on the brand. Visible so it can be taken off on purpose. */
function StrayRow({
  name,
  busy,
  onRemove,
}: {
  name: string;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="border-line bg-surface-1 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-dashed p-4">
      <span className="min-w-0 flex-1 basis-40 text-[14px] font-semibold break-words">
        {name}
      </span>
      <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
        Hidden on the brand
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11"
        disabled={busy}
        onClick={onRemove}
      >
        Take it off
      </Button>
    </div>
  );
}
