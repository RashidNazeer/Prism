import { Link } from 'react-router';
import { Mail } from 'lucide-react';
import { COMPANY } from '@/content/site-pages';

/**
 * HOW TO REACH A PERSON, AND THE SAME WAY THE PUBLIC SITE DOES IT.
 *
 * `src/routes/site/Contact.tsx` offers an email address, a phone number and
 * the application form, and says in its own header why there is no form: "A
 * form that posts into a mailbox nobody has confirmed is worse than an address
 * a reviewer can see and test." That reasoning has not changed behind the
 * login, so this is the same mechanism and the SAME ADDRESS — `COMPANY.email`,
 * the one constant both pages read — rather than a second route into the
 * company that nobody is watching.
 *
 * ONE ACTION ON THE PAGE, AND IT IS THE EMAIL. Rashid, 2026-10-16: "ditch the
 * buttons where you can for easier usability." This had a second tile of equal
 * weight for the phone, which made a creator choose between two things before
 * doing either; the phone is now a plain link inside the sentence that says
 * when somebody is at the desk. Same route, a quarter of the furniture. There
 * is no category picker, no priority and no ticket type, because each of those
 * is a field a backend would have to store and there is no backend.
 *
 * THERE IS NO TICKET SYSTEM, AND THIS PAGE DOES NOT IMPLY ONE. Both reviewers
 * asked for ticket tracking. A ticket has an id, a status, an owner and a
 * history, every one of which is a table and an inbox integration. Writing "we
 * will get back to you within 24 hours" over a mailto link would be the
 * product making a promise nothing in it can keep, so what this says instead
 * is what is true: email reaches a small team who answer it themselves.
 *
 * ONE BLURRED PANEL for the section, and ONE `wx-neo-raised-sm` inside it —
 * the action. Everything else is text. Same layering rule as the FAQ above.
 */
export function SupportContact() {
  return (
    <section
      aria-labelledby="support-contact-heading"
      className="wx-neo-raised rounded-2xl p-[clamp(1rem,2vw,1.5rem)]"
    >
      <h2 id="support-contact-heading" className="text-[0.9375rem] font-bold">
        Talk to us
      </h2>
      <p className="text-muted mt-1 max-w-prose text-[0.8125rem] leading-[1.5]">
        We are a small team and we answer our own email, usually within one working day.
        Wurx Media works United States Mountain hours, so a message sent overnight is read
        the next morning. If it is urgent, the office number is{' '}
        <a
          href={COMPANY.phoneHref}
          className="text-accent underline-offset-4 hover:underline"
        >
          {COMPANY.phone}
        </a>
        .
      </p>

      {/* The one action. `min-h-11` is the 2.75rem tap floor, and the whole
          tile is the target rather than a button sitting inside it. */}
      <a
        href={`mailto:${COMPANY.email}`}
        className="wx-neo-raised-sm wx-neo-press ease-brand hover:text-accent mt-3.5 flex min-h-11 items-center gap-3 rounded-xl p-3.5 transition-colors duration-150"
      >
        <span
          aria-hidden
          className="bg-accent-soft text-accent grid size-9 shrink-0 place-items-center rounded-full"
        >
          <Mail size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.875rem] font-semibold">Email us</span>
          <span className="text-muted block truncate text-[0.8125rem]">{COMPANY.email}</span>
        </span>
      </a>

      <p className="text-muted mt-3.5 max-w-prose text-[0.8125rem] leading-[1.5]">
        Name the brand and the month in your message. Our records are kept per brand and
        per month, so naming both gets you a precise answer instead of a request for more
        detail — and if it is about one video, paste the link to it. Email reaches a
        person, not a ticket queue, so there is nothing to track here afterwards: the
        reply comes back to your inbox.
      </p>

      {/*
        The two public pages a creator is most likely to want from here.

        They are OUTSIDE the signed-in shell: opening one leaves the rail and
        the top bar behind, because they are the same pages a reviewer or
        somebody with no account reads, and there is exactly one copy of each.
        The alternative was a second in-app copy of our privacy policy, which
        is how two versions of a legal page start disagreeing.
      */}
      <p className="text-muted mt-2 max-w-prose text-[0.8125rem] leading-[1.5]">
        Our{' '}
        <Link to="/privacy" className="text-accent underline-offset-4 hover:underline">
          Privacy page
        </Link>{' '}
        says what we hold about you and how to have it deleted, and{' '}
        <Link to="/tiktok" className="text-accent underline-offset-4 hover:underline">
          Connecting TikTok
        </Link>{' '}
        explains the connection and how to undo it.
      </p>
    </section>
  );
}
