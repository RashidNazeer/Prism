# Operations runbook

Everything needed to drive this project from a cold start, with no memory of
previous sessions. If something here is wrong, fix it here first.

---

## 1. Identifiers

| What              | Value                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| GitHub repo       | `RashidNazeer/WurxMediaHub` (private)                                                                 |
| Branches          | `main` = prod, `dev` = daily work. **Everything goes to `dev` only** until Rashid says "make it live" |
| Vercel team id    | `team_OL5SlbHFgyYvmXYyScEUmDo0`                                                                       |
| Vercel projects   | `wurxmediahub` (main), `wurxmediahubdev` (dev)                                                        |
| Dev URL           | https://wurxmediahubdev.vercel.app                                                                    |
| Prod URL          | https://wurxmediahub.vercel.app                                                                       |
| Supabase dev ref  | `npznoiotslruqovorrec`                                                                                |
| Supabase prod ref | `isqepjioowzqoyhlusqo`                                                                                |
| Supabase org      | `ivvtjbvjviwqotlwrqeh` ("Wurx Media")                                                                 |
| Commit identity   | `Rashid Nazeer <286085480+RashidNazeer@users.noreply.github.com>`                                     |

**Do not change the commit identity.** Rashid's personal email maps to a
different GitHub account (`TSRashid`), and Vercel's Hobby plan refuses to build
when it cannot match the commit author. Every deploy came back `BLOCKED` until
this was fixed.

## 2. Credentials

Secrets live **outside the repo** at `C:\Users\RA_shid\.wurx\cli-secrets.env`:

```
GITHUB_USERNAME, GH_TOKEN, VERCEL_TOKEN, VERCEL_TEAM_SLUG (blank),
SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD_DEV, SUPABASE_DB_PASSWORD_PROD,
SUPABASE_PROJECT_REF_DEV, SUPABASE_PROJECT_REF_PROD
```

**Never run `gh auth login`, `vercel login` or `supabase login.`** Rashid has a
separate project signed in on all three and it must not be disturbed. Every
command carries its own token instead.

Load them with this helper (recreate it in the session scratchpad if missing):

```powershell
# wurx-env.ps1
Get-Content "C:\Users\RA_shid\.wurx\cli-secrets.env" | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $v = $matches[2].Trim().Trim('"').Trim("'")
    if ($v) { Set-Item -Path "env:$($matches[1])" -Value $v }
  }
}
$env:GH_CONFIG_DIR = "<scratchpad>\ghconfig"   # keeps gh away from Rashid's real config
if ($env:Path -notlike "*scoop\shims*") { $env:Path = "$env:USERPROFILE\scoop\shims;" + $env:Path }
```

Then `. <path>\wurx-env.ps1` at the start of any command that needs a token.

The **service role key** is never stored on disk. Fetch it at run time:

```powershell
$keys = supabase projects api-keys --project-ref $env:SUPABASE_PROJECT_REF_DEV --output json |
        ConvertFrom-Json
foreach ($k in $keys) { if ($k.name -eq 'service_role' -and $k.type -eq 'legacy') {
  $env:SUPABASE_SERVICE_KEY = $k.api_key } }
```

`.env.local` (gitignored) holds the dev URL and the **publishable** key
(`sb_publishable_...`, not the legacy `eyJ...` anon JWT).

## 3. Commands

```bash
pnpm dev                 # local dev server
pnpm build               # token guard + typecheck + build. Must pass before commit
pnpm lint                # oxlint
pnpm preview             # serve dist on :4173, needed by every browser suite
```

**Run everything with one command**, and prefer this over picking suites by
hand:

```bash
pnpm verify:all [url]              # every suite below, in sequence, one summary
pnpm verify:all [url] --only=contests,live
pnpm verify:all [url] --skip=session
pnpm measure:nav [url]             # click to URL change, and click to painted,
                                   # cold and warm. ALWAYS against the LIVE url:
                                   # localhost has no latency, so "cold" is not
                                   # cold and the number flatters.
```

It checks its preconditions FIRST and names anything missing in a sentence (no
server, no service key, no demo creator) rather than letting eleven suites fail
for one reason. It makes ONE throwaway admin for the whole run and removes it in
a `finally`, so Rashid's account is never used. One suite at a time, because two
Chromiums at once put this machine into its page file. A failing suite's output
is printed in full so nothing has to be re-run to find out why.

**A SKIP exits non-zero, the same as a failure.** Something that could not be
checked must never read as safety.

