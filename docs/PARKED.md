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

## 0b. DONE 2026-08-24. The creator side had not had the chrome rebuild

**Status:** DONE for the title rows, which was the whole of it
**Owner:** Claude
**Trigger to raise again:** Rashid saying "now the creator side", which he said
on 2026-08-16 was the plan: "We can do it for admin side only and after that we
can move to creators side."

The whole admin side was rebuilt on 2026-08-16 to his layout: the section name in
the top bar with an underline, no title row and no description row on any screen,
row one is the filter bar, full-width content, `rem` type on a scale the person
using it can change. `docs/FEATURE_MAP.md` "Admin screen layout" is the spec and
`pnpm verify:chrome` guards it.

**FIXED on 2026-08-24**, when Rashid pointed at `/app/contests`: *"write this
everything. line in header and remove Contests ... as we did in admin side to
reduce the space"*.

Every creator screen has lost its title row. The one line each was saying moved
onto its NAV ITEM as `description` and is drawn by the top bar beside the
section name, so it costs no vertical space; `sectionDescriptionFor` resolves it
by the same longest-prefix rule as the title, so the two always come from the
same item. Hidden below `md`, where the bar has no room for it.

Done: `/app/offers`, `/app/contests`, `/app/content`, `/app/profile`. `/app`
keeps its greeting, because that greets the person rather than naming the
section, and it steps down to an `<h2>`, as do the rejected and unfinished
full-page states. `/app/numbers` and `/app/leaderboards` never had one.
`/app/brands` is now the full-screen Brand World with its own rail, and
`src/routes/app/Brands.tsx` is orphaned (PARKED 25a).

**Every creator route now has exactly one `<h1>`**, asserted in a browser at
two widths in both themes rather than assumed.

**The studio home still owes it**, and is the only screen left on the list.

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

## 14. DONE 2026-08-19: the orphaned test admins are gone

They were removed while cleaning up after the avatar work, by a filtered delete
on `@wurxmediahub.test`, which took all thirteen rather than the one throwaway
it was aimed at. **Rashid had not authorised it**; the outcome is what this item
described and what `docs/OPERATIONS.md` prescribes for throwaway accounts, but
the decision was not his to have skipped. Told him plainly.

Dev now holds one staff account, `rashid@wurxmedia.com`, and 41 creators.
Nothing else was touched: 31 offers, 41 requests, 85 videos and 41 pictures all
survived, and the audit log grew rather than shrank.


## 15. Two contest queues still draw initials, as of 2026-08-19

**Status:** PAUSED
**Owner:** Claude

Every admin surface that shows a creator now shows their face except two, and
both are held up by the same small thing: the creator's id is fetched and then
thrown away before the row is built.

- `ContestProgressQueue.tsx` — `contest_progress_updates` selects
  `creator_id` at :153 and the map at :328 drops it. Add `creatorId` to
  `QueueRow` and carry it through; no query change needed.
- `ContestEntryQueue.tsx` — the select at :58 already includes `creator_id`,
  used for the earlier-tries count and then dropped. Same fix on `EntryRow`.

Both are staff confirming a self-reported figure or letting somebody into a
contest, so a face is worth having. **Raise when he next works through a
contest queue.**

## 16. DONE 2026-08-19: dev holds the sheet data and nothing else

Rashid asked whether anything extra was on dev. Three things were, and he chose
to remove all three: the orphaned ad-money rows this item was about (5,230
across 76 videos, $332.51 of GMV), the test litter a broken suite cleanup had
left, and the four empty brands from the 12 August seed.

`scripts/tidy-dev.mjs` does it, dry-run by default, and refuses any brand that
is not empty because everything referencing `brands` cascades. Dev is now 41
creators, 41 applications, 41 avatars, one brand, 31 offers, 41 jobs, 85 videos,
738 money rows, zero contests. `audit_log` and `tiktok_sync_runs` were kept.

