import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const databaseUrl = process.env.LOCAL_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('LOCAL_DATABASE_URL is required. Remote database URLs are refused.');
}

const parsed = new URL(databaseUrl);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !localHosts.has(parsed.hostname)) {
  throw new Error(`Refusing non-local database host: ${parsed.hostname || '(missing)'}`);
}
if (process.env.ALLOW_LOCAL_DB_BOOTSTRAP !== '1') {
  throw new Error('Set ALLOW_LOCAL_DB_BOOTSTRAP=1 to confirm this disposable local bootstrap.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = path.join(root, 'supabase', 'schemas', '001_core_baseline.sql');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => path.join(migrationsDir, name));

const pgEnv = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || '5432',
  PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
};

for (const sqlFile of [baseline, ...migrations]) {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', sqlFile], {
    env: pgEnv,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Applied local baseline and ${migrations.length} ordered migrations.`);
