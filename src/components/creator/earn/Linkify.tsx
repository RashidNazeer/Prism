import type { ReactNode } from 'react';

/**
 * Turning the URLs inside somebody's typed text into links, SAFELY.
 *
 * Creators put portfolio links in the note they send with a request, and staff
 * put links in a decision note and in an offer's description. Until now those
 * arrived as plain text: a creator had to select a URL on a phone keyboard and
 * paste it into another tab to see their own portfolio back.
 *
 * THIS NEVER RENDERS USER-SUPPLIED HTML, and that is the whole design.
 *
 * It returns React NODES, not a string, and it is never handed to
 * `dangerouslySetInnerHTML`. There is no HTML string anywhere in this file for
 * anybody to later pass to one. Every non-URL run of the text comes back as a
 * React text child, which React escapes on its own, so `<img onerror=...>` in
 * a decision note is printed, not run. That is the difference between linkify
 * done once and an XSS hole with a nice API.
 *
 * ONLY `http://` AND `https://`. The scheme is matched literally at the front
 * of the pattern rather than sniffed afterwards, so `javascript:alert(1)`,
 * `data:text/html,...` and `vbscript:` never match in the first place — they
 * are left as text. Nothing here promotes a bare `example.com` to a link
 * either: guessing a scheme for somebody else's typing is how `//evil.com`
 * becomes a protocol-relative redirect.
 *
 * `rel="noopener noreferrer nofollow"` and `target="_blank"` on every anchor:
 *   noopener   the opened page cannot reach back through `window.opener`
 *   noreferrer no Referer header, so a brand hub URL is not leaked outward
 *   nofollow   a creator's note is not an endorsement we vouch for
 */

/*
 * The match. Deliberately conservative about where a URL ENDS.
 *
 * Stops at whitespace and at the characters that cannot legally appear
 * unencoded in a URL anyway — `<>"'` and a backtick. Those are excluded so a
 * URL cannot swallow the start of the next sentence, and so the matched text
 * can never contain a quote or an angle bracket even in the href.
 */
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

/**
 * Punctuation that is almost always the sentence, not the address.
 *
 * "see https://wurx.co/x." ends with a full stop belonging to the sentence, and
 * a link that includes it 404s. Hyphens, slashes and query strings are left
 * alone; only a RUN of these at the very end is given back to the text.
 */
const TRAILING = /[.,;:!?'"]+$/;

/** How much of a long URL is worth printing before it stops being readable. */
const MAX_LABEL = 44;

/**
 * What the link says. The address, minus the noise.
 *
 * The scheme and a `www.` go, because neither tells a creator anything, and a
 * long path is cut in the MIDDLE rather than at the end — the tail of a
 * portfolio URL is usually the only part that identifies it.
 */
function label(url: string): string {
  const bare = url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
  if (bare.length <= MAX_LABEL) return bare;
  const head = bare.slice(0, MAX_LABEL - 14);
  const tail = bare.slice(-10);
  return `${head}...${tail}`;
}

/**
 * Is this something a browser will treat as an http(s) address?
 *
 * The regex already fixed the scheme, so this is the second pair of eyes: it
 * asks the URL parser rather than another regex, and anything it refuses is
 * printed as text instead of linked.
 */
function safeHref(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * The text, with its http(s) URLs as links and everything else as text.
 *
 * NOT exported. This file exports the component and nothing else, so React
 * Fast Refresh can still swap it during development — a module exporting both
 * a component and a helper loses that, and `oxlint`'s
 * `react(only-export-components)` says so. Anything wanting the nodes rather
 * than the wrapper can render `<Linkify>` inside its own element, which is
 * what every caller does today.
 */
function linkifyNodes(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // `matchAll` rather than a `while (exec)` loop: no shared `lastIndex` on a
  // module-level regex, so two callers rendering at once cannot interleave.
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index;
    let found = match[0];

    // Hand a trailing full stop or comma back to the sentence.
    const trimmed = found.replace(TRAILING, '');
    // ...and a closing bracket too, unless the URL opened one itself.
    const closed =
      /[)\]]$/.test(trimmed) && !/[([]/.test(trimmed.slice(0, -1))
        ? trimmed.slice(0, -1)
        : trimmed;
    const tail = found.slice(closed.length);
    found = closed;

    if (start > cursor) out.push(text.slice(cursor, start));

    const href = found ? safeHref(found) : null;
    if (href) {
      out.push(
        <a
          key={`l${key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          /*
            THE 2.75rem TAP TARGET, BOUGHT WITH PADDING ON AN INLINE BOX.
            Vertical padding on an `inline` element extends what a thumb can
            hit WITHOUT entering the line box, so the sentence around it keeps
            its leading. `min-h` here, or `inline-flex`, would have forced
            every line of a paragraph containing a link to 2.75rem and torn the
            prose apart — which is why this is padding and not a height.

            Below `sm` and on any coarse pointer only. On a mouse it stays a
            plain inline link.

            `break-all` because a long URL has no spaces in it, and one in a
            20rem card will otherwise push the whole grid sideways.
          */
          className="text-accent hover:text-text ease-brand break-all underline decoration-dotted underline-offset-2 transition-colors max-sm:py-[0.9375rem] pointer-coarse:py-[0.9375rem]"
        >
          {label(found)}
        </a>
      );
    } else if (found) {
      // Matched the shape but not a URL the parser accepts. Printed, not linked.
      out.push(found);
    }

    if (tail) out.push(tail);
    cursor = start + match[0].length;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/**
 * Somebody's typed text, as a paragraph, with its links live.
 *
 * `whitespace-pre-line` so the line breaks they typed survive. A note written
 * as three bullets should not arrive as one run-on sentence.
 */
export function Linkify({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text || !text.trim()) return null;
  return <span className={className}>{linkifyNodes(text)}</span>;
}
