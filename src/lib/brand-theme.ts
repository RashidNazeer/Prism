/**
 * One brand colour in, a whole readable world out, in both themes.
 *
 * WHY THIS EXISTS AT ALL. Every other colour in this product lives in
 * `src/styles/tokens.css`, and `pnpm check:contrast` fails the build if dark
 * and light drift apart or if any pair drops below WCAG AA. A Brand Hub's
 * colour does NOT live there: it comes out of the database, chosen by an admin
 * in a colour picker. The build guard cannot see it. Nothing would fail.
 *
 * So the guarantee has to move into the code that USES the colour. An admin
 * picks one hex and nothing else; every surface, every line and above all every
 * TEXT colour is computed here, and the text is computed by measuring contrast
 * rather than by taste. A pale yellow brand and a near-black one both come out
 * readable, because the foreground is chosen last, against whatever the
 * background turned out to be.
 *
 * WHY OKLCH AND NOT HSL. HSL's lightness is a lie: `hsl(60 100% 50%)` (yellow)
 * and `hsl(240 100% 50%)` (blue) claim the same lightness and are wildly
 * different to the eye. Building a ramp in HSL gives a set of steps that look
 * even for a blue brand and collapse for a yellow one. OKLab is perceptually
 * uniform, so one ramp works for every hue, which is the whole point when the
 * hue is somebody else's decision.
 *
 * Rashid, on what a hub should feel like: a creator opens a brand and lands in
 * "a new world" that is the brand's, not Wurx's. This is the machinery under
 * that. He picks the colour; the readability is not his problem.
 */

/* ------------------------------------------------------------- colour maths -- */

type RGB = { r: number; g: number; b: number };
type OKLCH = { l: number; c: number; h: number };

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function hexToRgb(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, '');
  const full = s.length === 3 ? s.replace(/./g, (c) => c + c) : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

const toHex2 = (n: number) =>
  Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, '0');

export const rgbToHex = ({ r, g, b }: RGB) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

/* sRGB transfer function, both directions. */
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch({ r, g, b }: RGB): OKLCH {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function oklchToRgb({ l, c, h }: OKLCH): RGB {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);

  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return {
    r: clamp01(toGamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_)),
    g: clamp01(toGamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_)),
    b: clamp01(toGamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_)),
  };
}

/*
 * CLAMPING TO SOMETHING THE SCREEN CAN ACTUALLY SHOW.
 *
 * Most (l, c, h) triples are outside sRGB, and `oklchToRgb` clamps each channel
 * on its own, which shifts the hue: a vivid green asked for at high lightness
 * comes back yellowed. Binary-searching the chroma instead keeps the hue and
 * the lightness and gives up only saturation, which is the one of the three
 * nobody notices losing.
 */
function inGamut({ l, c, h }: OKLCH): boolean {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = toGamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = toGamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const b = toGamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  const ok = (v: number) => v >= -0.0001 && v <= 1.0001;
  return ok(r) && ok(g) && ok(b);
}

function oklchToHex(want: OKLCH): string {
  if (inGamut(want)) return rgbToHex(oklchToRgb(want));
  let lo = 0;
  let hi = want.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...want, c: mid })) lo = mid;
    else hi = mid;
  }
  return rgbToHex(oklchToRgb({ ...want, c: lo }));
}

/* ------------------------------------------------------------------ contrast -- */

