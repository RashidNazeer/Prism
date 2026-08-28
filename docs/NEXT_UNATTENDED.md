# The unattended run, and the Monday cutover

**Rewritten 2026-08-29 00:59 after Rashid changed the target.** His words:

> *"today is friday and now team will be back on monday so for asad's database
> copy everything like new data there in our own database and from monday asd
> wll be using our hub's database so fix everything u were saying i want to
> finalize this"*

So this is no longer a dev experiment. **Asad's team moves onto our database on
Monday**, and their old app stops being the place work happens. Their project is
idle all weekend, which is what makes the window safe.

## Rules for the unattended run, because nobody is watching

- **dev only.** Never prod, never `main`. Prod is a human decision and CLAUDE.md
  says ask twice.
- **Commit to `fix/wurxbase-write-safety`**, not to `dev`. He reviews and merges.
- **No deploy.**
- **Never drive their app with a browser robot** for anything that writes —
  PARKED 33. Read the database over REST for facts.
- If a decision is needed, **stop and write it here** rather than guess.

---

## THE THING THAT BLOCKS MONDAY, and it is not a bug

**Their eight people have no way into our hub.** Their login screen was removed
on 2026-08-28; identity now comes from our own auth. Nobody on their team has a
WurxMediaHub account, so on Monday morning they cannot get in at all.

**And the role mapping as written would over-promote most of them.**
`src/lib/wurxbase-identity.ts` derives their role from OURS — our `admin`
becomes their `superadmin`, our `ops` becomes their `admin`. But their team is
not two roles, it is five, with 25 personal overrides Asad has tuned:

| person | their role | overrides |
| --- | --- | --- |
| Asad | superadmin | — |
| Usman | admin | 5 |
| Farkhan Saleem | ipc | 4 |
| khushi | ipc | 5 |
| masifa | ipc | 6 |
| Shumyle Asim | ipc | 3 |
| Fahad | viewer | 1 |
| Lead | viewer | 1 |

Handing a `viewer` our `ops` role makes them their `admin` — full edit on deals
and money. Rashid on exactly this: *"i dont want any leak"*.

**THE FIX: stop deriving, start looking up.** A person's WurxBase role and
`custom_perms` should come from their own `app_users` row, which Asad already
maintains, not from our role. Our role decides only whether they may reach
`/admin/collabs` at all.

`wurxbase.app_users` has no email column, so there is nothing to match on yet.
**Build it in the unattended run:**

1. A migration adding `wurxbase.app_users.hub_email text unique` — nullable, so
   nothing breaks while it is empty.
2. `wurxbaseSession()` looks the person up by their signed-in email. Found →
   use that row's `role` and `custom_perms` verbatim. Not found → fall back to
   the current derived mapping, so nothing regresses.
3. `wurxbaseTabsFor()` reads the same row, so the sidebar matches what they can
   actually open.

**What Rashid and Asad must supply** (do not guess these):
- the eight email addresses, one per `app_users.id`
- confirmation that each person gets a WurxMediaHub account, and at what role —
  `ops` is almost certainly right for everyone except Asad

## The rest of the Monday checklist — NOT for the unattended run

- **Prod migration.** `wurxbase` does not exist on prod and prod's code still
  points at their old project, so prod works the old way today. The cutover is:
  both migrations, expose the schema in the project API settings (not in git,
  see OPERATIONS), `wurxbase:copy --i-mean-prod`, move the three sequences,
  `verify:wurxbase`. **Needs his word.**
- **Somebody has to tell the team to stop opening the old app.** If both are
  live on Monday the data splits again, and this time nobody is watching for it.
- **`wurxbase.app_users.password`** — eight plaintext passwords, read by nothing
  since their login went. Offered; he has not answered. Dropping a column is not
  an unattended act.

---

## The job, in order

### 1. Refresh the data copy

Their project is idle over the weekend, so a copy taken now is still current on
Monday. Ours is a snapshot from 2026-08-28 and has already drifted — 2,376 rows
in their `activity_logs` against the 2,348 we took.

```bash
SUPABASE_SERVICE_KEY=... node scripts/wurxbase-copy-data.mjs
```

It empties each table before filling it, so **anything created in our dev copy
since the migration is destroyed** — the self-healed `app_settings` row and the
arrival rows we wrote. That is correct here: theirs is the real data. Move the
three identity sequences afterwards; the script prints the statements.

### 2. Re-read the fix design before building it

**PARKED 34** and `docs/WURXBASE_WRITE_SAFETY.md` hold the audit: 27 findings,
each having survived three agents told to refute it.

**THE GROUND MOVED AND THE DESIGN HAS NOT CAUGHT UP.** Every option in that
document was written under "no DDL access on that project". We own the schema
now, so:

- A **unique index on `(action, target)`** for the rows riding in
  `activity_logs` — `CREATIVE_ANGLE`, `BRAND_CONTRACT`, `DISCOVERY_MARK` — turns
  each save into an upsert. The overwrite bug stops being unlikely and becomes
  **impossible**, for all three features, in one migration.
- The **delete-before-insert** pairs collapse into a single upsert, so a failed
  save can no longer destroy the old row.
- Their code must move to upsert **in the same commit as the index**, or every
  save breaks the day it lands.

Write down what changed about the decision before implementing it.

### 3. Fix them, in this order

1. **Angle tests** — the one Rashid asked about by name.
2. **Brand contracts** — same shape, plus delete-before-insert.
3. **Discovery marks** — delete-before-insert with no rollback.
4. **God Mode brand delete**, which counts approved creators and deletes pending
   applications the dialog never mentions.
5. **Access Control**: "Undo my changes" writes `{}` over every override that
   person ever had.
6. **The settings save with no load guard**, which can write an empty brand
   order over the team's.

### 4. Prove it, then commit

`pnpm build` must pass, and re-run `verify:collab-contrast`, `verify:wurxbase`,
`verify:wurxbase-signin`, `verify:collab-ads`, `verify:collab-ads-ui`.

**Write a check that proves the bug is gone**, not that the code compiles: an
empty save must not destroy a stored test. The failure this is about is silent,
so a check that only proves it builds is worth nothing. Against dev, on rows
this check creates itself.