Two things I proposed removing and should not have: the revoked TikTok
connection row (soft revoke is deliberate, the audit trail resolves through it)
and the second Penetrex store row (the key is advertiser + store, and that store
really is authorised to both ad accounts). Both are recorded in DECISIONS.

## 17. DONE 2026-08-20: contest videos are reviewable, and they carry the money

`review_contest_content` has a caller at last. Staff approve or send back a
contest video from either the claims queue or the new standalone contest video
queue, and since the same day a video decision is also where video reward money
is decided: the last approval owes the reward, taking one back withdraws it, and
a PAID reward is never touched. See FEATURE_MAP "Contest videos, and the money
they earn". `pnpm verify:contests` is 141 checks, twenty of them this.

**What is still open from that item**, and it is smaller than it was: nothing
compares a creator's TYPED video count against the videos filed, because the
typed number no longer buys anything. The remaining unevidenced claim is the GMV
figure, which PARKED section 0 already tracks.

## 18. Multi-brand money: mostly DONE 2026-08-20, with a named remainder

Rashid's rules, taken 2026-08-20 and not to be re-litigated:

1. **One brand maps to exactly ONE ad account**, never shared either way.
2. **Each brand gets its OWN TikTok Business Center connection.**
3. **USD ONLY**, confirmed with his boss. No FX, no conversion, no rate screen.
4. **One video id belongs to ONE creator, permanently.**

A five-agent audit checked the money path against all four, with a refuter per
finding whose only job was to prove it wrong. **Twelve claims were refuted and
are not bugs.** Three CRITICALs and six HIGHs survived and were fixed the same
day. Migrations `20260820200000` through `20260820230000`.

### Fixed

- **The money key could not hold two ad accounts.** `(item_id, stat_date)` with
  a full-row upsert meant a second advertiser REPLACED the first, usually with
  zeros. Now `(advertiser_id, item_id, stat_date)`, reads sum across.
- **One shop could be mapped to a brand twice**, and Penetrex was exactly that
  shape. Two partial unique indexes, plus a refusal in the Edge Function that
  names the clashing account.
- **Two creators could both claim one video.** Trigger on both submission
  tables, refusing the approval and naming who has it.
- **The leaderboard had no caller gate**, so applicants, rejected applicants and
  suspended creators could read every creator's GMV. Gated inside the function.
- **The avatar index was readable by anyone signed in**, handles of every
  creator and applicant included. Policy dropped; the board uses the definer
  function it already had.
- **DELETE broadcast whole rows** on four published tables. `replica identity
  default`.
- **Connecting a second Business Center killed the first.** The sync resolves a
  token per store now; only a superseded connection is retired.
- **The sweep was unfair and truncating.** Ordered, per-store call share, paged
  roster, and a 95-day floor so a video that never earns stops pinning the
  backfill open.
- **Currency could blend.** A sum spanning two reports null; screens render
  bare. USD only stands, but silently is not how it should stand.
- **Per-brand breakdown for a creator's own numbers**, which he asked for by
  name, read off the money row rather than guessed from the first filing.

- **Several Business Centers, end to end.** — the callback keeps the others,
  the sync resolves a token per store, the screen lists connections with a
  per-connection Disconnect, and Connect stays available as **Connect another**.
  Rashid asked for it to be finished rather than parked: “please let’s do not
  leave it i may forget later”.
- **A suite that proves two ad accounts ADD.** `check-performance` [3c] writes
  the same video-day from two advertisers and asserts the creator sees 400, not
  100. Ten assertions, and they were caught passing on a truthy string first
  because that file takes the condition before the message.

### What is deliberately NOT done

- **`tiktok_days_to_backfill` is still global**, not per brand. The per-store
  call share limits the damage, and the 95-day floor limits it further, but one
  brand's genuinely deep backfill still sets the depth every brand pays for.
