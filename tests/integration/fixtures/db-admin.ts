/**
 * DB admin helpers for the integration harness (audit enabler a).
 *
 * The local Supabase stack grants the API roles (anon/authenticated/service_role)
 * only non-data privileges on tables that migrations create; the hosted platform
 * grants data access via schema-level defaults. `bootstrapGrants()` reproduces
 * that so tables created by our migrations are reachable — it MUST run BEFORE
 * migrations, so migration 012 can then refine profiles UPDATE to column-level.
 *
 * `reloadSchema()` nudges PostgREST to pick up schema/grant changes.
 *
 * CLI:
 *   node --import tsx tests/integration/fixtures/db-admin.ts bootstrap
 *   node --import tsx tests/integration/fixtures/db-admin.ts reload
 */
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required for db-admin.');

// Local Postgres (supabase start) does not serve SSL; hosted requires it.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Grant data access to the API roles for all future public tables. Run BEFORE migrations. */
export async function bootstrapGrants(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
    `);
    console.log('✅  bootstrap grants applied (default privileges for public tables/sequences)');
  });
}

/** Ask PostgREST to reload its schema/grant cache. */
export async function reloadSchema(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`NOTIFY pgrst, 'reload schema';`);
    console.log('✅  PostgREST schema reload requested');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const run = cmd === 'bootstrap' ? bootstrapGrants : cmd === 'reload' ? reloadSchema : null;
  if (!run) {
    console.error('usage: db-admin.ts <bootstrap|reload>');
    process.exit(1);
  }
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
