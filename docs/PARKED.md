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

## 18. Multi-brand money: one Business Center per brand, as of 2026-08-20

**Status:** NEXT, and part of it is a live defect rather than a gap
**Owner:** Claude to build, decisions already given by Rashid

Rashid, walking the multi-brand future: *"each brand has it's own ad account we
need to map only one ad account with one brand only ... each brand will have
it's own Business center connection so there must be an option to connect
multiple ad accounts and link them properly with brand"*, and *"their gmv should
always be the sum of every brand every offer/contest they are in"*, and *"the
creator should never be able to see the breakdown of other creators"*.

### His decisions, taken 2026-08-20. Do not re-litigate these.

1. **One brand maps to exactly ONE ad account.** Never two brands on one
   account, never one brand across two.
2. **Each brand will have its OWN TikTok Business Center connection.** The two
   ad accounts on dev today are both inside one Business Center and are the same
   business; only the one that runs the ads is mapped, deliberately.
3. **USD ONLY.** Confirmed with his boss on 2026-08-20. No FX table, no
   conversion, no admin rate screen. But the read functions must REFUSE to blend
   currencies rather than assume: if a non-USD row ever appears, say so on the
   screen instead of silently adding it to a USD total.
4. **One video id belongs to ONE creator, permanently**, enforced in the
   database across BOTH `content_submissions` and `contest_submissions`. The
   same creator filing one video against an offer AND a contest stays legal.

### The live defect, found 2026-08-20

**Connecting a second Business Center silently kills the first.**
`supabase/functions/tiktok-callback/index.ts:118-120` revokes every live
connection before inserting the new one:

```js
.from('tiktok_connections').update({ access_token: '', revoked_at: nowIso })
                           .is('revoked_at', null);
```

So the day Brand B is connected, Brand A stops being pulled: no error, no
warning, its creators' numbers just freeze at yesterday. On a money screen that
is the worst failure shape available. **This blocks his stated plan and must be
fixed before a second brand is onboarded.**

### What has to change, and what does not

**The schema is already right.** `tiktok_ad_accounts.connection_id` exists and
references `tiktok_connections`, so the chain store -> ad account ->
connection -> token is already there. Nothing needs restructuring.

Three places assume "one":

- `supabase/functions/tiktok-callback/index.ts:118-120` — stop revoking
  everything. Guard against re-connecting the same Business Center instead.
- `supabase/functions/tiktok-sync/index.ts:181-188` — takes `.limit(1)` on
  connections and uses that single token for every store. It must resolve the
  token PER STORE, through that store's advertiser to its own connection.
- `src/routes/admin/TikTokSettings.tsx` and the disconnect action — they talk
  about *the* connection rather than *a* connection, and disconnect is
  unscoped.

### The audit, 2026-08-20: 54 findings, every one adversarially re-checked

Five agents, then a refuter per defect whose only job was to prove it wrong.
**Twelve were refuted and are NOT bugs** — including "currency is never
populated" (it is), "unmapping a store freezes a brand's money" (it does not),
and "the leaderboard can be reconstructed per brand by moving the date window"
(it cannot). What survived is below, in the order it should be fixed.

**CONFIRMED CRITICAL**

1. **The money key cannot hold two ad accounts.**
   `tiktok_video_daily` PK is `(item_id, stat_date)` and the sync upserts
   `onConflict: 'item_id,stat_date'` with a full-row payload, so a second
   advertiser reporting the same video on the same day REPLACES the first
   rather than adding to it. Direction is always downward, often to zero,
   because the report returns zero-spend rows for ids it was filtered on.
   Silent: `tiktok_sync_runs` shows two healthy runs.
2. **Nothing stops one TikTok store being mapped to a brand twice, and today's
   Penetrex IS that shape.** The store is authorised to both ad accounts, so it
   appears twice on the settings screen with a brand dropdown on each, no
   constraint, no warning, and no correct answer. Mapping both triggers (1) for
   every Penetrex video at once.
3. **Two creators can both claim one video and both bank its GMV**, including
   on the leaderboard. Reachable today: nothing anywhere enforces one owner per
   `embed_id`.

**CONFIRMED HIGH**

4. **The leaderboard has no caller gate.** It is granted to `authenticated`,
   so an applicant, a REJECTED applicant or a suspended creator reads every
   creator's GMV and ad spend. Introduced 2026-08-20 by the leaderboard
   migration.
5. **`creator_avatars` is readable in full by every signed-in account** and
   carries the TikTok handle of every creator AND every applicant, which turns
   it into a directory. Also introduced 2026-08-20, by the `using (true)`
   policy.
6. **DELETE events broadcast the whole old row.** `content_submissions`,
   `applications`, `offer_applications` and `offer_stage_events` are all
   in the realtime publication with `replica identity full`, and row security
   is not applied to DELETE. `20260813230000` already fixed exactly this for
   two contest tables and the rest were never done. Nothing in the client reads
   the old row, so the fix costs nothing.
7. **Connecting a second Business Center revokes the first**
   (`tiktok-callback` :117-120), so brand A's money silently freezes the day
   brand B is connected.
8. **The sync is unfair and truncating.** One store's backfill depth is applied
   globally, the store list has no ORDER BY, the first store can eat the whole
   call ceiling so other brands sync nothing that night, and the video roster is
   a flat `.limit(2000)` that silently drops rows past that and makes the
   fingerprint churn every run.
9. **The creator Dashboard's money block sums committed amounts across
   currencies** and labels the total with whichever row came last. Pre-existing,
   in `useMyWork.ts` `summarise()`.

**Currency is DOWNGRADED, not dismissed.** Several findings were about summing
GBP into USD. Rashid confirmed with his boss on 2026-08-20 that the product is
**USD only**, so no FX work is needed — but the reads must REFUSE TO BLEND
rather than assume, or the business decision becomes a silent money bug the day
it stops being true.

**What the audit found to be genuinely CORRECT**, and should not be
re-engineered: summing a creator's money across every brand, offer and contest
is structurally right; a video filed twice counts exactly once in all three read
paths; the tiles agree with the chart; ROI is a ratio of sums; and the
leaderboard cannot leak another creator's per-brand breakdown or anything else
about them.

Full output while it lasts:
`<scratchpad>/../tasks/whxurwm0x.output`.

### Also outstanding

- **`tiktok_video_daily` PK is `(item_id, stat_date)`** and `advertiser_id`
  is a plain column. Two advertisers reporting one item on one day OVERWRITE
  rather than sum. Safe today because one brand maps to one account, which is
  now a rule rather than an accident, but it deserves a constraint or a comment
  saying the rule is what keeps it safe.
- **A per-brand breakdown of a creator's OWN numbers does not exist yet.** He
  asked for it by name: *"let creators see that in which brand they got how many
  money so they can analyse"*. `creator_video_performance` already returns
  `brand_id` and `brand_name` per row, so the data is there.
- **A multi-brand money audit was running when this was written** and did not
  finish. Script:
  `<scratchpad>/multi-brand-audit.js`, run id `wf_c08b6020-fd4`. Re-run it
  from the script file; nothing depends on the old run. It covers sync/mapping,
  creator totals arithmetic, leaderboard correctness, cross-creator leakage and
  scale.