**Re-run a failing FULL run before believing it.** On 2026-08-16 one reported
contests and responsive broken, every admin screen failing "content rendered",
and the screens were fine: loaded by hand at two widths and through the suite's
own storage-state path. Responsive then passed alone. The failing run took
**1313s against 721s** for the green one, because each failing check burns
twelve seconds waiting. That ratio is the tell: a wall-clock time far above
normal means suspect the machine before the code.

Why it exists: there were eleven suites and no way to run them all, so they were
run from memory and two were quietly red for days. `verify:responsive` since the
12 August wipe (a missing seeded account) and `verify:browser` since the surface
retune on 10 August (three hardcoded colours that tokens.css had moved past).
Both were found within a minute of `verify:all` existing.

Individual suites. All need a preview or live URL; most also need
`SUPABASE_SERVICE_KEY`:

```bash
pnpm verify:browser [url]   # landing page: console, both themes, responsive
pnpm verify:rls             # attacks the database as a real user
pnpm verify:session [url]   # section 11: refresh, two tabs, reopen, form survival
                            # 11 sections now. Section 9 is the identity
                            # swap: it makes a SECOND throwaway account, signs
                            # in as it in another tab, and asserts the banner
                            # names them rather than saying you were signed
                            # out. Both accounts are deleted at the end.
pnpm verify:apply  [url]    # sign up to stored application, end to end
pnpm verify:review [url]    # admin review pipeline + attacks. Needs ADMIN_EMAIL
                            # and ADMIN_PASSWORD too
pnpm verify:brands [url]    # brands and offers, end to end plus attacks.
                            # Needs ADMIN_EMAIL and ADMIN_PASSWORD too
pnpm verify:offer-requests [url]  # creators asking for offers, staff deciding,
                            # and nine attacks. Needs ADMIN_EMAIL/ADMIN_PASSWORD
pnpm verify:content [url]   # a creator posts a video, the team decides, and
                            # approving the last one finishes the job. Nine
                            # attacks. Needs SUPABASE_SERVICE_KEY
pnpm verify:live [url]      # admin moves a stage on the REAL admin screen,
                            # creator sees it on all three of their screens
                            # with no reload. Needs SUPABASE_SERVICE_KEY
pnpm verify:brand-numbers   # 17 checks, no browser. Signs in as a REAL creator
                            # and proves a Brand Hub shows that brand's money
                            # and no other. Also proves no OLD OVERLOAD of the
                            # RPCs survived: an unknown brand must return
                            # nothing. Needs SUPABASE_SERVICE_KEY
pnpm verify:numbers [n|date] # asks TikTok the same question the nightly sync
                            # asks and diffs it against tiktok_video_daily row
                            # by row. A penny of drift fails. Default 5 days,
                            # or pass a count or a single YYYY-MM-DD.
                            # Needs SUPABASE_SERVICE_KEY
pnpm verify:offers          # 26 checks, no browser. Attacks the offer audience
                            # rules as a REAL signed-in creator: a retainer they
                            # are not on must be unreadable AND unapplyable.
                            # Needs SUPABASE_SERVICE_KEY
pnpm verify:contests [url]  # 141 checks. Admin builds a contest and a
                            # deliverable on the real screens, a creator enters
                            # and claims on theirs, staff confirm it, the reward
                            # appears as owed, gets paid, and the creator sees
                            # it. Sixteen attacks. Needs SUPABASE_SERVICE_KEY.
                            # Makes its own accounts and removes them.
pnpm verify:responsive [url] # every screen at 375, 768, 1024 and 1440px.
                            # Needs ADMIN_EMAIL and ADMIN_PASSWORD, no service key
pnpm verify:chrome [url]    # the SHELL, not the screens: rail width, the hidden
                            # scrollbar, the menu keeping its scroll position
                            # when you click the last item, the mark collapsing
                            # the rail, the top bar naming the section and
                            # agreeing with the lit menu row, the content
                            # filling the width at 1280/1600/1920, and the
                            # text-size setting sticking across a reload without
                            # leaking onto the public page.
                            # Needs ADMIN_EMAIL and ADMIN_PASSWORD, no service key
pnpm shots [url] [path]     # retina screenshots of a PUBLIC page
pnpm shots:creator [url]    # the creator home WITH a full pipeline in it, both
                            # themes, four widths. Builds a throwaway creator
                            # and removes it again. Needs SUPABASE_SERVICE_KEY
node scripts/shots-collabs.mjs [url] [path]
                            # Paid Collabs (vendored WurxBase) in both themes at
                            # 1440/1024/768/390, plus the header on its own and
                            # the creators tab. Seeds THEIR session as a viewer,
                            # so a run cannot write to their database. Also
                            # reports page overflow and console errors.
                            # Needs ADMIN_EMAIL and ADMIN_PASSWORD
node scripts/check-admin.mjs <url> <email> <password> [role] [path]
node scripts/create-admin.mjs <email> <password> [role]
node scripts/wipe-clean-slate.mjs --yes        # DEV ONLY, IRREVERSIBLE.
                            # Every creator and applicant account, every offer,
                            # every contest. Keeps brands, staff, the audit log
                            # and tiktok_video_daily. Writes the handle-to-video
                            # mapping to a file first, because embed_id is the
                            # only link between a person and their TikTok money
                            # and it cascades away. Follow with reconcile-budgets.
node scripts/seed-creators.mjs [--clean]       # DEV ONLY
                            # Wurx's 41 real handles as approved creators, via
                            # the real review_application() path. Password for
                            # all of them is 1234567890, email is
                            # <handle>@wurxmedia.com. --clean removes only those
                            # 41, and only if they are creators or applicants,
                            # so it can never take Rashid's own account on the
                            # same domain.
node scripts/seed-penetrex-offers.mjs [--clean]
                            # DEV ONLY. Penetrex's August 2026 retainer from
                            # Rashid's sheet: 31 offers, 41 approved requests,
                            # $22,250 across 393 videos, each request walked to
                            # the stage the sheet says. Needs seed-creators to
                            # have run. Both paths recompute the brand's
                            # committed budget, which has no cascade of its own.
node scripts/seed-august-content.mjs [--clean] [--submitted-only]
                            # DEV ONLY. The 79 videos in the AUGUST-labelled
                            # blocks of the 20 per-creator content sheets, with
                            # their ad codes, submitted as the creator and
                            # approved as the admin, filed on the day each went
                            # up. Passes TikTok's item id as embed_id, which is
                            # what attaches real ad money. Needs the offers seed
                            # to have run first.
node scripts/check-brand-binding.mjs [brand]
                            # READ ONLY, and safe against prod. Proves one
                            # brand owns its offers, requests, videos, TikTok
                            # store and ad figures, and that nothing leaks to
                            # another brand. Run it whenever a second brand
                            # gets a store mapped.
node scripts/seed-penetrex-contest.mjs [--clean]
                            # DEV ONLY. One Penetrex contest with five entrants
                            # in five deliberate states, so the contest video
                            # queue has something in it. Walks the real
                            # functions, never writes a contest table directly.

pnpm verify:leaderboard      # 34 checks, mostly attacks. The board is the only
                            # place one creator sees another`s figures, so most
                            # of that suite is about what it must NOT hand over.

