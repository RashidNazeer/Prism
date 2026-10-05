# Creative angle automation: plan and change record

**Started 2026-10-06 by Umar.** Branch `feature/creative-angle-auto-categorise`,
cut from `dev` at `153f374`. Nothing here is on `dev`, deployed, or applied to
any database yet.

**This file is the record of every change made to this repository for this
work.** The change log is at the bottom; add to it in the same commit as the
change.

## What is being built

Creative angle testing (Paid Collabs → Reporting → Creative angle testing) is
filed by hand: somebody watches each video and drops it into an angle. This
makes the filing automatic.

Umar's words: *"whenever new videos or video is posted on a brand the app must
send videos and its relevant content brief to this machine and process videos in
batches of 5 and when the video link and creative angle is returned it should
automatically create (if not created yet) the angle categories like we are
creating manually and place the relevant videos (links) under the respective
category. The videos must be placed in the relevant month as well as under the
relevant brand."*

"This machine" is the video audit backend (the separate *creative project*
repository, `umar551869/Creative-Angle-Review-Agent`). It runs on Umar's PC,
reachable at a fixed public URL, and returns for each video which of the
brief's creative concepts it follows.

## Decisions Umar has made

| Date | Decision |
| --- | --- |
| 2026-10-06 | **A button and an automatic run, both.** A "Categorise new videos" button per brand, and an automatic run for brands with new videos. |
| 2026-10-06 | **A progress bar and an estimated time** on the screen while it works. |
| 2026-10-06 | A video that fits none of the brief's angles is filed under a category called **"Matched None"**. |
| 2026-10-06 | **A brand with two focus products has two briefs**, a tab each of one Google Doc. Each video is judged against both and filed under the one it follows. |
| 2026-10-06 | Videos are sent in **batches of 5**. |
| 2026-10-06 | The audit backend deletes each downloaded video as soon as its job is finished. |

## How it will work

1. The brand's brief(s) are looked up in `public.collab_brand_briefs`.
2. The brand's videos that have not been processed yet go into a queue, one row
   per video (table to be built).
3. A background worker sends 5 videos at a time to the audit backend through an
   Edge Function that holds the backend's URL and key as secrets. One batch at a
   time across all brands, because the machine runs one job at a time.
4. When a batch is done, each link is filed under its angle in the row for that
   brand and the **month the video was posted** (`Brand::YYYY-MM` in
   `wurxbase.activity_logs`, action `CREATIVE_ANGLE`), creating the angle if it
   does not exist. The month follows the same rule as `brandVideos()` in
   `src/vendor/wurxbase/angleStore.js`: the video's own date, else the creator's
   hire month.
5. The screen shows progress and an estimate, and the angle cards fill in as
   batches finish.

Rules the filing must keep:

- A video somebody already filed by hand is never moved.
- Typed ad spend, GMV and views overrides are never touched.
- The save goes through the row's `revision` check, exactly like `saveAngles`,
  so it cannot overwrite somebody editing at the same moment.
- If the machine is off, videos stay queued and the screen says so. Nothing is
  lost.

## What the audit backend returns

For a job (`POST /analyze`, then poll `GET /jobs/{id}`):

```json
{
  "status": "succeeded",
  "angles": { "<concept>": ["<video link>"], "Matched None": [] },
  "placements": [
    { "video": "<link>", "angle": "<concept>", "brief": "Lung Health" }
  ],
  "unplaced": [ { "video": "<link>", "reason": "could not download this link" } ]
}
```

Briefs are sent as `briefs: [{label, url, angles}]`, one entry per brief (two
for a two-product brand). A URL with `?tab=t.xxxx` reads that tab only. About 5
minutes per video on a first run, so a batch of 5 is roughly 25 minutes.

