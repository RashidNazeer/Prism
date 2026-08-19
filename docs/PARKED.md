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
`joinChannel`. `pnpm verify:contests` went from 36 checks to 121 and now drives
the creator screens, and contest money reached the creator home. What is left is
below.

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
- **A creator can enter a contest and see nothing about it on their home until
  they earn something.** The contest block on `/app` is about MONEY, so it draws
  nothing until a reward exists. Somebody entered and mid-way to a target has no
  trace of it on the first screen they open. That is deliberate rather than
  forgotten: the alternative is a permanent block on every creator's home
  teaching them to skip that part of the page, and `/app/contests` is where a
  contest with no money in it belongs. **Trigger: Rashid asking why his home
  does not mention a contest he is in.**

## 0b. The creator side has not had the chrome rebuild

**Status:** PAUSED, and the next piece of work
**Owner:** Claude
**Trigger to raise again:** Rashid saying "now the creator side", which he said
on 2026-08-16 was the plan: "We can do it for admin side only and after that we
can move to creators side."

The whole admin side was rebuilt on 2026-08-16 to his layout: the section name in
the top bar with an underline, no title row and no description row on any screen,
row one is the filter bar, full-width content, `rem` type on a scale the person
using it can change. `docs/FEATURE_MAP.md` "Admin screen layout" is the spec and
`pnpm verify:chrome` guards it.

**The creator screens have not had any of it.** They still draw their own `<h1>`
and their own description, which means two `<h1>`s on those routes now, the shell's
and the screen's. It is legal HTML and nothing is broken, but it is the leftover
half of one change rather than a decision. `/app`, `/app/brands`, `/app/offers`,
`/app/contests`, `/app/content`, `/app/profile`, and the studio home.

**The contest screens are also still half redressed**, from 2026-08-15, and the
list shrank by two: the claims and rewards queues took the new header and the new
filter row on 2026-08-16. **Still on the old language:** the CREATOR contest
screen (`/app/contests`) and the contest SETUP screen. Both are quick now that
the tokens, the glass utilities and `FilterBar` all exist.

---

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

---

## 12. TikTok ads: what is left, as of 2026-08-18

**Status:** PAUSED
**Owner:** Claude

The connection, the nightly sync and the creator screens are done and Rashid is
testing them. These are the pieces we consciously left.

**a. The `Checking` state for a brand-new video.** A video added last night has
no complete day yet, so the card says "No ads", which is a lie for its first
day. Four states rather than three: `Checking` (added, nothing pulled yet),
`Not on ads yet`, `Ads on`, `Ads finished`. **Raise this before any real creator
uploads**, because the first thing they will do is add a video and look, and the
first thing they will see is a sentence that is wrong.

**b. Prod has none of it.** No `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`,
`TIKTOK_REDIRECT_URI` or `TIKTOK_SYNC_SECRET`, no vault entries, no cron job.
The prod redirect URI is already registered with TikTok. **Raise when Rashid
says "make it live".**

**c. The seeded offers do not match the video counts.** The offers are 10-for-$40
and 15-for-$40, but Brooke posted 15 against the 10 and Panda 20 against the 15.
Rashid's own data was seeded as given rather than trimmed to fit. **Raise if the
overdelivery reads oddly on the offer screens.**

**d. Nothing shows an admin whether the nightly job ran.** `tiktok_sync_runs`
records every attempt and staff can read it, but no screen displays it. If the
job silently stopped, the first sign would be creators asking why their numbers
froze. **Raise once prod is live**, or sooner if a night is ever missed.

**e. `verify:performance` calls the real TikTok API.** It is the only suite that
does, it costs a handful of calls, and it will fail if the connection is ever
revoked. That is deliberate: a mocked version would have proved nothing about
the numbers being right. **Raise if the call cost ever matters.**

---

## 13. WurxBase, vendored in, as of 2026-08-18

**Status:** BEFORE LAUNCH on (a), PAUSED on the rest
**Owner:** Rashid decides, Claude builds

**a. Their database is open, and their key is now in our bundle.** Anyone with
it can read and write their tables, which hold brand budgets and creator payment
details. Their own site has the same hole today, so this changes the blast
radius rather than creating it. Their JavaScript also carries five plaintext
logins, superadmin included, copied verbatim because the code was to be left
alone. **Raise before prod, and worth changing those passwords regardless.**

**b. It has its own login.** An admin signs into WurxMediaHub and then signs into
WurxBase again with `Admin` / `admin.top@wurx`. That is their logic, untouched by
instruction. **Raise when Rashid tires of the second login.**

**c. The avatar circles keep their teal, orange, blue and purple.** Those
gradients live in their JavaScript, not their CSS, so the reskin could not reach
them without editing code. They read as per-brand identity rather than chrome,
which is arguably correct. The presence cluster in the header is the exception
and was neutralised on 2026-08-19, because a neon pink circle six pixels from
the brand mark is chrome whatever the code calls it. **Raise if he wants the
rest in the Wurx palette.**

**e. Their tables lose most of their fields at 768px and below.** Every wide
table in WurxBase collapses into stacked cards on a narrow screen, and the card
shows two or three of the eight or nine values it holds; the rest are in the DOM
and not laid out. This is their own responsive CSS and it was measured on
2026-08-19 to be **unaffected by anything we changed**: the card's height is
identical with our shell rules and with theirs put back. Rewriting a
table-to-card transformation across six tabs is a real piece of work, not a
correction, so it was not folded into a styling pass. **Raise when Rashid opens
Paid Collabs on a phone or a tablet, or before anyone is asked to work in it
away from a desk.**

**f. Their app cannot write its own settings, and says so on every load.** Each
page load logs a 401, a 406 and `42501 new row violates row-level security
policy for table "app_settings"` from `scheduleSettingsSave`. That is their
table in their project, refusing their own client, which means it fails on their
live site too. Nothing of ours reads it and nothing visible breaks; it is noise
in the console that will confuse the next person who looks. **Raise with
whoever owns WurxBase, or when console noise starts hiding our own errors.**

**d. Nothing re-runs the vendoring pipeline.** If WurxBase changes upstream,
somebody must copy the CSS fresh, rebuild their prefixed Tailwind, scope, and
reskin. It is four commands and no script yet. **Raise when their code changes.**

## 14. Twelve orphaned test admins on dev, as of 2026-08-19

**Status:** PAUSED
**Owner:** Rashid decides, Claude removes

Dev holds **13 admin accounts and only one of them is real**. The other twelve
are throwaway accounts left behind by suite runs that were interrupted before
their cleanup ran: `rv-*`, `rp-*`, `br-*`, `brands-runner-*`, `probe-*`,
`iso-*` and `contests-admin-*`, all on `@wurxmediahub.test`.

They were left alone during the 2026-08-19 clean slate because Rashid's
instruction was creators, offers and contests, and staff accounts were
explicitly not in scope. They are harmless to the data but they pad every admin
list and the Team screen, which is noise in exactly the "how does this look with
real data" test the wipe was for.

Removing them is one filtered delete on `@wurxmediahub.test` accounts whose
role is admin. **Raise the next time he opens an admin screen that lists
people.**
