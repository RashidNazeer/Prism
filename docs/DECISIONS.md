# Decisions

Dated one-liners. Why, not just what. Newest at the bottom.

---

- 2026-07-28: Stack locked by Rashid, React + Vite + TS strict, Tailwind +
  shadcn/ui, TanStack Query, React Router, Supabase only, Vercel, pnpm. No
  Next.js (his previous Next builds felt slow).
- 2026-07-28: Claude drives all CLIs with scoped tokens from
  `C:\Users\RA_shid\.wurx\cli-secrets.env`, never `*/login` commands, Rashid
  has another project signed in on GitHub/Supabase/Vercel and it must not be
  disturbed. GitHub uses a fine-grained token locked to this one repo; Vercel
  and Supabase tokens are account-wide because neither offers per-project
  tokens (Rashid accepted this, both set to expire in 90 days).
- 2026-07-28: Two Supabase projects in a dedicated "Wurx Media" org rather than
  one project with two schemas, "prod is sacred" is only real if prod is a
  separate database.
- 2026-07-28: Supabase project settings, `Enable automatic RLS` ON (forces RLS
  on every new table, matching our deny-by-default rule) and `Automatically
  expose new tables` OFF (grants are explicit per table, in the migration).
  Both projects configured identically.
- 2026-07-28: Brand palette taken from wurxmedia.com's own stylesheet rather
  than invented, near-black `#0a0a0a`, gold `#c8924b`, cream `#f5efe1`,
  Archivo Black / Inter / JetBrains Mono.
- 2026-07-28: Light mode uses a darkened gold `#8a5f1f` instead of the brand
  `#c8924b`. The brand gold is only 2.58:1 on a light background, it would
  have been unreadable. Dark mode keeps the true brand gold at 7.23:1.
- 2026-07-28: `scripts/check-contrast.mjs` runs inside `pnpm build` and fails
  the build on (a) a token defined in one theme but not the other, or (b) any
  text/background pair below WCAG AA. Rashid's standing instruction: dark and
  light must never mismatch, so it is enforced mechanically rather than by
  memory.
- 2026-07-28: `noPropertyAccessFromIndexSignature` deliberately NOT enabled
  despite otherwise-strict TypeScript. It forces `import.meta.env['VITE_X']`,
  and Vite only statically replaces the dot form, the bracket form would
  silently be `undefined` in production.
- 2026-07-28: Use Supabase's new **publishable** key (`sb_publishable_...`) via
  `VITE_SUPABASE_PUBLISHABLE_KEY`, not the legacy `eyJ...` anon JWT. Both were
  tested live against `/auth/v1/settings` and both return 200, but the legacy
  keys are on Supabase's deprecation path and this product is meant to run for
  years. Swapping back is a one-line env change if anything ever needs it.
- 2026-07-28: Git in this repo uses a local credential helper that reads
  `GH_TOKEN` from the environment, with an empty helper entry ahead of it to
  reset the inherited Windows Credential Manager. Verified by negative test: an
  invalid token now fails the push instead of silently falling back to Rashid's
  stored GitHub login.
- 2026-07-28: Playwright added as a dev dependency. Rashid cannot debug in a
  console, so "zero console errors" has to be machine-verified; section 11's
  auth-stability tests (idle refresh, two tabs, refresh mid-form) will need it
  too.
- 2026-07-29: Git commit identity is
  `286085480+RashidNazeer@users.noreply.github.com`, not Rashid's personal
  email. GitHub maps that personal email to a *different* account (`TSRashid`),
  and Vercel's Hobby plan BLOCKS any deployment whose commit author it cannot
  match to the connected account, every deploy failed with state `BLOCKED`
  until this was corrected. Do not change `user.email` in this repo.
- 2026-07-29: Both Vercel projects build from the one repo, so each has an
  Ignored Build Step so it only builds its own branch (`wurxmediahub` -> `main`,
  `wurxmediahubdev` -> `dev`). Without it every push built twice.