node scripts/tidy-dev.mjs [--yes] [--skip-money] [--brands "A,B"]
                            # DEV ONLY. Removes what is on dev but is not the
                            # product: test accounts (@wurxmediahub.test), test
                            # brands, and ad-money rows for videos nobody owns
                            # any more. DRY RUN unless --yes. It counts a
                            # brand's offers, jobs, videos and contests before
                            # touching it and REFUSES any that is not empty,
                            # because everything referencing brands cascades.
                            # It never touches audit_log or tiktok_sync_runs.

node scripts/sync-avatars.mjs [--refresh]
                            # DEV ONLY. Fetches each creator's TikTok profile
                            # picture ONCE into the private creator-avatars
                            # bucket, 25 at a time, and never retries somebody
                            # already tried. --refresh does everybody again.
                            # The ONLY thing that talks to unavatar.io, and it
                            # runs on Supabase's servers, not in a browser.
node scripts/seed-applications.mjs [--clean]   # demo queue data, DEV ONLY
node scripts/seed-brands.mjs [--clean]         # demo brands and offers, DEV ONLY
node scripts/seed-pipeline.mjs [--clean]       # videos against the approved jobs,
                                               # in five states, so every progress
                                               # bar has something to draw. Approves
                                               # through the REAL review_content.
                                               # DEV ONLY. Needs SUPABASE_SERVICE_KEY
node scripts/reconcile-budgets.mjs [--dry-run] # put brand budgets back in step
                                               # with their approved requests
```

Every suite creates real accounts and **deletes them afterwards**. Run against
dev only.

**A redesign re-runs every suite that asserts COPY, not just the suites for the
screens that were obviously touched.** The creator UI rebuild re-ran the content
and responsive suites but not `verify:offer-requests`, which asserts creator
copy from inside an admin flow. Two of its checks had been failing silently for
a day, on strings the redesign had deleted. If a step changes wording anywhere,
grep the `scripts/` folder for that wording before calling it done.

**Run them detached, never in the foreground.** Rashid's machine has 7.4 GB of
RAM and VS Code alone holds well over a gigabyte of it. A suite launching
Chromium on top of that pushed the machine into its page file far enough that
Windows killed the VS Code extension host mid-run ("the host unexpectedly
terminated"), which looks exactly like Claude hanging and cannot be stopped,
because there is nothing left running to stop. It also strands the test
accounts, since the cleanup step never gets to run.

```powershell
Start-Process -FilePath "node" -ArgumentList "scripts/check-brands.mjs","http://localhost:4173" `
  -WorkingDirectory "d:\Milestone\WurxMediaHub" `
  -RedirectStandardOutput "<scratchpad>\suite.log" `
  -RedirectStandardError "<scratchpad>\suite.log.err" -WindowStyle Hidden
```

