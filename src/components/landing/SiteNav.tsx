import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { Menu, X } from 'lucide-react';
import { PrismMark } from '@/components/brand/PrismMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/layout/Section';
import { focusApplyForm } from '@/lib/focus-apply';
import { cn } from '@/lib/utils';

/**
 * THE MENU IS PAGES NOW, NOT SECTIONS OF ONE PAGE.
 *
 * It was `#how`, `#platform`, `#brands` â€” anchors into the marketing page,
 * which is precisely what TikTok rejected the app for on 2026-09-15: "Your
 * website URL cannot be a landing page or login page. You must have an
 * externally facing fully developed website." Anchors also did nothing at all
 * from any other page, which is how /terms had a header whose links went
 * nowhere.
 */
const LINKS = [
  { href: '/creators', label: 'For creators' },
  { href: '/brands', label: 'For brands' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  /**
   * Apply, from wherever you are.
   *
   * `focusApplyForm` scrolls to the form in the home page's hero and returns
   * false when that form is not on the page. It now IS on six other pages'
   * headers â€” so on About or the FAQ, "Apply" silently did nothing. Where there
   * is no form, go to the one at /apply.
   */
  const apply = () => {
    if (!focusApplyForm()) void navigate('/apply');
  };

  // The bar is transparent over the hero and gains a background once you
  // scroll, so the header never fights the headline for attention.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape closes the mobile menu, and it never survives a resize to desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onResize = () => {
      /* 1024, matching the `lg:hidden` on the button that opens it. At 768 this
         closed the menu at a width where the links are still only inside it. */
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  /*
   * A CARD ON THE BACKGROUND, not a bar welded to the top of the page.
   * Rashid, 2026-10-09: "make it like a card rounded at the edges on top of the
   * page and should look like placed on the background".
   *
   * So the header itself paints NOTHING — it only supplies the gutter that lets
   * the card float. The full-bleed `bg-bg/85` and the `border-b` are gone: both
   * were what made it read as a bar fixed to the edge of the window.
   */
  return (
    <header className="fixed inset-x-0 top-0 z-50 pt-3 sm:pt-4">
      <Container>
        <nav
          className={cn(
            /*
             * SYMMETRY COMES FROM THE GRID, NOT FROM EYEBALLING IT.
             *
             * This was `flex justify-between`, which spaces three groups of
             * DIFFERENT widths — so the links sat wherever the mark and the
             * action cluster left them, never actually centred. The right-hand
             * group is much the wider of the two ("Already a partner? Sign in",
             * a toggle and a button), so the links were pushed noticeably left.
             *
             * Two equal `1fr` columns with the links in an `auto` column
             * between them puts the links dead centre and keeps them there at
             * every width, whatever the two outer groups happen to contain.
             */
            /* `minmax(0,1fr)`, not plain `1fr`. A bare `1fr` is `minmax(auto,
               1fr)`, so its minimum is its CONTENT — and the right-hand group is
               wider than the mark, so it grew its own column and pushed the
               links 116px left of centre at 1024px. Measured. A zero minimum
               makes the two outer columns mathematically equal at every width,
               which is the only way the middle column is actually centred. */
            /* `rounded-[2rem]` is the kit's largest container radius, "xl 32 ·
               raised", which is what this card is. At 4rem tall that is half
               the height, so the ends read as full curves; when the card
               tightens to 3.5rem on scroll the browser clamps it to 1.75rem and
               it stays a pill rather than jumping shape. */
            /*
             * TWO COLUMNS UNTIL THE LINKS EXIST, THREE AFTER.
             *
             * This was the three-column template at every width, and on a phone
             * it broke: the links `<ul>` is `hidden lg:flex`, so it vacates its
             * grid cell entirely, and auto-placement then slid the action
             * cluster INTO the middle column. Measured at 375px: the card ran
             * 20..355 while its contents stopped at 237, leaving 118px of dead
             * space on the right and the whole row bunched left.
             *
             * Below `lg` there is nothing to centre, so two columns is the
             * honest description: mark left, actions right. The symmetric
             * three-column template starts exactly where the links do.
             */
            /* THE LIVE BACKGROUND SHOWS THROUGH. Rashid asked for it: the card
               was fully opaque `--wx-surface-1`, so the moving backdrop stopped
               dead at its edge. `bg-surface-1/80` lets the beams and the colour
               travel behind the bar while leaving enough body for the labels to
               stay readable. Deliberately NO `backdrop-blur`: a backdrop filter
               re-blurs everything behind it every frame, and what is behind
               this one never stops moving. */
            'wx-neo-raised bg-surface-1/80 ease-brand grid grid-cols-[1fr_auto] items-center gap-4 rounded-[2rem] px-5 transition-[height,border-radius] duration-300 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
            /* The one thing scroll still changes. The card tightens slightly
               once you are into the page, which reads as it settling rather
               than as a second style of header. */
            scrolled && !open ? 'h-14' : 'h-16'
          )}
        >
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center justify-self-start"
            aria-label="Prism home"
          >
            <PrismMark />
          </Link>

          {/* `lg`, not `md`: six page links and the sign-in cluster do not fit
              a tablet. Below that they are in the menu button beside them. */}
          <ul className="hidden items-center gap-1 justify-self-center lg:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                {/* `pointer-coarse:min-h-11` rather than a width breakpoint.
                    These links only appear from `lg`, which looks like desktop
                    — but 1024x768 is also an iPad in landscape, and measured
                    there they are 33px, well under the tap floor. Width does
                    not tell you whether a finger is doing the pointing; the
                    pointer type does. A mouse keeps the tighter 33px. */}
                {/* The material, on hover and on press. These were plain text
                    with only a colour change, which made them the one set of
                    controls in the product that did not behave like the
                    material. `wx-neo-press` gives the push; the raised pill
                    only appears on hover, because six permanently raised pills
                    in a row would read as a toolbar rather than as navigation. */}
                <Link
                  to={l.href}
                  className="text-muted hover:text-accent hover:wx-neo-raised-sm wx-neo-press ease-brand inline-flex items-center rounded-full px-3.5 py-2 text-sm transition-colors duration-200 pointer-coarse:min-h-11"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2.5 justify-self-end">
            {/* Existing partners had no way in from a desktop: "Sign in" only
                existed inside the mobile menu. This is the return path for
                everyone who has already applied. */}
            <Link
              to="/login"
              className="text-muted ease-brand hover:text-accent hidden min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap transition-colors duration-200 sm:inline-flex"
            >
              {/* `xl`, not `lg`. At exactly 1024 the six links, the mark, this
                  sentence, the toggle and the Apply button genuinely do not fit,
                  and something has to give — making the columns equal only
                  moves the problem. This phrase is the least load-bearing thing
                  in the row: "Sign in" beside it still says what it does. */}
              <span className="hidden xl:inline">Already a partner?</span>
              <span className="text-text hover:text-accent font-medium underline-offset-4 hover:underline">
                Sign in
              </span>
            </Link>

            <ThemeToggle />
            {/* `max-lg:h-11` is the 44px tap floor. `size="sm"` is 36px tall,
                which is fine beside a cursor but under the floor on the phones
                and tablets most of this audience is on — and this is the
                header's primary action. It keeps the tighter 36px from `lg`,
                where the links appear and a mouse is doing the pointing. */}
            {/* The 44px tap floor. `size="sm"` is 36px, fine beside a cursor
                and under the floor for a finger — and this is the header's
                primary action. `max-lg` covers phones and tablets by width;
                `pointer-coarse` catches a touch device wide enough to show the
                links, such as an iPad in landscape, which width alone misses. */}
            <Button
              size="sm"
              className="hidden max-lg:h-11 sm:inline-flex pointer-coarse:h-11"
              onClick={apply}
            >
              Apply
            </Button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="wx-neo-raised-sm wx-neo-press text-muted hover:text-accent ease-brand grid size-11 place-items-center rounded-full transition-colors duration-200 lg:hidden"
            >
              {open ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
            </button>
          </div>
        </nav>
      </Container>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            /* ITS OWN CARD, BENEATH THE NAV CARD. It used to be a panel bolted
               under a full-width bar with a `border-t` joining them. With the
               nav floating, that panel would have hung in mid-air attached to
               nothing, so it becomes a second card with the same radius and a
               gutter between. */
            className="overflow-hidden lg:hidden"
          >
            <Container>
              <ul className="wx-neo-raised mt-2 flex flex-col gap-1 rounded-[2rem] p-3">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      to={l.href}
                      onClick={() => setOpen(false)}
                      className="text-muted hover:bg-surface-2 hover:text-accent ease-brand block rounded-lg px-3 py-3 text-[0.9375rem] transition-colors duration-200"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li className="pt-2">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      // Let the menu finish collapsing before scrolling.
                      window.setTimeout(apply, 300);
                    }}
                  >
                    Apply to join
                  </Button>
                </li>
                <li className="pt-1 text-center">
                  <ButtonLink to="/login" variant="ghost" className="w-full">
                    Already a partner? Sign in
                  </ButtonLink>
                </li>
              </ul>
            </Container>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
