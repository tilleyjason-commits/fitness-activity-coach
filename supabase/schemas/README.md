# Declarative schema baseline

`001_core_baseline.sql` reconstructs the five Coach tables that were originally
created in the hosted SQL editor and therefore never received a `001` migration.
It intentionally represents their state immediately before migration 002.

## Existing production or shared projects

Do not apply this file. Continue from the project's recorded, append-only
`supabase/migrations/` history. This branch does not rewrite, squash, or apply
any live migration.

## Disposable local bootstrap

Use a new Supabase-compatible local PostgreSQL database where the `auth` schema
already exists and none of this repository's numbered migrations have run.
The bootstrap command refuses non-loopback hosts and requires an explicit guard:

```powershell
$env:LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$env:ALLOW_LOCAL_DB_BOOTSTRAP = '1'
npm run db:bootstrap:local
```

The command applies the baseline first, then every numbered SQL migration in
lexicographic order with `psql -v ON_ERROR_STOP=1`. Use only against a
disposable database: a failed migration can leave that local database partially
initialized, in which case recreate the local database and rerun.

The declarative baseline owns only the pre-002 core tables. Later tables,
policies, functions, triggers, grants, and constraints remain owned by the
numbered migrations so there is one canonical definition for each object.
