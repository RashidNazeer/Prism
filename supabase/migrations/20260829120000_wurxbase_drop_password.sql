-- Drop the plaintext password column from WurxBase's user table.
--
-- WHY IT EXISTED. Their app had its own sign-in screen, and it checked what
-- you typed against this column directly. No hash, no salt: the password of
-- every member of their team, in a table, in the clear.
--
-- WHY IT CAN GO. That sign-in screen was removed on 2026-08-28. Identity comes
-- from the hub's own auth now, and a person's WurxBase role is found by
-- matching `hub_email` against the address they signed in with. Nothing has
-- read this column since. Rashid, asked directly on 2026-08-29 whether to
-- delete them: yes.
--
-- The same commit removes the five plaintext passwords that were hardcoded in
-- `App.jsx` and shipped in the browser bundle, which were the worse half of
-- the problem: a column behind RLS is reachable by staff, a string in the
-- bundle is reachable by anyone who opens devtools.
--
-- IRREVERSIBLE, AND MEANT TO BE. There is no down migration. Putting the
-- column back would not bring the passwords back, and nothing would want them
-- if it did.

alter table wurxbase.app_users
  drop column if exists password;