Then poll the log. **Failures go to stderr**, so read the `.err` file too; a
green-looking stdout with missing PASS lines means the failures are in the
other file.

**Use a fresh log filename per run, and read with `grep -a`.** Re-running a
suite onto the same redirect target while the previous run's handle is still
open leaves the file NULL PADDED: the failure line is silently replaced with
zero bytes and only the summary survives, so the suite reports "1 check FAILED"
and the file cannot say which. `grep` also treats a file containing nulls as
binary and stops counting, which makes a full run look half finished.

**Never put `2>&1` after the `node` call inside a runner script.** PowerShell
5.1 wraps each stderr line from a native exe in an ErrorRecord, which then does
not reach `-RedirectStandardOutput` at all. The result is a log that ends
mid-suite with no failures in it and no error either, which reads exactly like
a passing run that stopped early. Redirect the two streams separately and read
both.

All suites launch Chromium through `scripts/browser.mjs`, which strips the GPU
process, extensions and background networking and caps the renderer heap. Add
new suites through it, not through `chromium.launch()` directly.

Shut the preview server down when finished. Orphaned `vite preview` processes
hold port 4173 and accumulate one per interrupted session.

The suites that need `ADMIN_EMAIL` and `ADMIN_PASSWORD` should NOT be pointed at
Rashid's account. Make a throwaway one for the run, then remove it:

```powershell
node scripts/create-admin.mjs suite-runner@wurxmediahub.test "<a password>" admin
# ... run the suite ...
# then delete the auth user and its audit rows with the service key
```

### Looking at an admin screen without a password

```bash
pnpm shots:admin /admin/offers              # both themes, 375 / 768 / 1024 / 1440
SHOT_CLICK='button[aria-controls^="offer-details"]' pnpm shots:admin /admin/offers
```

Every other browser suite wants `ADMIN_EMAIL` and `ADMIN_PASSWORD`. This one
makes a throwaway admin with the service key, signs in through the real login
form, and deletes it in a `finally`. It also reports horizontal page scroll at
each width and any console error, which is how "it works on a phone" gets
proved rather than asserted. Needs a server: `pnpm build` then `pnpm preview`.

`SHOT_CLICK` takes a second set of shots with something open. Half of a screen
carrying an accordion or a drawer is invisible in a shot of its resting state,
and that is usually the half being reviewed.

## 4. Database changes

```powershell
supabase migration new <name>
# edit supabase/migrations/<stamp>_<name>.sql
$env:SUPABASE_DB_PASSWORD = $env:SUPABASE_DB_PASSWORD_DEV
supabase db push
```

Never edit a migration that has already been applied. Add a new one.

**Every new table needs explicit grants.** "Automatically expose new tables" is
OFF on both projects, which also disables Supabase's default grants to
`service_role`, not just `anon` and `authenticated`. Forget it and Edge
Functions silently read nothing:

```sql
alter table public.x enable row level security;
grant select on public.x to authenticated;              -- plus column-scoped grants
grant all privileges on table public.x to service_role;
```

**Column-level SELECT grants cannot hide anything from a creator**, because
staff and creators are both the `authenticated` role. Anything creators must
never see goes in its OWN table with its own policy. That is why the brand
budget lives in `brand_commercials` and not in `brands`.

**Every VIEW needs `with (security_invoker = true)` and its own grants.** A
Postgres view runs as its OWNER by default, which bypasses row level security on
everything underneath it. A view over a creator-facing table without that word
hands every creator every other creator's rows, and no policy will stop it:

```sql
create view public.x with (security_invoker = true) as select ...;
grant select on public.x to authenticated;
grant all privileges on table public.x to service_role;   -- auto-expose is off
```

And a rule that no `security_invoker` can enforce: only build a view whose
grouping key belongs to exactly ONE person. A creator counting rows they cannot
all see gets a plausible small number back rather than an error, so
`job_progress` is safe (one job, one creator) while a per-offer headcount over
the same tables would silently render "12 creators" as "1".

## 4c. Storage

