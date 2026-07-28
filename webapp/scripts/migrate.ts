/**
 * migrate.ts — Run pending SQL migrations before build / start.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts
 *
 * Requires env var:
 *   DATABASE_URL  — Supabase direct Postgres connection string
 *                   (Dashboard → Settings → Database → Connection string → URI)
 *
 * Migrations live in webapp/migrations/ as 001_*.sql, 002_*.sql, etc.
 * Applied migrations are tracked in a public.schema_migrations table.
 */

import 'dotenv/config';
import fs             from 'node:fs';
import path           from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client }     from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set. Add it to your .env.local or environment.');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  // Local Postgres (e.g. `supabase start` in dev/CI) doesn't serve SSL; hosted
  // Supabase requires it. Disable SSL only for local hosts so the same script
  // works for production migrations and local/CI integration setups.
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL!);
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('🔌  Connected to database');

  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version     TEXT        PRIMARY KEY,
        applied_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Fetch already-applied versions
    const { rows } = await client.query<{ version: string }>(
      'SELECT version FROM public.schema_migrations ORDER BY version'
    );
    const applied = new Set(rows.map(r => r.version));

    // Collect and sort migration files
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let ran = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓  ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      console.log(`  ⟳  ${file} …`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_migrations (version) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  ✅  ${file}`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌  ${file} failed:`, (err as Error).message);
        throw err;
      }
    }

    if (ran === 0) {
      console.log('  ✓  All migrations already applied — nothing to do');
    } else {
      console.log(`\n✅  ${ran} migration(s) applied`);
    }
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('\n❌  Migration failed:', err.message);
  process.exit(1);
});