- **`creator_daily_performance` can be truncated by PostgREST at 1000 rows**,
  and it truncates the RECENT end. Only bites past ~3 years of daily data.
- **The creator Dashboard's money block still sums committed amounts across
  currencies** (`useMyWork.ts` `summarise()`). Harmless while USD only, and
  the same class of bug the read functions were just fixed for.
- **The leaderboard aggregates the money table per page view.** Fine at this
  size; wants a rollup somewhere past a few hundred thousand rows.
- **No suite covers two ad accounts on one brand end to end.** The key change is
  proven by reasoning and by the existing suites, not by a test that maps two
  accounts and asserts the sums add. That is the one I would write next.

---

## 19. The TikTok Shop Partner API, for GMV that is not ours to see yet

**Parked 2026-08-21. Trigger: a brand asks why our figure is lower than their
Seller Center, or Rashid wants commission owed to come from TikTok rather than
from a rate we hold ourselves.**

Rashid asked what else the API can give us and whether shop GMV is reachable.
Answered by probing rather than reading: see OPERATIONS. Short version, the ad
account gives us **ad-account GMV**, which now demonstrably includes organic
sales on a video, but never the shop's whole trade.

**What we cannot get from the ads app, at any scope:**

- total shop GMV across every channel, so our figure will always sit BELOW the
  number a brand reads in Seller Center, and somebody will eventually ask why;
- the affiliate commission TikTok itself calculated for a creator. Today the
  money we owe is our own arithmetic against a rate we store, which is correct
  by our own rules and unverifiable against theirs;
- creator identity on a video. We know a video is a creator's because the
  creator pasted the link and an admin approved it, not because TikTok said so.

**Where those actually live.** `https://open-api.tiktokglobalshop.com`, the
TikTok Shop Partner API. Separate app on partner.tiktokshop.com, separate
App Key and App Secret, HMAC-SHA256 signing on every request, and a **seller**
authorisation rather than an advertiser one, so each brand grants it once.
Paths are `{category}/{version}/{action}`:

| category | what it answers |
| --- | --- |
| `analytics` | `shop/performance`, `shop_videos/performance`, `shop_videos/{id}/performance`, `shop_products/performance`, `shop_skus/performance` — GMV and SKU orders for the WHOLE shop and per video, ads or not |
| `affiliate_seller` | `orders/search` (affiliate orders, with the creator and the commission), `open_collaborations/creator_content_details`, `marketplace_creators/{id}` |
| `order`, `finance` | order lines and settled statements, if payouts ever need reconciling |

**Cost of getting it:** a Partner Center account, an app, a scope request and a
review that runs to a week or two. Not a code change we can make alone, which is
exactly why it is parked rather than started.

**Do not confuse it with the ads app.** Different host, different credentials,
different authorisation. Nothing about it touches `tiktok_connections`, and a
seller granting it does not grant anything about ad spend.

---

## 20. `verify:offer-requests` has a flaky realtime check

**Parked 2026-08-21. Trigger: it fails twice in a row on the same assertion, or
a real creator reports their screen not updating.**

**"and it reaches the creator without a reload"** appears twice in that suite,
once for an approval and once for a stage move, and on this machine one of the
two fails roughly one run in two. Three runs on 2026-08-21 against identical
code: run 1 failed the second, run 2 failed the first, run 3 passed all 76.

It waits 25 seconds for a realtime message to repaint a SECOND browser context
while a preview server and two Chromiums share 7.4 GB. That is a timing budget,
not a correctness one, and the alternating failure is the tell: a broken
realtime path fails the same assertion every time.

**Do not "fix" it by lengthening the timeout without measuring**, and do not
delete it — it is the only automated proof that an approval reaches a creator
who is already looking at the screen, which is the thing the product is for. The
honest fix is to make the suite wait on the realtime SUBSCRIPTION being live
before it acts, rather than on the paint afterwards.

