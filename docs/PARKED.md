# Parked work

Things we consciously decided to do **later**. Nothing here is forgotten, and
nothing here is done.

**When Rashid asks "what's pending?", answer from this file.**

Rules:

- Every item says what it is, why it was parked, who is blocking it, and the
  moment it should be raised again.
- Status is one of: `PAUSED` (we chose to delay), `BLOCKED` (waiting on someone),
  `BEFORE LAUNCH` (must happen before real creators use prod).
- When an item is finished, delete it from here and record it in DECISIONS.md.
- Claude raises the relevant item automatically when its trigger arrives. Rashid
  does not have to remember.

---

## 0. Contests: what is left, as of 2026-08-14 (evening)

**Status:** PAUSED where noted
**Owner:** Claude

**Settlement is DONE and is no longer on this list.** Rashid decided both halves
on 2026-08-14: a reward is owed the moment staff confirm the figure that crosses
its target, and the product tracks owed then paid. `contest_awards.note` became
`message` in the same migration, and the eight realtime hooks moved onto
`joinChannel`. `pnpm verify:contests` went from 36 checks to 106 and now drives
the creator screens. What is left is below.

- **Real tracking. PAUSED, Rashid's call.** Progress is typed by the creator and
  confirmed by staff. He will say when the sheet or the data source exists. Do
  not start this without him.
- **A creator can enter a GMV figure with nothing behind it.** Staff confirm it,
  which is the agreed control, and that confirmation now owes real money in the
  same transaction, so the control matters more than it did. There is still no
  evidence attached to a GMV claim the way video links are attached to a count.
  **Trigger: the first time a reward is paid on a GMV figure nobody checked
  against the seller centre.**
- **There is no way to unpay a reward**, on purpose: the guard is a confirmation
  step on the screen and an audit row naming who clicked. **Trigger: the first
  mis-click.** The fix is a `pay_contest_awards` counterpart that writes a
  reversal row rather than clearing `paid_at`, so the history stays true.
- **`contest_entry_events.note` is creator readable and its name does not say
  so**, the same shape as the trap `contest_awards.note` was. It is lower risk,
  because that table is documented at the table level as the creator's own
  history and nothing private has ever been written to it. Rename it the next
  time that file is opened for another reason.
- **Closing a contest does not chase what it still owes.** `settle_contest`
  reports the unpaid total and the screen warns before the click, but nothing
  afterwards reminds anybody. **Trigger: a closed contest still owing money a
  fortnight later.**
- **THE CREATOR HOME DOES NOT KNOW ABOUT CONTEST MONEY, and this gap is new.**
  `/app` leads with "Paid to you so far", which counts offer money only. That
  was complete until 2026-08-14, because no contest money existed. It does now:
  a creator can be owed $850 from contests, see it on `/app/contests`, and find
  their own home screen still saying they have been paid nothing.

  **Not built without Rashid**, and that is the only reason it is parked rather
  than done. Rule M10 already decides the ARITHMETIC, and it is not negotiable:
  contest money sits BESIDE offer money in its own labelled block and is never
  added into it. What is undecided is WHERE on that screen, and `/app` is the
  one he approved pixel for pixel from a design and has twice told me carries
  what matters. **Raise it the next time he opens the creator home.**

## 1. Resend email setup (DNS fix + API key)

**Status:** PAUSED, 2026-07-29, at Rashid's request to keep development moving
**Owner:** Rashid
**Trigger to raise again:** before any feature depends on an email actually
arriving. That means: password reset going live, email confirmation being turned
on, approval notifications, or email-code login.

wurxmedia.com is verified in Resend, but the setup is half-broken:

- The Resend DKIM record is published on the root domain (`@`) where nothing
  will read it. It belongs at host `resend._domainkey`.
- The SPF record for the bounce subdomain (`send`) is missing entirely.
  Should be `v=spf1 include:amazonses.com ~all`.
- Optional but worth doing: wurxmedia.com has **no SPF record at all**, which
  weakens the existing Google Workspace mail. Suggested `@` value:
  `v=spf1 include:_spf.google.com ~all`.

Consequence while parked: emails from wurxmedia.com (including the existing
rajil@ sender) go out weakly authenticated and are more likely to land in spam.
Fine for now. **Fatal for login codes**, because a creator who never receives the
code cannot get in at all.

Also still needed: a **new Resend API key** with Sending access only, into
`C:\Users\RA_shid\.wurx\cli-secrets.env` as `RESEND_API_KEY=`.

Agreed sender once live: `Wurx Media <creators@wurxmedia.com>`. No new domain
setup needed for that address, domain verification covers every address.

Full step-by-step instructions were given in chat on 2026-07-29.

---

## 2. Email confirmation, password reset, and approval notifications

