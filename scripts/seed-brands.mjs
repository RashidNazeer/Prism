#!/usr/bin/env node
/**
 * Seed demo brands and offers on DEV so the Brand Hub has something in it.
 *
 * Uses the real database functions rather than raw inserts, so the seeded rows
 * go through the same validation and land in the audit log exactly as they
 * would if an admin had typed them. Never run this against prod.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... node scripts/seed-brands.mjs
 *   SUPABASE_SERVICE_KEY=... node scripts/seed-brands.mjs --clean
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE) throw new Error('SUPABASE_SERVICE_KEY must be set');

const admin = createClient(env.VITE_SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

// Store ids all share this prefix so --clean can find exactly what it made.
const PREFIX = 'demo-';

const BRANDS = [
  {
    name: 'Vitauthority',
    storeId: `${PREFIX}vitauthority`,
    client: 'Vitauthority LLC',
    budget: 48000,
    offers: [
      {
        badge: 'TOP PICK',
        title: 'Starter bundle',
        description:
          'Five in-feed videos featuring the hero product, posted within 30 days. Hook in the first two seconds.',
        videos: 5,
        reward: 300,
        needsApplication: true,
      },
      {
        // Not "OPEN": the card already carries an "open to all" chip derived
        // from needs_application, and two badges saying the same thing reads
        // like a bug.
        badge: 'QUICK START',
        title: 'Single video test',
        description: 'One video, no commitment. A good way to see if we fit.',
        videos: 1,
        reward: 75,
        needsApplication: false,
      },
      {
        title: 'Volume deal',
        description: 'Twenty videos across the quarter, paid monthly.',
        videos: 20,
        reward: 1400,
        needsApplication: true,
      },
    ],
  },
  {
    name: 'BruMate',
    storeId: `${PREFIX}brumate`,
    client: 'BruMate Inc',
    budget: 32000,
    offers: [
      {
        badge: 'SEASONAL',
        title: 'Summer drinkware push',
        description: 'Three videos with the tumbler range, outdoors, before the end of August.',
        videos: 3,
        reward: 240,
        needsApplication: true,
      },
      {
        title: 'Unboxing only',
        description: 'One unboxing video. Open to anyone on the roster.',
        videos: 1,
        reward: 60,
        needsApplication: false,
      },
    ],
  },
  {
    name: 'Physicians Choice',
    storeId: `${PREFIX}physicians-choice`,
    client: 'Physicians Choice',
    budget: 60000,
    offers: [
      {
        badge: 'HIGHEST PAYING',
        title: 'Gut health series',
        description: 'Ten videos telling one story across the month. Script approval required.',
        videos: 10,
        reward: 900,
        needsApplication: true,
      },
    ],
  },
  {
    name: 'Bentgo',
    storeId: `${PREFIX}bentgo`,
    client: 'Bentgo',
    budget: 18000,
    offers: [],
  },
];

const clean = process.argv.includes('--clean');

const { data: staff, error: staffErr } = await admin
  .from('profiles')
  .select('id, email')
  .in('role', ['admin', 'ops'])
  .eq('is_active', true)
  .limit(1)
  .maybeSingle();

if (staffErr || !staff) {
  throw new Error('No active admin found. Run scripts/create-admin.mjs first.');
}

if (clean) {
  const { data: existing } = await admin
    .from('brands')
    .select('id, name')
    .like('store_id', `${PREFIX}%`);

  console.log(`\nRemoving ${(existing ?? []).length} demo brand(s)\n`);
  for (const b of existing ?? []) {
    const { data: offers } = await admin.from('offers').select('id').eq('brand_id', b.id);
    for (const o of offers ?? []) {
      await admin.from('audit_log').delete().eq('subject_id', o.id);
    }
    await admin.from('audit_log').delete().eq('subject_id', b.id);
    // Offers go with the brand: the foreign key cascades.
    await admin.from('brands').delete().eq('id', b.id);
    console.log(`  removed  ${b.name}`);
  }
  console.log('\nDone.\n');
  process.exit(0);
}

console.log(`\nSeeding demo brands into ${env.VITE_SUPABASE_URL}`);
console.log(`Acting as ${staff.email}\n`);

for (const b of BRANDS) {
  const { data: existing } = await admin
    .from('brands')
    .select('id')
    .eq('store_id', b.storeId)
    .maybeSingle();

  const { data: saved, error } = await admin.rpc('save_brand', {
    p_actor_id: staff.id,
    p_name: b.name,
    p_store_id: b.storeId,
    p_brand_id: existing?.id ?? null,
    p_client_name: b.client,
    p_budget: b.budget,
    p_currency: 'USD',
    p_is_active: true,
  });

  if (error) {
    console.log(`  FAILED  ${b.name}  ${error.message}`);
    continue;
  }

  const brandId = saved.id;
  let added = 0;

  for (const o of b.offers) {
    const { data: already } = await admin
      .from('offers')
      .select('id')
      .eq('brand_id', brandId)
      .eq('title', o.title)
      .maybeSingle();

    const { error: offerErr } = await admin.rpc('save_offer', {
      p_actor_id: staff.id,
      p_brand_id: brandId,
      p_title: o.title,
      p_video_count: o.videos,
      p_reward_amount: o.reward,
      p_offer_id: already?.id ?? null,
      p_badge_title: o.badge ?? null,
      p_description: o.description ?? null,
      p_currency: 'USD',
      p_status: 'active',
      p_needs_application: o.needsApplication,
    });

    if (offerErr) console.log(`    FAILED offer "${o.title}": ${offerErr.message}`);
    else added += 1;
  }

  console.log(`  ready    ${b.name.padEnd(20)} ${added} offer(s)`);
}

console.log('\nRemove them again with: node scripts/seed-brands.mjs --clean\n');
