import { SUPPORT_FAQ } from '@/components/creator/support/support-faq';

/**
 * THE ANSWERS, ALL OPEN.
 *
 * Not an accordion, for the same reason the public FAQ is not one: a creator
 * who has come here because a number looks wrong should be able to scan nine
 * headings and read the one that matches, not click nine times to find out
 * which it was. An answer inside a collapsed panel is an answer she may never
 * see, and `Ctrl+F` cannot find it either.
 *
 * ONE BLURRED PANEL FOR THE WHOLE SECTION. The `<dl>` sits inside a single
 * `wx-neo-raised`; each question is `wx-neo-raised-sm`, which is the same glass
 * with the `backdrop-filter` left off, so nine entries cost one layer rather
 * than nine. Nothing here adds a blur of its own.
 *
 * `<dl>` rather than a stack of divs, because that is what this is: a list of
 * terms and their definitions, and a screen reader says so.
 */
export function SupportFaq() {
  return (
    <section
      aria-labelledby="support-faq-heading"
      className="wx-neo-raised rounded-2xl p-[clamp(1rem,2vw,1.5rem)]"
    >
      <h2 id="support-faq-heading" className="text-[0.9375rem] font-bold">
        Questions we are asked most
      </h2>
      <p className="text-muted mt-1 max-w-prose text-[0.8125rem] leading-[1.45]">
        Written from what the app actually does today. If your question is not here, the
        email below reaches a person.
      </p>

      <dl className="mt-4 grid gap-2.5">
        {SUPPORT_FAQ.map((item) => (
          <div key={item.q} className="wx-neo-raised-sm rounded-xl p-3.5">
            <dt className="text-[0.875rem] leading-[1.35] font-semibold">{item.q}</dt>
            <dd className="text-muted mt-1.5 max-w-prose text-[0.8125rem] leading-[1.5]">
              {item.a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