One bucket, `brand-assets`: brand logos and product images. Public read,
staff-only write, 2 MB, `image/png`, `image/jpeg`, `image/webp`. Created and
policed by `supabase/migrations/*_brand_assets_storage.sql`, not by hand in the
dashboard, so prod gets it from the same migration.

SVG is deliberately not allowed: it can carry script.

## 4b. Edge Functions

```powershell
supabase functions deploy <name> --project-ref $env:SUPABASE_PROJECT_REF_DEV
```

Docker is **not** required; the CLI uploads the source and bundles server side.
It prints a Docker warning anyway, which is harmless.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically. Never add them as secrets by hand.

Two things that have already cost time:

- **CORS must echo the requested headers.** Our Supabase client sends a custom
  `x-application-name` header on every request. A hand-written allow-list did
  not include it, so the browser's preflight failed, the function was never
  reached, and clicking Approve silently did nothing. Use
  `supabase/functions/_shared/cors.ts`.
- **Every response needs the CORS headers, including errors.** A 403 without
  them arrives in the browser as an opaque network failure.
- A freshly deployed function is cold and its first call can take several
  seconds while Deno pulls its npm dependencies. Tests must wait for the
  outcome, not sleep for a guessed number of milliseconds.

## 5. Deploying

Push to `dev`. Vercel builds automatically, roughly 25 seconds. Each project has
an Ignored Build Step so it only builds its own branch.

`wurxmediahubdev.vercel.app` is pinned to the `dev` branch through the domains
API, because Vercel's public API does not expose the "Production Branch"
setting. Vercel's dashboard therefore labels those builds "Preview". That is
expected.

Watch a deploy:

```powershell
$h = @{ Authorization = "Bearer $env:VERCEL_TOKEN" }
Invoke-RestMethod -Headers $h -Uri "https://api.vercel.com/v6/deployments?app=wurxmediahubdev&teamId=team_OL5SlbHFgyYvmXYyScEUmDo0&limit=1"
```

## 6. Accounts

| Account                | Role      | Notes                                                                                                                                   |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `rashid@wurxmedia.com` | admin     | Dev only. Created 2026-07-29 via `scripts/create-admin.mjs`. **The password is not stored anywhere, by design.** It is Rashid's to type |
| `*@wurxmediahub.demo`  | applicant | Seven demo applications on dev, password `demo-password-for-dev-only-1`. Remove with `node scripts/seed-applications.mjs --clean`       |

Test suites create `@wurxmediahub.test` accounts and delete them again. If a run
is interrupted, check for leftovers with that suffix.

Staff accounts are **never** created through the website. Public sign up always
produces an `applicant`, and nobody can change their own role. Prod will need
its own admin account created the same way.

**Staff sign in is `/admin/login`**, a separate screen with no sign up link.
Creators use `/login`. Signed-out visits to any `/admin` route are sent to the
staff door. It is a different screen, not a different lock: signing in there
grants nothing extra, and permission is still decided by row level security and
the Edge Function. Never treat the URL as a security boundary.

## 7. Windows and PowerShell quirks that have already cost time

- `&&` does not work in Windows PowerShell 5.1. Use `;` or separate calls.
- `??` and ternaries do not exist. Use `if/else`.
- Passing an **empty string** to a native exe fails. Write the file directly
  instead (this is why the git credential helper is set by editing
  `.git/config`).
- Double quotes inside a native command argument get mangled. Write commit
  messages to a file and use `git commit -F <file>`.
- `Set-Content -Encoding utf8` writes a **byte order mark**. The Supabase CLI
  refuses to parse `.env.local` if it has one. Use
  `[System.IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))`.
- Never use PowerShell string replace on source files: it corrupts UTF-8
  (em dashes became `â€"`). Use the Edit tool.
- `System.Drawing` cannot save over a file it has open. Save to temp, then copy.
- Wildcard `Remove-Item` is sometimes blocked by the sandbox. Delete by explicit
  path.

## 8. House style

- **No em dashes or en dashes in the APP.** Standing instruction from Rashid.
  It covers everything a person using the product can read: components, copy,
  microcopy, labels, empty and error states, emails, seed and mock data. It does
  **not** cover `docs/` or the memory files, which he confirmed on 2026-08-24:
  *"i told you not to use em dashes in our app u are not restricted to use em
  dashes in those docs becuase it is u who need to understand"*. Those exist for
  the agent to read, so write them however reads clearest. **Do not sweep them.**
- Every colour is a `var(--wx-*)` token; the build fails if dark and light drift
  apart or if contrast drops below WCAG AA.
- Use `m.div` from Motion, never `motion.div`. `LazyMotion` runs in strict mode
  and the heavy build will throw.
