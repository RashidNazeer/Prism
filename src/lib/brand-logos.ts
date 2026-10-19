/**
 * LOGOS SHIPPED WITH THE APP for brands whose `logo_url` is not set yet.
 *
 * The brand record holds a URL and these three were never uploaded, so their
 * cards fell back to a letter. The files live in `public/brands`. A logo set on
 * the brand itself always wins; delete an entry here once its brand has one.
 */
const SHIPPED: Record<string, string> = {
  swisse: '/brands/swisse.png',
  'dr-tobias': '/brands/dr-tobias.png',
  aurelia: '/brands/aurelia.png',
};

export function brandLogo(slug: string | null | undefined, url: string | null | undefined) {
  return url || (slug ? (SHIPPED[slug] ?? null) : null);
}

/**
 * Logos supplied as a finished 4:5 card picture, with the mark in the middle.
 * The card shows these as they are and keeps its dark fade below the mark.
 */
const POSTER = new Set(['aurelia', 'dr-tobias']);

export const isPosterLogo = (slug: string | null | undefined, url: string | null | undefined) =>
  !url && Boolean(slug && POSTER.has(slug));
