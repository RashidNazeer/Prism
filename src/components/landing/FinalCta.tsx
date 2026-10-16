import { ArrowRight } from 'lucide-react';
import { Section } from '@/components/layout/Section';
import { SettleIn, SettleWords } from '@/components/landing/Settle';
import { ButtonLink } from '@/components/ui/Button';
import { TiltCard } from '@/components/ui/TiltCard';

export function FinalCta() {
  return (
    <Section className="overflow-x-clip">
      <div>
        {/* The card rises and un-tips as the page arrives at it. Inside, the
            spectrum light sits on two planes that move in OPPOSITE directions,
            which is the strongest depth cue on the page: the card is a window
            and the glow is behind it. */}
        <SettleIn rise={7.5} tilt={22} from={0.8}>
          {/* `overflow-hidden` stays: the glow planes inside are wider than the
              card and would spill without it. It flattens `preserve-3d`, so the
              card tilts as a whole and nothing inside rises onto its own plane
              — which is right here, since the content is centred and the depth
              is coming from the glow moving behind it. */}
          <TiltCard className="wx-neo-raised relative overflow-hidden rounded-3xl px-7 py-16 text-center sm:px-14 sm:py-20">
            <div aria-hidden className="wx-glow pointer-events-none absolute inset-0" />
            {/* THREE EMPTY PARALLAX LAYERS REMOVED, 2026-10-16. The note above
                calls them "the strongest depth cue on the page: the card is a
                window and the glow is behind it" — and the glow was deleted on
                2026-10-15, leaving three transparent boxes of 352, 352 and
                224px still being transformed on every scroll frame. Read off
                the rendered page before deleting: no background, no image, no
                shadow, no children. The `wx-glow` layer above them is the
                light that is actually still there. */}
            <div className="relative">
              <h2 className="font-brand mx-auto max-w-2xl text-[clamp(1.875rem,4vw,3rem)]">
                <SettleWords text="Find out what your videos are actually making." />
              </h2>
              <p className="text-muted mx-auto mt-6 max-w-lg text-lg leading-relaxed text-pretty">
                Applications take about three minutes. No follower minimum, and a human reads
                every one.
              </p>
              {/*
                A LINK TO `/apply`, AND IT USED TO BE A DEAD BUTTON.

                This was `<Button onClick={() => focusApplyForm()}>`.
                `focusApplyForm` looks for `#apply-form` and returns false when
                it is not on the page — and the form was removed from the hero
                on 2026-10-15, so `/apply` is now the ONLY place it is mounted.
                The return value was discarded, which means the home page's
                single largest call to action did nothing at all when clicked.
                Verified in the browser before changing it.

                `SiteNav` and `SiteFooter` both already fall back to `/apply`
                when the form is absent; this one never did. A link rather than
                a repaired click handler: the destination is a page, so it
                should be middle-clickable, openable in a new tab and visible
                in the status bar like every other route on the site.

                `size="xl"`, matching the hero, because these two ARE the
                primary action of the page and a reviewer said they do not
                stand out.
              */}
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <ButtonLink to="/apply" size="xl" className="group max-sm:w-full">
                  Apply to join
                  <ArrowRight
                    size={17}
                    className="ease-brand transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </ButtonLink>
                <ButtonLink to="/login" variant="secondary" size="lg">
                  Sign in
                </ButtonLink>
              </div>
            </div>
          </TiltCard>
        </SettleIn>
      </div>
    </Section>
  );
}