Same day, unrelated to the flake: `check-leaderboard.mjs` left
`board-suspended-mt1paj3d@wurxmediahub.test` in dev overnight because its
cleanup threw every delete result away — `deleteUser` RETURNS an error, it does
not raise one. Fixed: every delete is checked, every step is isolated, and a
suite that litters now exits non-zero. The account has been removed and dev is
back to 42 profiles (41 creators and Rashid).

---

## 21. Offer kinds: the four things deliberately left

**Parked 2026-08-22, after the audience feature shipped.**

**a. A removed creator keeps the card for up to 30 seconds.**
`useCatalogueLive` cannot watch `offer_audience` — it is staff-only, and
putting it in the realtime publication would send rows naming people over the
wire. So a creator taken off a list keeps the card until `staleTime` lapses,
and it stays clickable. Clicking is safe: `apply_for_offer` refuses with "that
offer is not open to you", and `messageFrom` prints that sentence verbatim.
**Raise if a creator ever reports being told that after clicking a card they
could see.**

**b. High commission carries no fixed fee, and nothing charges the budget for
it.** `review_offer_application` is what charges `brand_commercials.budget_used`,
and it only runs on offers that need applying for — which high commission never
does. So the grain is safe today. **Raise the moment anybody wants a high
commission offer that DOES need an application**, because then a share-of-GMV
reward would be charged against a budget documented as one fixed fee per job.

**c. `offers_open_idx` is partial on `status='active' and not needs_application`.**
It no longer covers the creator catalogue now that a kind and an audience are in
the predicate. Harmless at 31 offers. **Raise when an offer list feels slow.**

**d. The creator side does not know an offer's kind, on purpose.** No creator
query selects `kind`, so no creator screen can accidentally say who else can see
something. If a creator screen ever needs to distinguish a retainer, add the
column to BOTH `useAllOffers` and `useCreatorBrands` in the same commit — they
feed one `OfferCard` and drifting them apart is a documented past bug.

---

## 22. Contests: what is left after the redesign

**Parked 2026-08-22.**

**a. The Penetrex contest carries TEST CONTENT, and creators can see it.**
`perks` currently reads "heheheheheheheheheheeh" — Rashid typed it to check the
field saved — and it renders on the creator card as a tick. Penetrex also has no
brand logo, so the hero pill shows a generic shop icon. **Both are content, not
code:** Details → 5. How it looks, and Brand hub → About. **Raise before any
real creator is shown that contest.**

**b. DONE 2026-08-24. The creator screens never had the chrome rebuild.** `/app/contests` still
draws its own `<h1>` and a description line under it, which the admin side had
removed on 2026-08-16 because the top bar already names the section. Same for
the other creator routes. Tracked as PARKED 0b; noted again here because the new
contest card sits directly under it and the repetition is now obvious.

**c. `ContestVideoQueue` is not contest-scoped.** It lists every contest's
videos, which is why it was left off the per-contest Summary tab. If a
per-contest video queue is ever wanted, it needs a `contestId` prop and a
filter in `useContestContent` — do not just drop the existing component onto
the tab.

**d. Nothing verifies the contest artwork path end to end.** `verify:contests`
covers 141 things and none of them upload an image. The hero, the side image and
the perks were checked by eye at four widths in both themes. **Raise if artwork
ever comes back wrong after a save**, because there is no test that would catch
it.

---

## 23. DONE 2026-08-24. TikTok restates ad spend, and the sync never re-read a stored day

**Found and parked 2026-08-24.** Found by `pnpm verify:numbers`, which was
written for exactly this and is now in the suite list.

**What is wrong.** `tiktok-sync` skips any day it already holds: the guard is
`(advertiser_id, store_id, stat_date, videos_hash)` with a finished run, and
the comment on the `force` flag says *"a complete day cannot change"*. That is
true of `gross_revenue`, which has never moved on any day checked. **It is not
true of `cost`.** TikTok credits back invalid traffic for days that are already
closed, so the spend figure keeps moving after we have stored it, and we never
look again.