- 2026-07-29: `wurxmediahubdev.vercel.app` is pinned to the `dev` git branch via
  the domains API. Vercel's public API does not expose the "Production Branch"
  setting, so this is the CLI-drivable equivalent and avoids sending Rashid back
  to the dashboard.
- 2026-07-29: Vercel Authentication (`ssoProtection`) turned OFF on both
  projects. It defaulted to `all_except_custom_domains`, which would have put
  both `.vercel.app` URLs behind a Vercel login, Rashid could not have tested
  them, and the public landing page must be reachable. The shell ships with
  `<meta name="robots" content="noindex">`. Say the word and dev goes back
  behind protection.
- 2026-07-29: Roadmap reordered by Rashid, the public landing page (Step 2) is
  built before auth (Step 1). Auth follows.
- 2026-07-29: Prod frozen. Everything pushes to `dev` only until Rashid says
  "make it live". `main` is not to be touched.
- 2026-07-29: Display font changed from **Archivo Black** to **Fustat**. Rashid
  rejected Archivo Black as looking AI-generated. He pointed at medialabs-co.com
  as the reference; their stylesheet was read directly and uses
  `h1..h4 { font-family: Fustat; font-weight: 700; letter-spacing: -0.02em;
  line-height: 1.08 }` with Inter for body. We adopted the same recipe, applied
  once in global.css rather than per component. Archivo Black is a poster face, at 5rem it reads as a template, which is exactly what Rashid objected to.
- 2026-07-29: The hero carries an example "My Numbers" dashboard card. A hero
  that is text-only with a large empty right side is the clearest tell of a
  generated page, and the product's whole pitch is "you get a dashboard, not a
  screenshot", so showing it beats describing it. The card is labelled
  **Example** and uses invented figures; it must never be presented as a real
  creator's data.
- 2026-07-29: Landing page marketing numbers (100M+ revenue, 5K+ creators,
  2B+ views) supplied and confirmed by Rashid. The "Official TikTok Partner"
  claim from the MediaLabs reference was deliberately NOT copied, Rashid
  confirmed Wurx is not one.
- 2026-07-29: Brand logos in `src/content/site.ts` are placeholders and flagged
  as such in the file. Real partner names were not invented.
- 2026-07-29: Large display numbers use `.wx-lining`, not `.wx-numeric`. Fustat
  renders the tabular comma at full digit width, so tabular figures turned
  `$48,920` into `$48 , 920`. Tabular is still correct for leaderboards and data
  tables where digits must align between rows.
- 2026-07-29: `MotionConfig reducedMotion="user"` wraps the app. The
  prefers-reduced-motion media query in global.css only governs CSS
  transitions; Motion animates in JavaScript and would otherwise ignore it.
- 2026-07-29: The hero right column is the application form, not the example
  dashboard card. Rashid's call, the form is the conversion point, so it goes
  above the fold. `NumbersPreview.tsx` was deleted; it is in git history and can
  come back into the Platform section if wanted.
- 2026-07-29: Hero now has ONE secondary button ("See how it works", size xl).
  "Apply to join" was removed because the form is right there; every other Apply
  CTA on the page scrolls to `#apply` instead of routing away.
- 2026-07-29: `/apply` still exists as a standalone route rendering the SAME
  `<ApplyForm />`, so a direct link from a DM or email lands somewhere focused.
  One form component, two placements, never two copies.
- 2026-07-29: Container widened to `max-w-7xl` with `px-5 sm:px-8`. At Rashid's
  ~1280px viewport the old `max-w-6xl` left a thin strip of dead margin.
- 2026-07-29: The application Zod schema lives in
  `src/lib/schemas/application.ts`, deliberately separate from the component,
  because Step 3's Edge Function will import the same file and re-validate
  server-side. Client validation is convenience; the server is the boundary.
- 2026-07-29: **Form is not wired to a database.** Submitting validates and
  shows a success panel that says so explicitly. It must keep saying so until
  Step 3 lands, a success message for an application nobody received would be
  a lie to a real creator.