- `select('*')` is banned. Name the columns.
- The public landing page must not pull in the Supabase client. It is imported
  dynamically in `AuthProvider`, and `manualChunks` keeps Supabase and TanStack
  Query in separate chunks.

## TikTok ads (added 2026-08-17)

App "Wurx Ads Reporting", App ID `7674829988993957908`, approved. One app for
both environments; only the redirect URI differs. Secrets live as Supabase
function secrets on each project, never in the repo:
`TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_REDIRECT_URI`.

Dev callback `https://wurxmediahubdev.vercel.app/oauth/tiktok/callback`,
prod `https://wurxmediahub.vercel.app/oauth/tiktok/callback`. **Prod has none of
these secrets set yet**, deliberately: prod is frozen.

```bash
pnpm verify:tiktok       # 37 checks, no browser, needs SUPABASE_SERVICE_KEY
supabase functions deploy tiktok-connect tiktok-callback
```

**The region trap, which costs an afternoon if you meet it cold.** Supabase runs
an edge function in the region nearest the caller. From Pakistan that is Mumbai,
`ap-south-1`, and TikTok blocks every Indian IP because India banned TikTok in
2020. The reply is `code -1 "Client IP address is in banned Country list."`,
which reads exactly like a bad app secret. Every call goes through
`src/lib/tiktok.ts`, which pins `x-region: ap-northeast-1`; the functions also
check their own region and refuse before calling out. Verified working:
ap-northeast-1, ap-southeast-1, eu-west-2, us-east-1.

**GMV Max reporting is v2.0, not v1.3.** At v1.3 the report path exists and
fails with a useless "ERROR Message." and the video endpoint 404s. Built and
syncing since 2026-08-18; noted here so the next person does not lose the day
to it.

### What the TikTok API will and will not give us

Probed 2026-08-18, re-probed in full 2026-08-21 against the live Penetrex
account. Nothing here is read from a doc: the docs and the grant disagree, and
the only honest source is what the account answers.

```bash
pnpm probe:tiktok              # every candidate endpoint, with TikTok's own verdict
pnpm probe:tiktok --metrics    # one metric per request, the only way to get a full list
pnpm probe:tiktok --reconcile  # add every video up and compare it with the store
```

It creates a throwaway admin in dev to authenticate with and deletes it again,
so it needs `SUPABASE_SERVICE_KEY`. It cannot write to TikTok: it goes through
the `raw.probe` action, which is GET only, `/open_api/` only, TikTok's host
only.

**READ THE REFUSAL. There are two of them and they mean opposite things.**

| TikTok's words | what it means | who can fix it |
| --- | --- | --- |
| `advertiser does not grant you /x/:GET permission` | the ASSET was never granted to this app at authorisation | TikTok, on application, or a wider grant from the advertiser |
| `Permission error: ... lacks the required scope ... reauthorize your API App` | OUR APP does not carry that scope at all | us, in the TikTok app settings, then Rashid re-authorises |

The second one is the cheap one and it is easy to misread as the first.

**Granted today, and answering.**

| endpoint | gives |
| --- | --- |
| `/gmv_max/video_list/report/get/` (v2.0) | per video: cost, gross_revenue, orders, roi, cost_per_order |
| `/gmv_max/report/get/` (v2.0) | the STORE: the same plus `net_cost`, by day, by hour, by product |
| `/gmv_max/store/list/` | the stores under an ad account, and `store_authorized_bc_id` |
| `/gmv_max/identity/get/` | the shop's own TikTok identity, name and avatar |
| `/gmv_max/store/shop_ad_usage_check/` | whether custom shop ads are running |
| `/gmv_max/video/get/` | videos eligible for custom shop ads (empty on this shop) |
| `/advertiser/info/`, `/oauth2/advertiser/get/` | the ad accounts, their currency and timezone |

**The metric list is complete and it is short.** Asked one metric per request on
2026-08-21, because the report names only the FIRST metric it dislikes and a
long list therefore proves nothing:

- store level: `cost`, `net_cost`, `gross_revenue`, `orders`, `roi`,
  `cost_per_order`, and `currency` arrives whether asked for or not.
- video level: the same **minus `net_cost`**.

Everything else is refused by name: impressions, clicks, ctr, cpc, cpm,
video_views, conversion, conversion_rate, buyers, unit_sales, refund,
gross_revenue_roi, net_cost_roi, live_gmv, product_gmv, organic_gmv, total_gmv,
gmv. **There are no view or engagement figures anywhere in GMV Max reporting.**

**Dimensions.** The store report takes `stat_time_day`, `stat_time_hour` and
`spu_id`, and refuses `item_id`, `campaign_id` and `order_source`. The
video report takes `item_id` and ONLY `item_id`: it refuses `stat_time_day`
as a second dimension, which is why the sync asks day by day rather than once
per range. `/gmv_max/live_list/report/get/` and
`/gmv_max/product_list/report/get/` do not exist, at either version.

