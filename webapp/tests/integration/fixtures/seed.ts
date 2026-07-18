/**
 * Seed helpers for integration tests (audit enabler a).
 *
 * Uses the service-role GoTrue admin API to create auth users and set profile
 * state directly (bypassing RLS). Run directly to seed a baseline set:
 *   node --import tsx tests/integration/fixtures/seed.ts
 * or import the helpers from individual test files.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient } from './supabase.js';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
}

const DEFAULT_PASSWORD = 'test-password-123!';

/** Delete any existing auth user with this email so seeding is idempotent. */
export async function deleteUserByEmail(admin: SupabaseClient, email: string): Promise<void> {
  // GoTrue admin listUsers is paginated; the local stack is small so one page is plenty.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = data?.users?.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
}

/**
 * Create a confirmed auth user, sign in to mint an access token, and return the
 * user + token. Idempotent: replaces any existing user with the same email.
 */
export async function createTestUser(
  email: string,
  password: string = DEFAULT_PASSWORD,
): Promise<TestUser> {
  const admin = adminClient();
  await deleteUserByEmail(admin, email);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  const { data: signIn, error: signInErr } = await anonClient().auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.session) throw new Error(`sign-in failed: ${signInErr?.message}`);

  return { id: data.user.id, email, password, accessToken: signIn.session.access_token };
}

/** Set arbitrary profile columns via the service role (bypasses RLS). */
export async function setProfileFlags(
  userId: string,
  flags: Record<string, unknown>,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('profiles').update(flags).eq('id', userId);
  if (error) throw new Error(`setProfileFlags failed: ${error.message}`);
}

/** Convenience: mark a user Pro. */
export async function makePro(userId: string): Promise<void> {
  await setProfileFlags(userId, { is_pro: true });
}

/** Baseline set used across suites. Extend as #1–#5 land. */
export async function seedBaseline() {
  const userA = await createTestUser('user-a@example.test');
  const userB = await createTestUser('user-b@example.test');
  const freeUser = await createTestUser('free@example.test');
  const adminUser = await createTestUser('admin@example.test');
  return { userA, userB, freeUser, adminUser };
}

// When run directly (CI seed step), seed the baseline and print the ids.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedBaseline()
    .then((users) => {
      console.log('Seeded baseline users:');
      for (const [name, u] of Object.entries(users)) console.log(`  ${name}: ${u.id} (${u.email})`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
