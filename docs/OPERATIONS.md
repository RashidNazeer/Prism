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
pnpm verify:contests [url]  # 121 checks. Admin builds a contest and a
                            # deliverable on the real screens, a creator enters
                            # and claims on theirs, staff confirm it, the reward
                            # appears as owed, gets paid, and the creator sees
                            # it. Sixteen attacks. Needs SUPABASE_SERVICE_KEY.
                            # Makes its own accounts and removes them.
pnpm verify:responsive [url] # every screen at 375, 768, 1024 and 1440px.
                            # Needs ADMIN_EMAIL and ADMIN_PASSWORD, no service key
pnpm shots [url] [path]     # retina screenshots of a PUBLIC page
pnpm shots:creator [url]    # the creator home WITH a full pipeline in it, both
                            # themes, four widths. Builds a throwaway creator
                            # and removes it again. Needs SUPABASE_SERVICE_KEY
node scripts/check-admin.mjs <url> <email> <password> [role] [path]
node scripts/create-admin.mjs <email> <password> [role]
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

- **No em dashes or en dashes anywhere.** Standing instruction from Rashid.
- Every colour is a `var(--wx-*)` token; the build fails if dark and light drift
  apart or if contrast drops below WCAG AA.
- Use `m.div` from Motion, never `motion.div`. `LazyMotion` runs in strict mode
  and the heavy build will throw.
- `select('*')` is banned. Name the columns.
- The public landing page must not pull in the Supabase client. It is imported
  dynamically in `AuthProvider`, and `manualChunks` keeps Supabase and TanStack
  Query in separate chunks.