- 2026-07-29: Landing page weight noted at ~182 KB gzip JS/CSS + ~102 KB fonts.
  The single biggest item is Zod at roughly 60 KB gzip inside the ApplyForm
  chunk. Not acted on yet. Fix at Step 3, when the schema is final: either
  switch to `zod/mini` or dynamic-import the schema so it is off the landing
  page's critical path.
- 2026-07-29: **No web fonts.** Rashid asked for lower page weight and said he
  never meant to copy a specific typeface, only to have something professional.
  Fustat + Inter + JetBrains Mono cost 102 KB and a render-blocking round trip
  to Google. Replaced with system stacks that resolve to Segoe UI Variable
  Display / SF Pro Display / Roboto. Zero bytes, and they are the faces Windows
  and macOS use for their own interfaces.
- 2026-07-29: Zod moved off the landing page's critical path. The schema file
  is now split: `application-fields.ts` (option lists and types, Zod-free) is
  imported normally, `application.ts` (the Zod schema) is dynamically imported
  on first submit. Saves ~16 KB gzipped on initial load and costs nothing,
  because nobody needs a validator before they press the button.
- 2026-07-29: Motion switched to `LazyMotion` + `domAnimation` with `strict`,
  and every `motion.x` became `m.x`. Cut the form chunk from 44 KB to 8 KB
  gzipped. `strict` makes the heavy `motion.x` throw, so it cannot creep back
  in. Verified `whileInView` still works via the existing browser test.
- 2026-07-29: Landing page initial download went from roughly 284 KB (182 KB
  JS/CSS + 102 KB fonts) to roughly 159 KB, a 44% cut.
- 2026-07-29: Real partner logos, taken from the marquee on wurxmedia.com.
  The originals were PNGs wrapped in SVG, 315 KB in total including a 2048x2048
  bitmap for a 38px slot. They were unwrapped, cropped to their artwork and
  downscaled to roughly 50 KB, all with Node and Windows' built-in imaging, so
  no image-processing dependency was added.
- 2026-07-29: Partner logos are white artwork on OPAQUE BLACK, so they cannot
  simply be drawn on a light page. `.wx-logo` blends instead: `screen` in dark
  (the black drops out), `invert(1)` then `multiply` in light (the white drops
  out). `.wx-marquee` paints its own background because `mask-image` creates a
  stacking context that would otherwise isolate the blend.
- 2026-07-29: The marquee is pure CSS: the logo list is rendered twice and the
  track slides exactly -50%. No animation library, no scroll listener. It pauses
  on hover and is disabled entirely under prefers-reduced-motion.
- 2026-07-29: Now using the real Wurx Media logo (mascot + wordmark) from
  wurxmedia.com, downscaled from 1641x460 / 125 KB to 228x64 / 11 KB. It is
  cream artwork drawn for dark backgrounds, so light mode darkens it via
  `--wx-mark-filter: brightness(0.32)`; brightness multiplies each channel, so
  the mascot keeps its internal contrast instead of flattening to a silhouette.
  `public/favicon.svg` still shows the older geometric "W" and does not match.
- 2026-07-29: **No em dashes or en dashes anywhere.** Rashid's standing
  instruction. Swept from every source, doc and config file. Watch for this when
  writing new copy.
- 2026-07-29: Auth is email and password only for now. Rashid chose it to keep
  moving; email-code sign-in is PARKED, not rejected.
- 2026-07-29: Applying will create an account. An anonymous application form
  cannot show status, cannot update live when a decision is made (which Step 4
  requires), and has to be matched back to an account by email later, which
  breaks the moment someone signs up with a different address.
- 2026-07-29: Role and tier live in `profiles` and are copied into the JWT by
  `custom_access_token_hook`. Policies read a claim instead of querying the
  table on every request. The trade-off, written down so it is not forgotten: a
  token is only reissued about once an hour, so a role change does not reach the
  claim immediately. Anything that must apply instantly, like suspending an
  account, has to read the table.
