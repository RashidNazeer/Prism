/**
 * DEV-ONLY PREVIEW STUB for: Offers.
 *
 * The route is already registered in `src/app/router.tsx` inside the
 * `import.meta.env.DEV` block, so whoever owns this page REPLACES THIS FILE and
 * never has to edit the router. Keep the named export `OffersPreview`: `lazyRoute`
 * resolves routes by name.
 *
 * Why these exist at all: the signed-in creator pages cannot be opened by the
 * agents working on them, so each one renders its real components against
 * fixtures here. The Brand hub's preview (`BrandHubPreview.tsx`) is the model
 * to follow — it caught defects that reading the code did not.
 */
export function OffersPreview() {
  return (
    <div className="p-6">
      <p className="text-muted text-sm">
        Preview stub for Offers. Replace this file with the real components against fixtures.
      </p>
    </div>
  );
}
