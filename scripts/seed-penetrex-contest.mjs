#!/usr/bin/env node
/**
 * DEV ONLY. One Penetrex contest, with real entrants and real videos filed
 * against it, so the contest video queue has something in it.
 *
 * WHY IT EXISTS. Rashid wiped dev on 2026-08-19 and contests went with it. Step
 * B of the flow work makes contest videos reviewable for the first time — the
 * review function had existed since 2026-08-13 with no caller — and a review
 * queue with nothing in it proves nothing.
 *
 * IT WALKS THE REAL FUNCTIONS, one step at a time, exactly as
 * `seed-penetrex-offers.mjs` does: save_contest, save_contest_commercials,
 * save_contest_deliverable, apply_for_contest, review_contest_entry,
 * submit_contest_progress. Nothing is written to a contest table directly. A
 * seed that sets up state by hand cannot catch a rule the product enforces, and
 * this one has to exercise the money path or it is not testing what it claims.
 *
 * WHAT IT LEAVES BEHIND, deliberately spread across every state a reviewer can
 * meet:
 *
 *   one creator with every video already approved, so the reward is OWED and he
 *     can see what that looks like before touching anything
 *   one creator one video short, so approving that video pays them on screen
 *   one creator with everything waiting, the ordinary case
 *   one creator with a video already sent back
 *   one creator whose GMV claim is pending, so the other kind of target is
 *     visible beside the video one
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... node scripts/seed-penetrex-contest.mjs
 *   ... --clean     removes the contest this script made, and only that one
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { assertDevProject } from './lib/dev-guard.mjs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()])
);

const URL_ = env.VITE_SUPABASE_URL;
assertDevProject(URL_, 'seed-penetrex-contest.mjs');
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const CLEAN = process.argv.includes('--clean');

const NAME = 'Penetrex August Push';

const say = (s) => console.log(s);
const step = (s) => console.log(`  ${s}`);

/** Every RPC, with its error read. A seed that ignores an error seeds nothing. */
async function call(fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

/* ------------------------------------------------------------------ who -- */
const { data: admins, error: adminErr } = await db
  .from('profiles')
  .select('id, email')
  // The three staff roles, in the order assert_active_staff would accept them.
  // There is no role called 'staff'; that is the collective noun, not a value.
  .in('role', ['admin', 'ops', 'creative_strategist'])
  .limit(1);
if (adminErr) throw new Error('profiles: ' + adminErr.message);
if (!admins?.length) throw new Error('no staff account on this project to act as');
const ACTOR = admins[0].id;
say(`Acting as ${admins[0].email}`);

const { data: brands, error: brandErr } = await db
  .from('brands')
  .select('id, name')
  .eq('name', 'Penetrex')
  .limit(1);
if (brandErr) throw new Error('brands: ' + brandErr.message);
if (!brands?.length) throw new Error('Penetrex is not on this project');
const BRAND = brands[0].id;

/* ---------------------------------------------------------------- clean -- */
const { data: existing } = await db
  .from('contests')
  .select('id, name')
  .eq('brand_id', BRAND)
  .eq('name', NAME);

if (CLEAN) {
  for (const c of existing ?? []) {
    // delete_contest refuses if anybody is mid-flight, which is the right
    // guard for an admin and the wrong one for a seed cleaning up after
    // itself. Cascades do the rest: entries, submissions, awards, events.
    const { error } = await db.from('contests').delete().eq('id', c.id);
    if (error) throw new Error(`could not remove "${c.name}": ${error.message}`);
    step(`removed "${c.name}"`);
  }
  say(existing?.length ? '\nCleaned.\n' : '\nNothing to clean.\n');
  process.exit(0);
}

if (existing?.length) {
  say(`\n"${NAME}" is already here. Run with --clean first to rebuild it.\n`);
  process.exit(0);
}

/* -------------------------------------------------------------- the cast -- */
const HANDLES = ['lowbacklab', 'sarahshopsss', 'neptunenavigates', 'vsternau', 'xxkissnoblissxx'];

const { data: people, error: peopleErr } = await db
  .from('profiles')
  .select('id, display_name, email')
  .eq('role', 'creator')
  .in('email', HANDLES.map((h) => `${h}@wurxmedia.com`));
if (peopleErr) throw new Error('creators: ' + peopleErr.message);
if ((people ?? []).length < 5) {
  throw new Error(`expected 5 seeded creators, found ${(people ?? []).length}`);
}
const byHandle = new Map(people.map((p) => [p.email.split('@')[0], p]));

/* ------------------------------------------------------------ the contest -- */
say(`\nBuilding "${NAME}"`);

const contest = await call('save_contest', {
  p_actor_id: ACTOR,
  p_brand_id: BRAND,
  p_name: NAME,
  // Far enough out that it never expires mid-demo, and a real IANA zone so the
  // deadline survives a clock change, which is why that column exists.
  p_expires_at: '2026-09-30T23:59:00-05:00',
  p_expires_at_timezone: 'America/Chicago',
  p_description:
    'Post Penetrex videos through August and September. Every video counts once the team has watched it, and the rewards below are owed the moment you reach them.',
  p_currency: 'USD',
  p_status: 'active',
  // Approval on, so the entry queue has something in it too.
  p_needs_admin_approval: true,
});
const CONTEST = contest.id ?? contest.contest?.id;
if (!CONTEST) throw new Error('save_contest returned no id');
step('contest created');

await call('save_contest_commercials', {
  p_actor_id: ACTOR,
  p_contest_id: CONTEST,
  p_total_budget: 4000,
  p_internal_note: 'Seeded for testing the contest video queue. Not a real campaign.',
});
step('budget set, $4,000');

/*
 * TWO VIDEO TARGETS AND ONE GMV TARGET, on purpose. The two video targets are
 * what Rashid's rule governs: they are earned by APPROVED videos, so a reviewer
 * can watch the count cross one. The GMV target is the other kind, still earned
 * by staff confirming a figure, and having it beside them is the only way to
 * see that the two behave differently.
 */
const DELIVERABLES = [
  { type: 'video_count', title: 'Three videos up', target: 3, reward: 150, sort: 0 },
  { type: 'video_count', title: 'Six videos up', target: 6, reward: 400, sort: 1 },
  { type: 'gmv', title: '$2,000 in sales', target: 2000, reward: 250, sort: 2 },
];

for (const d of DELIVERABLES) {
  await call('save_contest_deliverable', {
    p_actor_id: ACTOR,
    p_contest_id: CONTEST,
    p_type: d.type,
    p_title: d.title,
    p_target_value: d.target,
    p_reward_amount: d.reward,
    p_deliverable_id: null,
    p_detail: null,
    p_sort_order: d.sort,
    p_is_active: true,
  });
  step(`deliverable: ${d.title}, $${d.reward}`);
}

/* ------------------------------------------------------------ the entrants -- */
/*
 * A real TikTok link per video, taken from the videos already on dev, so a
 * reviewer clicking through lands on something that exists. The ad codes are
 * invented, which is honest: an ad code is a string we are given, and nothing
 * in the contest path reads it yet.
 */
const { data: pool, error: poolErr } = await db
  .from('content_submissions')
  .select('video_url')
  .eq('brand_id', BRAND)
  .limit(40);
if (poolErr) throw new Error('video pool: ' + poolErr.message);
const LINKS = [...new Set((pool ?? []).map((v) => v.video_url))];
if (LINKS.length < 20) throw new Error(`need 20 distinct links to seed with, found ${LINKS.length}`);

let link = 0;
const nextLinks = (n) =>
  Array.from({ length: n }, () => ({
    video_url: LINKS[link++ % LINKS.length],
    ad_code: `CONTEST-${String(link).padStart(3, '0')}`,
    ad_authorized: true,
    thumbnail_url: null,
    video_title: null,
    video_author: null,
    embed_id: null,
  }));

const PLAN = [
  { handle: 'lowbacklab', videos: 3, approve: 3, sendBack: 0, gmv: 0, note: 'all three approved, the $150 is already owed' },
  { handle: 'sarahshopsss', videos: 3, approve: 2, sendBack: 0, gmv: 0, note: 'one approval short of $150' },
  { handle: 'neptunenavigates', videos: 4, approve: 0, sendBack: 0, gmv: 0, note: 'everything waiting' },
  { handle: 'vsternau', videos: 3, approve: 1, sendBack: 1, gmv: 0, note: 'one sent back already' },
  { handle: 'xxkissnoblissxx', videos: 2, approve: 0, sendBack: 0, gmv: 2400, note: 'a GMV claim waiting' },
];

for (const p of PLAN) {
  const person = byHandle.get(p.handle);
  if (!person) throw new Error(`no creator @${p.handle}`);

  const entry = await call('apply_for_contest', {
    p_actor_id: person.id,
    p_contest_id: CONTEST,
    p_note: null,
  });
  const ENTRY = entry.id ?? entry.entry?.id;
  if (!ENTRY) throw new Error(`apply_for_contest returned no id for @${p.handle}`);

  await call('review_contest_entry', {
    p_actor_id: ACTOR,
    p_entry_id: ENTRY,
    p_decision: 'approved',
    p_note: null,
    p_block: false,
    p_block_reason: null,
  });

  await call('submit_contest_progress', {
    p_actor_id: person.id,
    p_entry_id: ENTRY,
    p_gmv: p.gmv,
    p_video_count: p.videos,
    p_videos: nextLinks(p.videos),
  });

  /*
   * The videos are decided one at a time through the REAL review function, so
   * this seed exercises the money path it exists to demonstrate. If approving
   * the last video is supposed to owe $150, it does it here first.
   */
  const { data: filed, error: filedErr } = await db
    .from('contest_submissions')
    .select('id')
    .eq('entry_id', ENTRY)
    .order('created_at', { ascending: true });
  if (filedErr) throw new Error('submissions: ' + filedErr.message);

  let owed = 0;
  for (let i = 0; i < p.approve; i++) {
    const res = await call('review_contest_content', {
      p_actor_id: ACTOR,
      p_content_id: filed[i].id,
      p_status: 'approved',
      p_note: null,
    });
    owed += Number(res?.rewards?.amount ?? 0);
  }
  for (let i = 0; i < p.sendBack; i++) {
    await call('review_contest_content', {
      p_actor_id: ACTOR,
      p_content_id: filed[p.approve + i].id,
      p_status: 'needs_another_take',
      p_note: 'The product is out of frame for most of this one. Reshoot with it visible.',
    });
  }

  step(
    `@${p.handle}: ${p.videos} filed, ${p.approve} approved, ${p.sendBack} sent back` +
      (owed ? `, $${owed} owed` : '') +
      ` — ${p.note}`
  );
}

/* ----------------------------------------------------------------- proof -- */
const { data: awards } = await db
  .from('contest_awards')
  .select('awarded_amount, paid_at, term_id')
  .eq('contest_id', CONTEST);
const { data: subs } = await db
  .from('contest_submissions')
  .select('status')
  .eq('contest_id', CONTEST);

const count = (s) => (subs ?? []).filter((v) => v.status === s).length;

say('\n--- what is on dev now ---');
say(`  videos filed              ${(subs ?? []).length}`);
say(`  approved                  ${count('approved')}`);
say(`  waiting to be watched     ${count('submitted')}`);
say(`  sent back                 ${count('needs_another_take')}`);
say(
  `  rewards owed              ${(awards ?? []).filter((a) => a.term_id && !a.paid_at).length}` +
    `, $${(awards ?? []).reduce((a, w) => a + Number(w.awarded_amount ?? 0), 0).toFixed(2)}`
);
say('\nDone.\n');