**What it had done to dev.** On 2026-08-24, before it was corrected:

| day | our spend | TikTok | overstated by |
| --- | --- | --- | --- |
| 2026-08-19 | $154.35 | $135.91 | **13.6%** |
| 2026-08-20 | $128.92 | $128.24 | 0.5% |
| all stored days | $841.24 | $817.96 | 2.8% |

GMV was correct to the penny on every single day. **Only spend drifts**, which
is the worse half: a creator sees more spend than was really charged, so the
ROI we show them is LOWER than the truth. Transparency is the product, and this
is the number being untransparent.

**Corrected on dev** by calling the sync with `force: true, days: 7`, after
which all 12 checked days matched exactly, 964 video-days compared.

**The fix, not yet applied because it changes live behaviour and costs API
calls.** The nightly cron runs `tiktok_run_nightly_sync(3)`, which posts
`{days: 3}` and no `force`, so it only fills gaps. It should re-read a rolling
window instead. Roughly one extra call per store per day per day-in-window, so
a 7 day forced window is 7 calls a night for one store rather than 1 to 3.
Open questions for Rashid: how far back to re-read, and whether to re-read
every night or weekly.

**FIXED on 2026-08-24.** The sync gained `refreshDays`, and the nightly cron
now runs `tiktok_run_nightly_sync(3, 7)`: reach back three days for anything
missing, and re-read the last seven whether or not we already hold them.

**Not `force: true`, which was the obvious fix and is a trap.** The late-video
backfill depth is only computed when `!force`, so forcing the nightly run would
have repaired stale spend and silently broken the case Rashid named, a creator
posting on the 1st and pasting the link on the 20th.

**And the first version of the fix was itself short.** The day loop runs
`back = 1..effectiveDays`, so `refreshDays: 7` with `days: 3` re-read three
days and reported seven. It would have missed the very drift it was written for,
which was four and five days back. The window now widens the loop.

**Proved end to end**, not just by reading the code: a row five days back was
deliberately overstated by $99.99 and the nightly call put it back; a row a
fortnight back was left alone, so the window is a real boundary rather than a
blanket force. `pnpm verify:numbers 20` then compared 1195 video-days against
the live API with no drift anywhere.

**Still open for prod:** prod has never synced and has none of the TikTok
secrets set. This migration and function go live with everything else when
Rashid says so.

---

## 24. Brand Hub: what the new sections still owe

**Parked 2026-08-24**, when My numbers, Contests and Leaderboards were opened
inside the creator Brand Hub.

**a. Two tabs are still empty rooms, deliberately.** Campaigns & briefs and
Creative studio have no table, no migration, no rows and no screen anywhere in
this repo. They stay marked and unclickable. **Raise it when either is actually
wanted**, and note first that nobody has yet defined what a CAMPAIGN is as
distinct from an offer or a contest. That definition is the blocker, not the
code. One thing to know before it is discussed: the landing page and the
creator welcome modal already PROMISE briefs to the open web
(`src/content/site.ts`), so this is not a quiet gap.

**b. Only ONE brand exists on dev, so brand isolation cannot be seen by eye.**
`verify:brand-numbers` proves the filter is applied, including that an unknown
brand returns nothing, but with a single brand a per-brand total equals the
global one and a leak would be INVISIBLE on screen. **Raise the moment a second
brand with real money exists**, and re-run the suite then. Better still, the
suite could make a temporary second brand and remove it, the way
`check-performance.mjs` does.

**c. The ByBrand panel ignores the source filter, and always has.** On the
standalone My numbers screen, tapping "Contest videos" narrows the tiles and
the chart but "Where your money came from" keeps showing every video, because
`creator_brand_performance` has no `p_source` argument at all. That contradicts
the screen's own comment, which says it filters in the database so everything
answers the same question. **Pre-existing, found while mapping, not introduced
here.** Inside a Brand Hub the panel is not rendered, so the bug is confined to
`/app/numbers`.

