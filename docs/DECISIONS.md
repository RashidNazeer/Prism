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
- 2026-07-28: Flagged to Rashid but not acted on, (a) a Vite SPA has no
  server-rendering, so the public landing page will be weak for SEO and link
  previews until we add a build-time prerender; (b) the Supabase free tier
  pauses inactive projects and has no daily backups, so prod needs a paid plan
  before real creators use it.