- 2026-07-29: Self-promotion to admin is blocked three separate ways: no INSERT
  grant, a column-level UPDATE grant covering `display_name` only, and a
  BEFORE UPDATE trigger. Belt, braces and a second pair of braces, because this
  is the one bug that would be catastrophic and silent.
- 2026-07-29: Found while writing `check-rls.mjs`: turning off "automatically
  expose new tables" also disables Supabase's default grants to `service_role`,
  not just to `anon` and `authenticated`. Every Edge Function in Steps 3 and 4
  would have silently read nothing. Fixed by an explicit grant plus a default
  privilege for future tables.
- 2026-07-29: `password_min_length` raised from Supabase's default 6 to 10, and
  the client schema matches it. Length beats forced symbols.
- 2026-07-29: `AuthProvider` imports the Supabase client dynamically. A static
  import put the whole client (~55 KB gzipped) into the entry chunk, so someone
  reading the marketing page downloaded a database client they never used. Vite
  `manualChunks` also splits Supabase away from TanStack Query, because Query is
  on the critical path and bundling them together silently undid the fix.
- 2026-07-29: Password reset deliberately shows the same confirmation whether or
  not the email exists. Saying "no account found" would let anyone test which of
  our creators are registered.
- 2026-07-29: **The hero form on the landing page IS the sign up.** Rashid asked
  what the point of the form was if people still had to go to a separate signup
  page. He offered two options: add a password to the hero form, or replace the
  form with the steps and move it to its own page. Took the first: the design was
  already approved, it is one extra field, and it keeps the pitch and the
  conversion point together. `/signup` and `/apply` now render that same form.
  The old account-only SignUp page was deleted; it collected less information
  and would have created accounts with no application.
- 2026-07-29: One password field with a show/hide toggle, no "confirm password".
  Letting someone check what they typed solves the same problem with one field
  instead of two, which matters in an already long form.
- 2026-07-29: "Apply" in the header now scrolls to the form AND focuses its
  first input. Rashid reported it doing nothing: on a desktop the form is
  already on screen, so scrolling to it was invisible.
- 2026-07-29: Sign up and application insert are two separate writes rather than
  one atomic transaction. If the second fails the account still exists, and the
  dashboard offers to finish the application, so nobody is stranded. Doing it
  atomically would mean stuffing the whole application into auth user metadata,
  which is worse: it lives in the auth schema forever and is harder to query.
- 2026-07-29: `applications.worked_with_wurx` is its own indexed boolean column
  rather than being buried in a notes field, because Rashid flagged it as
  important for fast-tracking existing Wurx creators during review.
- 2026-07-29: Realtime enabled on `applications` with `replica identity full`,
  scoped per user. Row level security still applies to realtime, so an applicant
  only ever receives events for their own row. This is what makes Step 4's live
  status change work.
- 2026-07-28: Content-Security-Policy deferred. The anti-flash theme script is
  inline and Motion injects inline styles, so a correct CSP needs script hashes
  and careful testing. Other security headers (HSTS, nosniff, frame-deny,
  referrer, permissions policy) ship now in `vercel.json`. **Revisit before the
  first prod launch.**
- 2026-07-29: Approvals go through an Edge Function that re-reads the caller's
  role from `profiles` rather than trusting the `user_role` JWT claim. A claim
  is only refreshed with the token, so an admin suspended five minutes ago is
  still carrying an admin claim. The table is the truth for anything
  privileged; the claim is only for deciding which screen to draw.
- 2026-07-29: The whole decision lives in one `security definer` Postgres
  function, `review_application()`, granted to `service_role` only. Status,
  role, tier and the audit row commit together or not at all. Three REST calls
  from the Edge Function could leave someone approved on one screen and an
  applicant on another, and the `profiles_tier_only_for_creators` constraint
  would reject the half-way state anyway.