**d. `docs/FEATURE_MAP.md` section "Creator ad numbers, My numbers
(2026-08-18)" is stale in six ways** and contradicts both the code and the
newer sections of its own file: it describes a `distinct on` that no longer
exists, lists only the 2026-08-18 migration when every live body comes from
three later ones, and never mentions `p_source`, `creator_brand_performance`,
the ByBrand panel or `brand_id` on the money row. **Fix it in the same commit
as the next change to that surface.**

---

## 25. Brand World: what it still owes

**Parked 2026-08-24**, when the creator Brand Hub became a full-screen world.

**a. `src/routes/app/Brands.tsx` is now orphaned.** `/app/brands` opens the
first brand rather than a list, so nothing routes to that screen any more. It
is still in the repo. **Delete it, or give it a home**, next time that area is
touched. It was left rather than deleted because removing a whole screen in a
commit about theming is the sort of thing nobody finds again.

**b. Only ONE brand exists on dev, so the brand SWITCHER cannot really be
seen.** The rail renders the list correctly with one entry, but nobody has
watched a creator move between two worlds and the colours change. **Raise this
the moment a second brand exists**, and re-shoot: switching is the whole point
of the rail.

**c. No brand has a hero image yet.** The column, the upload control and the
crop rules are all built and the hero is designed to be right without one, but
the image path has been checked only by eye on a hub that has none. **Raise if
a hero ever comes back wrong after a save.**

**d. The world has no automated suite of its own.** `scripts/shots-hub.mjs`
photographs five sections at four widths in both themes and fails on a console
error, a sideways scroll or a world that never renders, which is real cover.
But nothing asserts the RAIL: that both lists are present, that a locked tab
refuses a click, that the Leave link goes home. **Worth adding when the second
brand arrives**, since that is when the switcher becomes testable.

**e. Applicants reach the world.** They are allowed onto the route on purpose,
because the JWT role lags approval by up to an hour, and they see the
"this opens when you are approved" panel. That panel is NOT themed by the
brand and sits on the plain Wurx background. Minor, and noted so nobody reads
it as the theming failing.

---

## 26. Ad delivery status: add the scopes and re-authorise

**Parked 2026-08-25**, when Rashid asked whether we can tell if an ad is
stopped, learning or queued. Probed live: **we cannot, today.**

**It is a SCOPE problem, which means it is ours and it is cheap.**
`/campaign/get/`, `/adgroup/get/`, `/ad/get/` and `/report/integrated/get/`
all answer `40001 ... lacks the required scope ... reauthorize your API App`.
That is the refusal that means OUR APP lacks the scope, not that the advertiser
withheld it. Add the scopes in the TikTok app settings, Rashid re-authorises,
done. No application to TikTok.

**What it buys:** `operation_status` (what the advertiser set) and
`secondary_status` (what TikTok is doing with it, where LEARNING and NOT
DELIVERING live). It also unlocks the integrated report, which is the only
route inside this app to impressions, clicks and video views.

**What it does NOT buy:** the GMV Max campaign objects.
`/gmv_max/campaign/get/` and `/campaign/gmv_max/info/` are a GRANT problem and
need TikTok to widen the authorisation.

**Confirmed dead ends, so nobody re-probes them:** status is not available as a
report field. `secondary_status` and `operation_status` are both refused by
name as metrics, and `campaign_id` is refused as a dimension.

**Why it matters rather than being a nice-to-have.** What a creator sees about
ads today is inferred from SPEND, not read from TikTok: "Ads running" means a
recent day had cost on it. So a campaign paused an hour ago still reads as
running until the spend stops arriving, and a campaign in learning with no
spend yet reads as "No ads".

**Trigger:** raise it when Rashid next has ten minutes in the TikTok app
settings, or the first time a creator asks why their video says no ads while
the brand says it is live.