**Always send `angles`** (the row's `angles` column). The backend then files
videos under exactly those names. Left to read the names out of the document by
itself, its original reader got 4 of these 11 briefs wrong: a concept typed as a
bullet was dropped, a name ending in `!` was dropped, a brief with no "Creative
Concepts" heading yielded no angles, and a "Key talking points" heading was
taken for a concept. The backend has since been given a stricter reader that
gets all 11 right, and every job reports where its names came from in
`angles_from` (`given`, `document` or `notebook`). Sending the stored list is
still what makes a second spelling of a category impossible.

`POST /briefs/angles {brief_url}` returns a brief's concept names instantly,
with no model call. Use it when somebody changes a brand's brief link, to
refresh that row's `angles`.

## Build order

1. **The briefs, per brand.** Done on this branch (see the change log).
2. A queue table: one row per video, with status and the angle it was given.
3. The Edge Function that talks to the audit backend, and the worker tick
   (pattern: `euka-ads-sync`, cron → pg_net → function with a Vault secret).
4. Filing results into `wurxbase.activity_logs`.
5. The button, progress bar and estimate on the angle-testing screen. Ours goes
   in our own file under `src/routes/admin/` and hooks into the vendored
   `CreativeAngles.jsx` on one fenced line, per the vendoring rules.
6. The automatic run.
7. A `scripts/check-*.mjs` suite, and the FEATURE_MAP / OPERATIONS entries.

## Open items

- **Brand names are unverified against the database.** The rows use the names
  in Umar's sheet. Before the feature is switched on, compare them with
  `select distinct btrim(brand) from wurxbase.creators`. "Biostime Shop US" in
  particular may be plain "Biostime" on the Paid Collabs rows. The match is case
  insensitive and trimmed, but not fuzzy.
- **Eight brands have no brief yet**: Apothecary, Aqua Sonic, Aurelia, Yesday,
  Inno Supps, Irwin Naturals, Klassy Network (the sheet holds the document's
  title, not its link), Pure Daily Care. They cannot be categorised until they
  have one.
- **Dr. Harvey's has two concepts with nearly the same name** ("It's Not Just Bad
  Breath, It's Their Health" and its "Variation #2"). They are two categories
  as written. Umar to say whether they should be one.
- **Honeysticks and Swisse have a second tab that is not a brief** (a short note,
  and an empty tab). Only the first tab is used.
- **Nothing has been applied or deployed.** This machine has no dev credentials
  for the project (no `.env.local`, no CLI secrets file), so the migration has
  not been pushed and no suite has been run.
- **Committed and pushed to the feature branch only** (2026-10-06), as
  `RashidNazeer <wurxmedia@gmail.com>` on Umar's instruction. That is not the
  identity OPERATIONS fixes for this repository
  (`Rashid Nazeer <286085480+RashidNazeer@users.noreply.github.com>`); Rashid
  to say if the branch should be re-authored before it merges. Not merged into
  `dev`.

## Change log

### 2026-10-06, the briefs

- **Added `supabase/migrations/20261006090000_collab_brand_briefs.sql`.**
  Creates `public.collab_brand_briefs`: one row per brief, keyed by brand name
  (like `collab_brand_photos`), with `product`, `position`, `brief_url` (a
  Google Doc, the tab in the URL), `angles` (the brief's concept names, in
  order), `is_active`, and timestamps. A unique index on brand + product, case
  insensitive. RLS on; `select` for `is_collabs_viewer()`; no write policy;
  explicit grants to `authenticated` (select) and `service_role` (all).
- **The same migration inserts 11 briefs for 10 brands**, taken from Umar's
  sheet on 2026-10-06. Every document was fetched and its "Creative Concepts"
  list read from the text; nothing was typed by hand. `on conflict do nothing`.
  The names are stored as category titles: the quote marks a brief puts round a
  concept are removed, so `“Visual hook”(Top performing angle)` is stored as
  `Visual hook (Top performing angle)`. All 11 were checked against the live
  documents through the backend's `/briefs/angles` on 2026-10-06 and match.

  | Brand | Product | Angles |
  | --- | --- | --- |
  | Bentgo | | 3 |
  | Biostime Shop US | | 2 |
  | Dr Tobias | Colon 14 Day Cleanse | 4 |
  | Dr Tobias | Lung Health | 3 |
  | Dr. Harvey's | Holistix | 3 |
  | FlyWell | | 3 |
  | Honeysticks | | 2 |
  | JoyMode | | 3 |
  | Kenashii | | 3 |
  | Penetrex | | 4 |
  | Swisse | | 2 |

- **Added this file**, and an entry in `docs/FEATURE_MAP.md`.
- No application code, no Edge Function, no vendored file and no existing
  migration was changed.
