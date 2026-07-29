/**
 * simulate-plan.ts — put a profile into a given billing state, for testing.
 *
 * Why this exists: everything Pro-gated in the product (Active Recall, Anki
 * export, PRO badges) branches on `is_pro` alone, so it looks identical for
 * every paid plan. The only genuinely plan-specific UI is /upgrade, which
 * branches on subscription_id / cancel_at_period_end / subscription_started_at.
 * So rather than needing three separate logins, you can sign in as yourself and
 * flip your own profile through each state.
 *
 * NOTE: monthly and annual render the SAME on /upgrade apart from the next
 * billing date — the page never reads the plan type. Don't expect a visual
 * difference beyond that date.
 *
 * Usage (dry run — prints the diff, writes nothing):
 *   cd webapp && npx tsx scripts/simulate-plan.ts you@example.com monthly
 *
 * Apply it:
 *   cd webapp && npx tsx scripts/simulate-plan.ts you@example.com monthly --yes
 *
 * Restore a normal free account:
 *   cd webapp && npx tsx scripts/simulate-plan.ts you@example.com free --yes
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from webapp/.env.
 * It writes to whatever project those point at — usually production. Hence the
 * dry-run default.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

type PlanState = Record<string, string | boolean | null>;

const STATES: Record<string, { desc: string; fields: PlanState }> = {
  free: {
    desc: 'No Pro. /upgrade shows the three plan cards.',
    fields: {
      is_pro: false, is_gifted_pro: false, gifted_pro_expires_at: null, gifted_by_note: null,
      subscription_id: null, subscription_started_at: null, subscription_period_end: null,
      cancel_at_period_end: false, pro_payment_id: null,
    },
  },
  monthly: {
    desc: 'Active monthly subscription. /upgrade shows "Next billing date" + Cancel (no refund offer).',
    fields: {
      is_pro: true, is_gifted_pro: false,
      subscription_id: 'sub_sim_monthly', subscription_started_at: iso(-20),
      subscription_period_end: iso(10), cancel_at_period_end: false, pro_payment_id: null,
    },
  },
  annual: {
    desc: 'Active annual subscription — identical to monthly except the billing date is ~11 months out.',
    fields: {
      is_pro: true, is_gifted_pro: false,
      subscription_id: 'sub_sim_annual', subscription_started_at: iso(-40),
      subscription_period_end: iso(325), cancel_at_period_end: false, pro_payment_id: null,
    },
  },
  lifetime: {
    desc: 'One-time lifetime purchase. /upgrade shows "Lifetime Access — your Pro benefits never expire".',
    fields: {
      is_pro: true, is_gifted_pro: false,
      subscription_id: null, subscription_started_at: null, subscription_period_end: null,
      cancel_at_period_end: false, pro_payment_id: 'pay_sim_lifetime',
    },
  },
  cancelling: {
    desc: 'Subscription set to cancel. /upgrade shows "Your subscription cancels on <date>".',
    fields: {
      is_pro: true, is_gifted_pro: false,
      subscription_id: 'sub_sim_monthly', subscription_started_at: iso(-20),
      subscription_period_end: iso(10), cancel_at_period_end: true, pro_payment_id: null,
    },
  },
  refundable: {
    desc: 'Subscribed 2 days ago — inside the 7-day window, so Cancel becomes "Cancel & Request Refund".',
    fields: {
      is_pro: true, is_gifted_pro: false,
      subscription_id: 'sub_sim_monthly', subscription_started_at: iso(-2),
      subscription_period_end: iso(28), cancel_at_period_end: false, pro_payment_id: null,
    },
  },
};

const READ_COLUMNS =
  'id, username, is_pro, is_gifted_pro, subscription_id, subscription_started_at, subscription_period_end, cancel_at_period_end, pro_payment_id';

function usage(): never {
  console.log('Usage: npx tsx scripts/simulate-plan.ts <email> <state> [--yes]\n');
  console.log('States:');
  for (const [name, { desc }] of Object.entries(STATES)) {
    console.log(`  ${name.padEnd(11)} ${desc}`);
  }
  console.log('\nWithout --yes this is a dry run and nothing is written.');
  process.exit(1);
}

async function main() {
  const [email, state] = process.argv.slice(2);
  const apply = process.argv.includes('--yes');
  if (!email || !state || !STATES[state]) usage();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const projectRef = new URL(url).host.split('.')[0];
  console.log(`\nProject : ${projectRef}`);
  console.log(`Account : ${email}`);
  console.log(`State   : ${state} — ${STATES[state].desc}\n`);

  // Resolve the auth user, then its profile row.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) { console.error('❌  Could not list users:', listErr.message); process.exit(1); }
  const user = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`❌  No auth user with email ${email}. (Has this account signed in at least once?)`);
    process.exit(1);
  }

  const { data: before, error: beforeErr } = await admin
    .from('profiles').select(READ_COLUMNS).eq('id', user.id).single();
  if (beforeErr) { console.error('❌  Could not read profile:', beforeErr.message); process.exit(1); }

  const fields = STATES[state].fields;
  console.log('Changes:');
  let changed = 0;
  for (const [col, next] of Object.entries(fields)) {
    const current = (before as Record<string, unknown>)[col] ?? null;
    const same = String(current) === String(next);
    if (!same) changed++;
    console.log(`  ${same ? ' ' : '→'} ${col.padEnd(26)} ${String(current)}  ${same ? '(unchanged)' : `→  ${String(next)}`}`);
  }
  if (changed === 0) console.log('  (already in this state)');

  if (!apply) {
    console.log('\n🔍  Dry run — nothing written. Re-run with --yes to apply.\n');
    return;
  }

  const { error: updErr } = await admin.from('profiles').update(fields).eq('id', user.id);
  if (updErr) { console.error('❌  Update failed:', updErr.message); process.exit(1); }

  const { data: after } = await admin.from('profiles').select(READ_COLUMNS).eq('id', user.id).single();
  console.log('\n✅  Applied. Reload /upgrade to see it.');
  console.log('    is_pro:', (after as Record<string, unknown>)?.is_pro,
              '· subscription_id:', (after as Record<string, unknown>)?.subscription_id ?? 'null',
              '· cancel_at_period_end:', (after as Record<string, unknown>)?.cancel_at_period_end);
  console.log('    Restore with: npx tsx scripts/simulate-plan.ts', email, 'free --yes\n');
}

main().catch(err => { console.error('❌ ', err?.message ?? err); process.exit(1); });