**Status:** PAUSED, depends on item 1. **Severity raised twice.**
**Owner:** Claude, once item 1 is done

- **2026-07-29 (a):** applying now creates a real account, so this stopped being
  theoretical. Until it is fixed, anyone can apply with an address they do not
  own.
- **2026-07-29 (b), after Step 4:** approvals now happen. The applicant's
  dashboard updates live, which is good, but only if they happen to be looking
  at it. Nobody is told they got in. This is the single most important email in
  the product and it does not exist yet. Raised with Rashid in the Step 4
  report.

While email is parked:

- Email confirmation is OFF on the dev Supabase project, so test accounts can be
  created instantly. It must be ON before prod takes real signups, or anyone can
  register with an address they do not own. A wrong address also means the
  approval notification never reaches them.
- Password reset is built and works, but delivery uses Supabase's built-in
  sender, which is rate limited to a handful per hour and is explicitly not for
  production. Good enough to test the flow, not good enough for creators.

---

## 3. Email-code (OTP) sign-in

**Status:** PAUSED, 2026-07-29. Rashid chose password-only for now to move faster.
**Owner:** Claude, once item 1 is done
**Trigger to raise again:** after the application flow is live, or the first time
a creator cannot log in.

Agreed design, deferred not rejected: password stays primary, with "email me a
code instead" as a second option on the login screen. It removes the whole
forgot-password support burden, and creators forget passwords constantly.

---

## 4. Prod promotion rehearsal

**Status:** RAISED 2026-07-29, waiting on Rashid's go-ahead
**Owner:** Claude to run, Rashid to approve
**Trigger:** Step 4. **This has now arrived.** Raised with Rashid in the Step 4
report; there are three tables, a database function, an Edge Function and a real
admin flow to promote, and prod has none of it.

Do a full dry-run promotion to prod while it is still empty: merge dev to main,
replay migrations against the prod database, set the prod-only settings that
migrations do not cover (auth redirect URLs, email templates, Edge Function
secrets), then smoke test.

The point is to discover the breakages while they cost nothing, and to turn
promotion into a written checklist so the real launch is boring.

---

## 4b. Prod admin account, and rotating the dev one

**Status:** BEFORE LAUNCH
**Owner:** Claude to run, Rashid to choose the password

`rashid@wurxmedia.com` exists on **dev only**. Prod needs its own, created the
same way with `scripts/create-admin.mjs`. Public sign up can never produce a
staff account, so this is the only route in.

Also: the current dev password was typed into a chat message. Rotate it before
that account controls anything real. One command:
`node scripts/create-admin.mjs rashid@wurxmedia.com <new password> admin`.

## 5. Supabase paid plan for prod

**Status:** BEFORE LAUNCH
**Owner:** Rashid
**Trigger to raise again:** before real creators are given the prod URL.

Prod is on the free tier, which pauses after roughly a week of inactivity and
has no daily backups. Fine while empty. Not acceptable once it holds real
creator identities and earnings data.

---

## 6. Content-Security-Policy

**Status:** BEFORE LAUNCH, deferred 2026-07-28
**Owner:** Claude

The other hardening headers (HSTS, nosniff, frame-deny, referrer, permissions
policy) already ship in `vercel.json`. CSP was deferred because the anti-flash
theme script is inline and Motion injects inline styles, so a correct policy
needs script hashes and careful testing.

---

## 7. Landing page search visibility

**Status:** PAUSED, flagged 2026-07-28
**Owner:** Claude, needs a decision from Rashid

Two separate things:

- The site currently carries `<meta name="robots" content="noindex">`. That must
  be **removed** when Rashid wants the page publicly findable.
- Vite has no server rendering, so the landing page is weak for Google and for
  link previews in Discord, WhatsApp and iMessage. The fix is a build-time
  prerender step, not a move to Next.js. Only worth doing if search traffic
  matters.

---

## 8. Brand and asset gaps

**Status:** BLOCKED on Rashid
**Owner:** Rashid

- **Favicon.** `public/favicon.svg` is still the older geometric gold "W" and no
  longer matches the real logo now used in the header. Needs a square crop of the
  Wurx mark.
- **Partner list.** Eight brands were taken from the marquee on wurxmedia.com.
  Rashid should confirm they are all still current partners and that none are
  missing.

---

## 9. Landing page bundle, second pass

**Status:** PAUSED, low priority
**Owner:** Claude

Initial download is roughly 159 KB gzipped, already down 44% from 284 KB. The
remaining large items are React and the router (~87 KB, effectively the floor for
this stack) and TanStack Query (~10 KB) which the public landing page does not
actually use. Query could be moved so it only loads behind login. Small win, only
worth doing if page speed becomes a real complaint.