- 2026-07-29: `audit_log` gets a staff SELECT policy and **no** insert, update
  or delete grant to `authenticated`. Only security definer functions running as
  `service_role` write it. An audit trail an admin can edit is not an audit
  trail. A blocked review attempt is logged too, with the caller's name on it.
- 2026-07-29: A rejection leaves the account exactly as it is (still an
  applicant, nothing deleted) rather than disabling it, so a decision can be
  revisited by hand and the history survives.
- 2026-07-29: Edge Function CORS echoes `Access-Control-Request-Headers` instead
  of naming a fixed list. Found the hard way: our Supabase client sends a custom
  `x-application-name` header, the static list did not mention it, the preflight
  failed, and approving an application silently did nothing. Preflight decides
  which headers a browser may send, not who is allowed in, so echoing costs no
  security.
- 2026-07-29: Admin queue filters live in the URL, not component state, so a
  reviewer can send a colleague a link to the same view and the back button
  behaves after opening an application.
- 2026-07-29: `AppShell` and `Dashboard` now prefer `profile.role` over
  `claims.role` for display. Otherwise a creator approved a minute ago keeps
  being shown as an applicant until their token refreshes, up to an hour later,
  while their status card already says approved.
- 2026-07-30: Signed-in screens moved from a top bar to a **vertical sidebar**,
  Rashid's call. The product has a lot of sections still to come (brand hubs,
  numbers, leaderboards, offers, uploads) and a top bar has nowhere to put them.
  Sections that do not exist yet are listed, tagged with the step that brings
  them, and deliberately are not links.
- 2026-07-30: `/` redirects a signed-in visitor to their own home, but only if
  they were ALREADY signed in when the page opened. Redirecting on "signed in
  right now" fires during sign up, before the application row is written.
- 2026-07-30: `/signup` moved OUT of the `RedirectIfSignedIn` guard and is now a
  plain alias of `/apply`. That guard fired the moment sign up returned, which
  is before the application insert lands. The dashboard mounted, asked whether
  an application existed, was correctly told no, and cached it for 30 seconds,
  so someone who had just applied was told to "Finish your application".
  Reproduced 3 times in 8 runs and caught on the wire: the GET went out 19ms
  before the POST.
- 2026-07-30: `useApplication` never treats `null` as settled. It re-checks
  every 3 seconds until a row appears. "You have no application" is the one
  answer that can be a lie, and a stale one strands a new creator on a screen
  telling them to start again.
- 2026-07-30: Staff sign in at `/admin/login`, their own screen, Rashid's call.
  The team should not be greeted by a page selling them on applying, and no sign
  up link belongs anywhere near it. Signed-out visits to any `/admin` route land
  there instead of `/login`, so signing out of the panel returns you to the
  right door. It is a different DOOR, not a different LOCK: both screens call
  the same sign in, and permission is still decided by row level security and
  the Edge Function's server-side role check. A creator who signs in there is
  simply sent to their own dashboard rather than told off. Nothing about which
  URL was used is ever treated as a security boundary.
- 2026-07-30: Counts moved off the queue onto a Dashboard screen at `/admin`,
  Rashid's call. The queue is for working through applications, so it should
  open on the list rather than push it below a row of tiles. The queue is now
  `/admin/applications` and the tabs carry their own small counts.
- 2026-07-30: Pending rows show an action menu (view TikTok, approve, reject)
  instead of a "pending" badge. On the Pending tab that badge told you something
  you had already filtered by, so the space was better spent on the decision.
- 2026-07-30: Bulk approve and reject added, as a server-side loop over
  `review_application` rather than a bulk SQL statement. Each application keeps
  its own transaction and its own audit row, so one failure cannot roll back
  nine successes and nothing can slip through unlogged. Capped at 100.
- 2026-07-30: The email came out of the queue row. The handle identifies a
  creator; the email is on the detail screen where it is actually needed, and
  dropping it made every row shorter, which is the point of a queue.