**Spend per product is a dead end**, though GMV per product is fine: every penny
of cost lands in the `spu_id = -1` bucket.

**The video report carries ORGANIC sales, and this is the important one.** On
2026-08-15 the store had 9,430 videos with a row, and NINE of them earned money
with no ad spend at all, \$216.92 of it. So `gross_revenue` on a video is what
that video sold, not what its ads sold, and a creator sees their GMV whether or
not the brand ever ran an ad on the video. We already store it: `cost` is
simply 0 on those rows.

**The store total is bigger than its videos, and always will be.** Same day:

```
store report          cost 1492.25   gmv 2349.04   orders 125
sum of 9,430 videos   cost 1380.72   gmv 2121.52   orders 112
```

The \$227.52 gap is LIVE and product-card selling, which has no `item_id` to
hang off. **Never present a store figure as the sum of the creators' videos**,
and never derive one from the other.

**Not granted, and each would need TikTok to widen the authorisation:**
`/gmv_max/campaign/get/`, `/campaign/gmv_max/info/` (so daily budget, target
ROAS and optimisation mode are unavailable), `/gmv_max/exclusive_authorization/get/`,
`/identity/get/`, `/bc/get/`, `/bc/asset/get/`, `/advertiser/balance/get/`.

**Missing a SCOPE rather than a grant, which is ours to add:**
`/report/integrated/get/` and `/campaign/get/`. The integrated report is the
ordinary Ads Manager reporting API and is the only route inside this app to
impressions, clicks and video views. Adding the scope in the TikTok app settings
and having Rashid re-authorise is the whole job; no application to TikTok.

**Total shop GMV — every sale the shop makes, not just the ad-driven ones — is
not in this API at all.** It lives in the TikTok Shop Partner API, which is a
different product with its own app, its own signing and its own authorisation.
See PARKED for what it would give us and what it costs to get.


### Nothing here can delete prod, and nothing here can touch WurxBase

**Every script that deletes anything now refuses to run outside dev.** Twenty of
them create accounts, write rows and remove them again, and until 2026-08-18
seventeen trusted whatever `.env.local` happened to say. One edited env file and
a routine `pnpm verify:all` would have made throwaway admins in the live
database and deleted rows on the way out.

`scripts/lib/dev-guard.mjs` is a POSITIVE check: it must recognise the dev
project, not merely fail to recognise prod, because a typo matching neither
would otherwise sail through. Pointing `.env.local` anywhere else produces:

```
REFUSING TO RUN.
check-tiktok.mjs creates and deletes data, so it only ever runs against the DEV
project (npznoiotslruqovorrec).
```

**WurxBase's and Paid Collaborations' databases are unreachable from here.**
Every script resolves its connection from `VITE_SUPABASE_URL`, which is ours.
Their project refs (`bnevtdezskftlrjjgbsg`, `pfkpgmpicjcirnogxkac`) appear
nowhere in `scripts/`, so no suite, seed or wipe can reach a row of their data.
Deleting anything of theirs takes a human pressing a button inside their own UI.

**The two scripts that delete on purpose**, as opposed to cleaning up after
themselves, both carry their own guard as well and both name what they will
remove before doing it: `wipe-offers-contests.mjs` and `seed-penetrex.mjs
--clean`.

### The two platforms cannot reach each other's data

Rashid asked for certainty rather than a promise: deleting from WurxBase's UI
must only ever affect WurxBase's data, and the same the other way round.

**They are separate Postgres databases in separate Supabase projects.** There is
no shared table, no cross-database foreign key and no cascade that can span
them, so a DELETE on one side is *physically* incapable of reaching the other.
The only way to break that is for code on one side to hold a connection to the
other, and `pnpm verify:isolation` forbids exactly that. It runs inside
`pnpm build`, so it cannot be forgotten.

| database | project | reached by |
| --- | --- | --- |
| WurxMediaHub | `npznoiotslruqovorrec` | our code only |
| WurxBase | `bnevtdezskftlrjjgbsg` | the vendored app only |
| Paid Collaborations | `pfkpgmpicjcirnogxkac` | the vendored app only |

Verified by hand as well as by the guard:

- the vendored code names **only** its own two projects, and never imports our
  Supabase client;
- our `src/`, `scripts/` and `supabase/` name **neither** of theirs;
- **their in-app SQL console is read-only and scoped to their own project**: it
  hardcodes their URL, sends GET only, rejects
  `INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE`
  with a regex, appends `LIMIT 1000` and times out at ten seconds.

