import { useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataError } from '@/components/ui/DataState';
import { ProductDialog } from '@/components/admin/ProductDialog';
import { cn } from '@/lib/utils';
import { useManageBrand } from '@/lib/admin/useManageBrand';
import { money, percent, useProducts, type BrandProduct } from '@/lib/admin/useBrands';

/**
 * Step two of a hub: what the brand sells, and the commission a creator earns
 * on each product.
 *
 * It was the bottom half of the About tab. It is its own tab now so the editor
 * reads in the order a creator meets the hub, and so a brand manager adding a
 * product is not scrolling past a colour picker to find the button.
 *
 * The TikTok Shop product id is still captured in the dialog, because sales
 * data is keyed on it, but it is never printed here: an id is plumbing, and a
 * brand manager has no use for one.
 */
export function BrandProducts({ brandId, brandName }: { brandId: string; brandName: string }) {
  const { data: products, isLoading, isError, refetch } = useProducts(brandId);
  const [dialog, setDialog] = useState<{ product?: BrandProduct } | null>(null);

  const rows = products ?? [];

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-[0.875rem] leading-relaxed">
          {rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? 'product' : 'products'}, each with the commission a creator earns.`
            : 'Products and the commission on each.'}
        </p>
        <Button onClick={() => setDialog({})} className="min-h-[44px] shrink-0 sm:min-h-0">
          <Plus size={15} aria-hidden />
          Add product
        </Button>
      </div>

      {isLoading ? (
        <ul className="mt-4 grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="wx-skeleton h-20 rounded-xl" />
          ))}
        </ul>
      ) : isError ? (
        <DataError
          className="mt-4"
          title="The products would not load"
          body="Nothing has been changed. Try again in a moment."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="wx-neo-raised mt-4 rounded-xl px-6 py-12 text-center">
          <Package size={24} aria-hidden className="text-faint mx-auto" />
          <p className="mt-4 font-semibold">No products yet</p>
          <p className="text-muted mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed">
            Creators see these when they open {brandName}'s hub, with the commission they earn
            on each.
          </p>
          <Button className="mt-6" onClick={() => setDialog({})}>
            <Plus size={16} aria-hidden />
            Add the first product
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((product) => (
            <li key={product.id}>
              <ProductRow product={product} onEdit={() => setDialog({ product })} />
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <ProductDialog
          brandId={brandId}
          brandName={brandName}
          {...(dialog.product ? { product: dialog.product } : {})}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </section>
  );
}

function ProductRow({ product, onEdit }: { product: BrandProduct; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const manage = useManageBrand();

  const rate = percent(product.commission_rate);

  return (
    <div
      className={cn(
        'rounded-xl p-4',
        // A hidden product is quieter, not outlined: the pill says why.
        'wx-neo-raised-sm'
      )}
    >
      {/* Wraps on a phone and sits in one row from small up. Nothing here is
          allowed to push the page sideways. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="wx-neo-inset grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl">
          {product.image_url ? (
            <img src={product.image_url} alt="" className="size-full object-cover" />
          ) : (
            <Package size={18} aria-hidden className="text-faint" />
          )}
        </span>

        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-words">{product.name}</p>
            {product.badge_title ? (
              <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 text-[0.625rem] tracking-[0.12em] uppercase">
                {product.badge_title}
              </span>
            ) : null}
            {!product.is_active ? (
              <span className="wx-neo-raised-sm text-muted rounded-full px-2 py-0.5 text-[0.625rem] tracking-[0.12em] uppercase">
                Hidden from creators
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-5">
          <span>
            <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Price
            </span>
            <span className="wx-numeric mt-0.5 block text-[0.9375rem] font-semibold">
              {money(product.price, product.currency)}
            </span>
          </span>
          <span>
            <span className="text-muted block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Commission
            </span>
            <span className="wx-numeric text-accent mt-0.5 block text-[0.9375rem] font-bold">
              {rate || 'Not set'}
            </span>
          </span>
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${product.name}`}
            className="text-muted hover:bg-surface-2 hover:text-accent grid size-11 place-items-center rounded-lg transition-colors duration-200"
          >
            <Pencil size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${product.name}`}
            className="text-muted hover:bg-surface-2 hover:text-danger grid size-11 place-items-center rounded-lg transition-colors duration-200"
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
      </div>

      {confirming ? (
        <div className="bg-danger-soft mt-4 rounded-xl p-4">
          <p className="text-danger text-[0.8125rem] leading-relaxed font-medium">
            Delete {product.name}? It goes for good, though the audit log keeps a record of what
            it was.
          </p>
          {manage.error ? (
            <p role="alert" className="text-danger mt-2 text-[0.75rem]">
              {(manage.error as Error).message}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={manage.isPending}
              onClick={() => manage.mutate({ action: 'product.delete', productId: product.id })}
            >
              {manage.isPending ? 'Deleting...' : 'Yes, delete'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={manage.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