- 2026-07-30: The desktop sidebar collapses to icons, remembered in
  localStorage, and the theme toggle moved to the top bar on the right. The
  collapse control lives in the top bar rather than the rail, because at 72px
  the rail has no room for it and it would disappear exactly when you needed it
  to bring the labels back.
- 2026-07-30: `scripts/check-responsive.mjs` checks every screen at 375, 768,
  1024 and 1440px. Rashid's creators are mostly on phones and tablets, so this
  is enforced mechanically rather than by remembering to look.
- 2026-07-30: Modals scroll inside themselves rather than inside a
  `fixed inset-0 flex items-center` wrapper. Found by review and reproduced in
  Chromium: with the scroll on the wrapper, a dialog taller than the viewport
  overflowed past the container's top edge, which is not part of the scrollable
  region, so on a 375x554 phone the heading sat 114px above the screen with a
  maximum scroll offset of zero. The confirm button stayed visible, so nothing
  hinted that anything was missing.
- 2026-07-30: Tap targets on the queue are padded to roughly 40px with a
  wrapping `<label>` while the drawn checkbox stays 16px. A 16px target sitting
  on top of a full-row navigation link is a coin flip on a phone, and losing it
  opens the application instead of ticking it.
- 2026-07-30: `useFocusTrap` is shared by the review dialog and the mobile
  drawer. Both cover the page, and both previously let Tab walk into content
  behind the scrim. Initial focus goes to the first real control, not the close
  button, so a keyboard user does not open a form parked on the exit.
- 2026-07-30: `text-faint` is banned on `bg-surface-2` (4.31:1 in light mode,
  under AA). It is not added to the contrast guard's PAIRS list, because adding
  a knowingly failing pair would just break the build; it is recorded as a
  comment there instead, and the guard already checks the `text-muted`
  replacement.
- 2026-07-30: The one-time creator moments (welcome on joining, congratulations
  on approval) are recorded as timestamps on `profiles`, not in localStorage.
  Rashid asked specifically that these fire once and never again, and browser
  storage cannot promise that: a creator applies on a phone and signs in on a
  laptop, and a cache clear would replay the celebration. Timestamps rather than
  booleans, because "how long between applying and being told" is worth being
  able to answer later.
- 2026-07-30: Those two columns are granted to `authenticated` at column level.
  The worst a tampered value does is skip or repeat an animation on the
  attacker's own screen, nothing reads them for a permission decision, and
  `pnpm verify:rls` now proves the grant did not open a side door to role.
- 2026-07-30: The onboarding overlays have no Escape, no backdrop dismiss and no
  close cross. The button is the acknowledgement, and the moment happens once in
  a creator's life, so an accidental tap outside must not spend it.
- 2026-07-30: Account details moved off the creator dashboard to `/app/profile`.
  The home screen should be about where they stand with us, not about an email
  address they already know. The scratch note used by the session test is gone;
  that test now types into the real display-name field instead, which proves the
  same thing about a form creators actually use.
- 2026-07-30: The sidebar user block is an avatar, a name, an email and a sign
  out icon on one row. It previously stacked a role chip and a tier chip, which
  on a new creator read "CREATOR CREATOR" because the role and the starting tier
  share a word. Role and tier belong on the profile screen.
- 2026-07-30: Brand Hub, phase one. `brands` and `offers`, admin side only.
  Creators get NO read access to either yet, on purpose: `brands` holds the
  allocated budget and the client's name, and column level SELECT grants cannot
  separate staff from creators because both are `authenticated`. The creator
  read path will be a column-limited view written against the real
  requirements. Shipping a guess at it today would be shipping an untested way
  to leak a budget.
- 2026-07-30: All brand and offer writes go through the `manage-brand` Edge
  Function into `save_brand` / `save_offer` / `delete_offer`. Neither table has
  any write policy at all, so there is exactly one door. CLAUDE.md names brand
  edits as a privileged action; this is that.