/** WCAG relative luminance. */
function luminance({ r, g, b }: RGB): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(aHex: string, bHex: string): number {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  if (!a || !b) return 0;
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A readable foreground FOR a background, in the brand's own hue.
 *
 * Walks the brand hue away from the background's lightness until it clears the
 * ratio, so labels still feel like the brand rather than defaulting to grey.
 * If the hue genuinely cannot make it, it falls back to near-black or
 * near-white, because READABLE BEATS ON-BRAND, every time. Nobody has ever
 * praised a tint they could not read.
 */
function readableOn(bgs: string | string[], hue: number, chroma: number, ratio: number): string {
  /*
   * AGAINST EVERY BACKGROUND IT WILL EVER SIT ON, not just the first one.
   *
   * The first version of this took a single background, and the guard caught it
   * immediately on all 88 test colours. Body text was derived against the page
   * and then printed on a card, which is lighter; hero text was derived against
   * the dark end of the gradient and shown over the light end. Each looked fine
   * where it was measured and failed a few pixels away. A foreground has to
   * clear the WORST background it is used on, so they all come in together.
   */
  const list = typeof bgs === 'string' ? [bgs] : bgs;
  const worstOf = (fg: string) => Math.min(...list.map((bg) => contrast(fg, bg)));

  // Which way to walk: away from the lightest background it must survive.
  const lightest = Math.max(...list.map((bg) => rgbToOklch(hexToRgb(bg)!).l));
  const goDark = lightest > 0.5;

  for (let step = 0; step <= 24; step++) {
    const l = goDark ? 0.52 - step * 0.022 : 0.48 + step * 0.022;
    if (l < 0 || l > 1) break;
    const candidate = oklchToHex({ l, c: chroma, h: hue });
    if (worstOf(candidate) >= ratio) return candidate;
  }
  /* READABLE BEATS ON-BRAND. Drop the hue rather than the legibility. */
  for (const plain of goDark ? ['#0a0a0a', '#000000'] : ['#ffffff', '#fbfbfb']) {
    if (worstOf(plain) >= ratio) return plain;
  }
  return goDark ? '#000000' : '#ffffff';
}

/* -------------------------------------------------------------- the palette -- */

/** Every custom property a brand world sets. Names match `--wx-brand-*`. */
export type BrandPalette = {
  /** The page behind everything. */
  page: string;
  /** Cards and panels sitting on the page. */
  surface: string;
  /** A raised panel, for a card on a card. */
  surface2: string;
  /** Hairlines and card borders. */
  line: string;
  /** Body text on `page` and `surface`. */
  text: string;
  /** Secondary text: labels, captions, units. */
  muted: string;
  /** The navigation rail. */
  rail: string;
  /** Text on the rail. */
  railText: string;
  /** Secondary text on the rail. */
  railMuted: string;
  /** The selected item in the rail. */
  railActive: string;
  /** The two ends of the hero gradient. */
  heroFrom: string;
  heroTo: string;
  /** Text on the hero. */
  heroText: string;
  /** Secondary text on the hero. */
  heroMuted: string;
  /** Buttons and emphasis. */
  accent: string;
  /** Text ON a filled accent button. */
  accentText: string;
  /** The accent used as TEXT on `surface`, darkened or lightened until legible. */
  accentInk: string;
};

export type BrandTheme = { light: BrandPalette; dark: BrandPalette };

/** The Wurx gold, used when a brand has chosen no colour of its own. */
export const DEFAULT_BRAND_COLOR = '#c8924b';

/*
 * A FLOOR AND A CEILING ON CHROMA, and both are there for a reason.
 *
 * Below the floor a "colour" is grey, and every derived surface is grey too, so
 * the hub reads as broken rather than as tasteful. Above the ceiling large
 * fills vibrate: a full-chroma hero behind white text is genuinely unpleasant
 * to sit in front of, whatever the contrast number says.
 */
const CHROMA_FLOOR = 0.02;
const CHROMA_CEIL = 0.16;

/**
 * Derive a brand's whole look from one colour.
 *
 * Deterministic and pure, so the admin preview and the creator's screen cannot
 * disagree: both call this.
 */
export function deriveBrandTheme(brandHex: string): BrandTheme {
  const rgb = hexToRgb(brandHex) ?? hexToRgb(DEFAULT_BRAND_COLOR)!;
  const base = rgbToOklch(rgb);
  const h = base.h;
  const c = Math.min(Math.max(base.c, CHROMA_FLOOR), CHROMA_CEIL);

  /* Tints keep the hue and shed most of the chroma, or a page reads as a wash. */
  const tint = (l: number, mul: number) => oklchToHex({ l, c: c * mul, h });

  const light: Omit<BrandPalette, 'text' | 'muted' | 'railText' | 'railMuted' | 'heroText' | 'heroMuted' | 'accentText' | 'accentInk'> = {
    page: tint(0.973, 0.1),
    surface: tint(0.995, 0.03),
    surface2: tint(0.955, 0.12),
    line: tint(0.88, 0.18),
    rail: tint(0.28, 0.75),
    railActive: tint(0.4, 0.95),
    heroFrom: tint(0.34, 1),
    /*
     * The far end of the gradient is a CEILING, not a free choice. The same
     * heading crosses both ends, so the lighter end sets how light either can
     * be. 0.46 is the point where white still clears 4.5:1 at every hue.
     */
    heroTo: tint(0.46, 0.85),
    /* Likewise: a filled button is mid-lightness, the hardest place to put
     * text. 0.45 keeps white above 4.5:1 whatever hue an admin picks. */
    accent: tint(0.45, 1),
  };

  const dark: typeof light = {
    /*
     * Dark is not "light, inverted". The page carries only a whisper of hue,
     * because a strongly tinted dark background makes white text buzz, and the
     * surfaces step UP in lightness rather than down, which is how depth reads
     * on a dark screen.
     */
    page: tint(0.17, 0.25),
    surface: tint(0.215, 0.3),
    surface2: tint(0.26, 0.35),
    line: tint(0.34, 0.4),
    rail: tint(0.135, 0.35),
    railActive: tint(0.36, 0.8),
    heroFrom: tint(0.3, 0.95),
    heroTo: tint(0.42, 0.8),
    accent: tint(0.72, 0.9),
  };

  /*
   * Each foreground is given EVERY surface it appears on, and a little more
   * headroom than the contract demands, so a later tweak to a surface does not
   * land exactly on the line. The contract is the floor, not the target.
   */
  const finish = (p: typeof light): BrandPalette => ({
    ...p,
    text: readableOn([p.page, p.surface, p.surface2], h, c * 0.35, 4.8),
    muted: readableOn([p.page, p.surface, p.surface2], h, c * 0.3, 3.3),
    railText: readableOn([p.rail, p.railActive], h, c * 0.2, 4.8),
    railMuted: readableOn([p.rail, p.railActive], h, c * 0.2, 3.3),
    heroText: readableOn([p.heroFrom, p.heroTo], h, c * 0.15, 4.8),
    heroMuted: readableOn([p.heroFrom, p.heroTo], h, c * 0.15, 3.3),
    accentText: readableOn([p.accent], h, c * 0.1, 4.8),
    accentInk: readableOn([p.surface, p.page, p.surface2], h, c, 4.8),
  });

  return { light: finish(light), dark: finish(dark) };
}

/**
 * The pairs that must stay legible, whatever an admin picks.
 *
 * Exported so the same list can be asserted in a test and shown in the admin
 * preview: one definition, so a pair can never be guarded in one and forgotten
 * in the other.
 */
export const CONTRACT: ReadonlyArray<{
  label: string;
  fg: keyof BrandPalette;
  bg: keyof BrandPalette;
  min: number;
}> = [
  { label: 'body text on the page', fg: 'text', bg: 'page', min: 4.5 },
  { label: 'body text on a card', fg: 'text', bg: 'surface', min: 4.5 },
  { label: 'body text on a raised card', fg: 'text', bg: 'surface2', min: 4.5 },
  { label: 'secondary text on the page', fg: 'muted', bg: 'page', min: 3 },
  { label: 'secondary text on a card', fg: 'muted', bg: 'surface', min: 3 },
  { label: 'rail text', fg: 'railText', bg: 'rail', min: 4.5 },
  { label: 'rail secondary text', fg: 'railMuted', bg: 'rail', min: 3 },
  { label: 'rail text on the selected item', fg: 'railText', bg: 'railActive', min: 4.5 },
  { label: 'hero heading', fg: 'heroText', bg: 'heroFrom', min: 4.5 },
  { label: 'hero heading at the far end', fg: 'heroText', bg: 'heroTo', min: 4.5 },
  { label: 'hero paragraph', fg: 'heroMuted', bg: 'heroFrom', min: 3 },
  { label: 'button label', fg: 'accentText', bg: 'accent', min: 4.5 },
  { label: 'accent as text on a card', fg: 'accentInk', bg: 'surface', min: 4.5 },
];

/** Every pair that fails, with what it measured. Empty means the theme is safe. */
export function auditBrandTheme(brandHex: string) {
  const theme = deriveBrandTheme(brandHex);
  const bad: { mode: 'light' | 'dark'; label: string; got: number; min: number }[] = [];
  for (const mode of ['light', 'dark'] as const) {
    for (const pair of CONTRACT) {
      const got = contrast(theme[mode][pair.fg], theme[mode][pair.bg]);
      if (got < pair.min) bad.push({ mode, label: pair.label, got, min: pair.min });
    }
  }
  return bad;
}

/**
 * The custom properties for one mode, ready to spread onto a style attribute.
 *
 * IT ALSO REBINDS THE ORDINARY `--wx-*` TOKENS, and that is what makes a brand
 * world actually feel like one. The first version themed only the shell, so a
 * deep green rail framed a page of Wurx-gold cards and grey text: the chrome
 * had changed and the content had not. Every card, button, heading and hairline
 * in this product already reads from `--wx-bg`, `--wx-surface-1`, `--wx-text`
 * and friends, so pointing those at the brand's palette for the subtree themes
 * the entire world without touching a single component.
 *
 * WHAT IS DELIBERATELY LEFT ALONE: success, danger, warning and the stage
 * colours. Those are semantic. A rejection has to look like a rejection in
 * every brand, and a brand whose colour happens to be red must not turn every
 * approved badge into a warning.
 */
export function paletteToVars(p: BrandPalette): Record<string, string> {
  return {
    /* ---- the ordinary tokens, repointed for this subtree only ---------- */
    '--wx-bg': p.page,
    '--wx-surface-1': p.surface,
    '--wx-surface-2': p.surface2,
    '--wx-surface-3': p.surface2,
    '--wx-text': p.text,
    '--wx-text-muted': p.muted,
    '--wx-text-faint': `color-mix(in srgb, ${p.muted} 72%, ${p.page})`,
    '--wx-text-inverse': p.page,
    '--wx-border': p.line,
    '--wx-border-strong': `color-mix(in srgb, ${p.line} 55%, ${p.text})`,
    '--wx-border-interactive': `color-mix(in srgb, ${p.line} 40%, ${p.accent})`,
    '--wx-accent': p.accent,
    '--wx-accent-hover': `color-mix(in srgb, ${p.accent} 86%, ${p.text})`,
    '--wx-accent-active': `color-mix(in srgb, ${p.accent} 74%, ${p.text})`,
    '--wx-accent-soft': `color-mix(in srgb, ${p.accent} 14%, ${p.surface})`,
    '--wx-accent-ring': `color-mix(in srgb, ${p.accent} 45%, transparent)`,
    '--wx-accent-gradient': `linear-gradient(135deg, ${p.accent}, ${p.heroTo})`,
    '--wx-accent-gradient-hover': `linear-gradient(135deg, ${p.heroTo}, ${p.accent})`,
    '--wx-on-accent': p.accentText,
    '--wx-grid-line': `color-mix(in srgb, ${p.line} 60%, transparent)`,

    /* ---- and the world's own, for the rail and the hero ---------------- */
    '--wx-brand-page': p.page,
    '--wx-brand-surface': p.surface,
    '--wx-brand-surface-2': p.surface2,
    '--wx-brand-line': p.line,
    '--wx-brand-text': p.text,
    '--wx-brand-muted': p.muted,
    '--wx-brand-rail': p.rail,
    '--wx-brand-rail-text': p.railText,
    '--wx-brand-rail-muted': p.railMuted,
    '--wx-brand-rail-active': p.railActive,
    '--wx-brand-hero-from': p.heroFrom,
    '--wx-brand-hero-to': p.heroTo,
    '--wx-brand-hero-text': p.heroText,
    '--wx-brand-hero-muted': p.heroMuted,
    '--wx-brand-accent': p.accent,
    '--wx-brand-accent-text': p.accentText,
    '--wx-brand-accent-ink': p.accentInk,
  };
}
