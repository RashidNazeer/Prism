-- ===========================================================================
-- Link a WurxBase person to the account they sign in with.
--
-- Their login was removed on 2026-08-28: identity comes from our own auth now,
-- and `src/lib/wurxbase-identity.ts` DERIVES a WurxBase role from ours — our
-- admin becomes their superadmin, our ops becomes their admin.
--
-- THAT IS FINE FOR RASHID AND WRONG FOR EVERYBODY ELSE. Their team is not two
-- roles, it is five, with twenty-five personal overrides Asad has tuned:
--
--   Asad            superadmin
--   Usman           admin      + 5 overrides
--   Farkhan Saleem  ipc        + 4
--   khushi          ipc        + 5
--   masifa          ipc        + 6
--   Shumyle Asim    ipc        + 3
--   Fahad           viewer     + 1
--   Lead            viewer     + 1
--
-- Every one of them needs a WurxMediaHub account to get in at all from Monday,
-- and every one of them would arrive through our `ops` role — landing as their
-- `admin`, with full edit on deals and money. Fahad and Lead are VIEWERS.
-- Rashid, asked about exactly this: "i dont want any leak".
--
-- So stop deriving and start looking up. This column is the join: the email a
-- person signs in to WurxMediaHub with, against the WurxBase row Asad already
-- maintains. Found, and they get their own role and their own overrides.
-- Not found, and the derived mapping still applies, so nothing regresses while
-- the addresses are being filled in.
--
-- NULLABLE ON PURPOSE. It ships empty. The eight addresses are for Rashid and
-- Asad to supply — guessing which human owns which of eight first names is
-- precisely the kind of assumption that hands somebody else's permissions to
-- the wrong person.
-- ===========================================================================

alter table wurxbase.app_users
  add column if not exists hub_email text;

comment on column wurxbase.app_users.hub_email is
  'The WurxMediaHub account this WurxBase person signs in with. The join that '
  'lets a person keep the role and custom_perms Asad set for them instead of '
  'inheriting one derived from their role in our own app. Empty until Rashid '
  'and Asad supply the addresses.';

-- Case-insensitively unique: two rows claiming one mailbox would make "who is
-- this person" ambiguous, and the answer decides what they can see.
create unique index if not exists app_users_hub_email_unique
  on wurxbase.app_users (lower(hub_email))
  where hub_email is not null;