- 2026-07-30: Money is `numeric(14,2)`, never a float, and PostgREST hands it
  back as a string. `money()` parses only for display. A float cannot hold 0.10
  exactly, and these columns decide what people are paid.
- 2026-07-30: A brand's slug is generated from its name once, at creation, and
  never regenerated on rename. Creators will hold brand hub links and a rename
  must not break every one of them.
- 2026-07-30: `store_id` is unique. Two brands sharing one TikTok Shop store is
  always a mistake, and the Edge Function turns the constraint violation into
  "Another brand already uses that store id" rather than a Postgres error.
- 2026-07-30: `offers.needs_application` defaults to true, so an offer that pays
  out with nobody signing it off has to be chosen deliberately.
- 2026-07-30: Brands are retired with `is_active`, not deleted. Offers can be
  deleted, and `delete_offer` writes the audit row before the delete so the
  record outlives the row.
- 2026-07-30: No adversarial multi-agent review on this feature. Rashid asked
  that expensive review runs be reserved for where they add something, and the
  project rules it would re-check are already established and followed. The new
  security surface is covered instead by `scripts/check-brands.mjs`, which
  attacks both tables, both database functions and the Edge Function as a real
  signed-in creator, and keeps doing so on every run.
- 2026-07-30: Admin content is left aligned against the sidebar, not centred.
  Rashid saw it zoomed out: centred content leaves a wide gap next to the rail
  and the two halves stop looking like one page. Capped width hugging the left
  behaves at every size, which is also how every dashboard people already use
  behaves.
- 2026-07-30: The Brand Hub opens on **Offers**, and the brand's facts moved to
  their own **Overview** tab. Somebody opening a brand is there to manage its
  offers; landing them on a summary they already know, then making them scroll
  past it, was the wrong order. Overview is listed first because that is the
  conventional place for it, but it is not where you land.
- 2026-07-30: The brand slug is no longer shown in the hub header. An admin has
  no use for a route, and it was taking a line to say nothing. It is still
  generated and stored for the creator-facing URLs.
- 2026-07-30: **The client name and the allocated budget moved off `brands`
  into their own staff-only table, `brand_commercials`.** Opening brands to
  creators needed one of two things: a column-limited view over `brands`, or
  splitting the commercial columns out. The split won because it removes the
  failure mode rather than guarding it. With a view, the budget is still one
  careless policy away from a creator, and every future creator-facing read has
  to remember to use the view. With the split there is no budget column on
  anything a creator can reach, RLS on `brands` stays real row security instead
  of a definer view bypassing it, and a mistake has to be deliberate: somebody
  would have to grant access to a table called "commercials". Cost was one data
  migration and a flatten in `useBrands.ts`.
- 2026-07-30: Creator read access is gated by `is_approved_creator()`, which
  reads the `profiles` table, not by `is_staff()`, which reads the JWT claim.
  Approval happens live and often; a token is up to an hour stale. Gating on
  the claim would mean a creator watches the approval confetti, clicks into
  brand hubs, and finds them empty. Staff roles effectively never change, so
  `is_staff()` staying claim-based is fine.
- 2026-07-30: Brand logos and product images upload to a public Supabase
  Storage bucket rather than being pasted in as URLs. An admin has a file, not
  a link, so a URL field would have been a dead end. Public read because these
  pictures are already on a public TikTok Shop listing and signed URLs would
  make every card wait on a token. **SVG is excluded from the allowed types:**
  it can carry script, and a logo does not need it.
- 2026-07-30: The brand's About tab writes through its own `brand.about`
  action, not through `brand.save` with three extra fields. The About form owns
  three fields and should not be able to overwrite the name, the store id or
  the budget by posting a stale copy of them back alongside its own edit.
- 2026-07-30: The creator Brand Hub opens on **Overview**, the opposite of the
  admin hub's default. Deliberate, not an inconsistency: an admin opens a brand
  to work on it, a creator opens it to decide whether they want it, and that
  decision is made on the brand and its products.