The guard was tested by breaking it in both directions and watching the build
fail, rather than by trusting a green light.

**What this does NOT protect against**, and it is worth being straight about:
their tables are still writable by anyone holding their publishable key, which
ships in both bundles. Isolation means our side cannot hurt their data; it does
not make their data safe from the open policies on their own project, and there
is no point-in-time recovery on it.

### vercel.json has a strict schema, and a comment in it kills the deployment

Two deployments failed with no build log and a duration of `?`, which is what a
CONFIG VALIDATION failure looks like: the deployment is rejected before the build
starts, so there is nothing to read. The cause was a `_comment` key I had added
inside a rewrite to explain it:

```
Invalid vercel.json - `rewrites[0]` should NOT have additional property `_comment`.
```

**Never put a comment in `vercel.json`.** It rejects unknown keys anywhere.
Explanations go here instead.

**Validate it locally rather than by deploying.** `vercel build` runs the real
pipeline including config validation:

```bash
vercel link --token $VERCEL_TOKEN --scope wurxmedia-6695s-projects --project wurxmediahubdev --yes
vercel build --token $VERCEL_TOKEN --yes      # "Build completed successfully."
```

**And check the deployment reached READY, not just that the push succeeded.**
A green `git push` says nothing about the build. `vercel ls wurxmediahubdev`
shows the state; a run with duration `?` never built at all.

The rewrite excludes `.netlify/` because WurxBase still calls
`/.netlify/functions/euka`, which does not exist here. Without the exclusion the
SPA answered it with index.html and a 200, so their code called `.json()` on
HTML and threw `Unexpected token '<'`. A real 404 lets their own handling
degrade to null. Square brackets are avoided in the pattern: `source` is parsed
with path-to-regexp, and a character class is not worth the risk.

## Screenshot scripts

`pnpm build && pnpm preview` in another shell, then:

```bash
node scripts/shots-hub.mjs      # the creator Brand Hub: 5 sections x 4 widths
                                # x 2 themes = 40 shots into shots/hub/.
                                # Signs in as a real creator with real money,
                                # writes nothing, and FAILS on a console error
                                # or any sideways page scroll.
```

Two traps it encodes, both of which have cost time here. `networkidle` never
settles on a screen holding a realtime socket, so it waits for the skeletons to
clear instead. And `[].every()` is TRUE, so waiting for "every image loaded"
passes instantly on a page whose images have not started; it checks the list is
non-empty first.

## MCP servers (added 2026-08-24)

**Google Stitch**, a UI design service that generates and edits screens from a
prompt and can carry a design system across them. Declared in `.mcp.json` at the
repo root:

```json
{
  "mcpServers": {
    "stitch": {
      "type": "http",
      "url": "https://stitch.googleapis.com/mcp",
      "headers": { "X-Goog-Api-Key": "${STITCH_API}" }
    }
  }
}
```

**`.mcp.json` is committed, so it may never contain the key itself.** Claude
Code expands `${VAR}` inside `url`, `headers`, `env`, `command` and `args` from
its own process environment, so the file carries a reference and the machine
carries the value.

**Where the value lives, and why there.** `STITCH_API` is a persistent **Windows
user environment variable**, set once with:

```powershell
[Environment]::SetEnvironmentVariable('STITCH_API', '<key>', 'User')
```

Three other homes were considered and rejected. A literal key in `.mcp.json`
would be committed. `.claude/settings.json` and a `headersHelper` are both gated
on `projects["d:/Milestone/WurxMediaHub"].hasTrustDialogAccepted` in
`~/.claude.json`, which is currently `false`, and an untrusted folder connects
the server **with no auth header at all** rather than failing loudly. Writing
the server straight into `~/.claude.json` works, but Claude Code rewrites that
file while it runs, so an edit made from inside a session can be flushed away.
`.mcp.json` is read only from Claude Code's side, which is why it wins.

The same value is also in `.env.local`, where Rashid originally put it. Nothing
in the app reads it. **Rotating the key means changing both places.**

**A restart is required.** A new value in the user environment reaches only
processes started after it was set, so VS Code has to be reopened before the
server connects. If the variable is missing, Claude Code does not fail: it sends
the literal text `${STITCH_API}` as the header and reports a missing-variable
warning in `claude mcp list`.

**Verified on 2026-08-24** by reading the URL out of `.mcp.json`, expanding the
header from the registry value rather than from the current shell, and calling
the server: `initialize` returned protocol `2024-11-05`, `tools/list` returned
15 tools. Note that `Invoke-RestMethod` **hangs** on this endpoint, because the
response advertises `text/event-stream`. Use `curl` with `--max-time`.