- 2026-07-30: Applying for an offer was left out of this step and its buttons
  ship visibly disabled, saying "Opens next". Applying needs its own table, a
  creator form and an admin approve/reject queue, which is a step in itself.
  Shipping a live-looking button that silently does nothing would be worse than
  admitting it is not ready.
- 2026-07-31: A creator can counter an offer, not just accept it, and both are
  one row in `offer_applications`. An offer is an opening position rather than a
  contract, and a creator worth more than the sticker price should be able to
  say so inside the product instead of leaving to send a DM. It also collapses
  what would otherwise be two features: the "custom offer" Rashid described is
  just a counter against an offer with no fixed terms.
- 2026-07-31, later the same day: **REVERSED by Rashid. A creator takes an offer
  as it is written and cannot name their own price.** Commercially his call, not
  a technical one. `apply_for_offer` no longer accepts the two numbers, so
  nothing can write them; the columns and the admin rendering were kept, because
  requests made during the window carry real figures and the queue must not
  later claim they were taken as written. A create request that still carries
  its own numbers is refused with a sentence rather than quietly stripped: it
  can only be a stale browser tab, and the alternative is agreeing somebody to a
  price they did not type.
- 2026-07-31: The two counter offer columns were dropped rather than kept, once
  Rashid confirmed everything is on dev and a count found zero rows carrying a
  creator-set price. The reason for keeping them was to avoid restating what
  somebody had really asked for; with no such rows, all that was left was dead
  columns and dead screen code on a table payments will hang off. The drop then
  broke `review_offer_application`, silently, because plpgsql resolves field
  names at run time: worth remembering before the next one.
- 2026-07-31: Every Playwright suite launches through `scripts/browser.mjs`
  rather than `chromium.launch()`. Not a test-quality decision, a machine one:
  7.4 GB of RAM with VS Code already on most of it meant a default launch was
  getting the editor's extension host killed mid-run, which looked like Claude
  hanging. Suites are also run detached with their output to a file, so a dead
  editor cannot lose a run or strand test accounts.
- 2026-07-31: An offer that needs an application but has no written terms can
  still be applied for. Requiring terms on such an offer is a rule enforced on
  the admin's side, and refusing a creator because an admin left a field empty
  punishes the wrong person.
- 2026-07-31: `proposed_video_count` and `proposed_amount` stay NULL when a
  creator takes an offer as written, rather than being filled with the offer's
  own numbers. The two look identical on the day and diverge the moment an admin
  edits the offer, and only one of them is true afterwards.
- 2026-07-31: The unique index on (offer, creator) is partial, covering pending
  and approved only. A plain unique constraint would have banned a rejected
  creator from that offer permanently, which defeats the point of letting them
  name a price.
- 2026-07-31: `manage-offer-application` checks the caller's role PER ACTION
  rather than once at the top. It is the first door both creators and staff use,
  and a single gate would have had to be the loosest of the two.
- 2026-07-31: The creator's identity is snapshotted onto each request
  (handle, name, email), the same way `audit_log` snapshots its actor. Search
  becomes one trigram index on one table instead of a join across three, and the
  queue still reads correctly after a rename or a closed account.
- 2026-07-31: An offer with pending or approved requests cannot be deleted.
  Settled ones cascade and the audit log keeps them. Deleting an offer somebody
  is waiting on is how you lose a creator.
- 2026-07-31: The creator hub header was cut from a tall card to one compact
  row, and the offer cards lost their status chip and their "no fixed
  deliverable or fee" line. Rashid's note, and he is right: the header repeated
  what Overview says better while pushing the real content off the first screen,
  the chip said the same thing as the button under it, and a line explaining the
  absence of something nobody asked about is worse than silence.
- 2026-07-28: Flagged to Rashid but not acted on, (a) a Vite SPA has no
  server-rendering, so the public landing page will be weak for SEO and link
  previews until we add a build-time prerender; (b) the Supabase free tier
  pauses inactive projects and has no daily backups, so prod needs a paid plan
  before real creators use it.
