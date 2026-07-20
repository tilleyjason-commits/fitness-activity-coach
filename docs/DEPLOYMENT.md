# Deployment order and operations notes

## Release order (strict)

Ship in this order — each step depends on the previous one being live:

1. **Database migrations** (`supabase/migrations/`), in filename order:
   - `009_profile_ownership.sql` — profiles `id`/`user_id` contract (backfill + CHECK).
   - `010_macro_rate_limit.sql` — `macro_calc_attempts` table + `consume_macro_calc_quota()` RPC.
   - `011_transactional_saves.sql` — transactional replacement RPCs (`save_workout`, `save_routine`, `save_meal`, `delete_meal`, `replace_exercise_logs`).

   Apply with `supabase db push` (or paste into the SQL editor in order). All three
   are additive and idempotent; they can be re-run safely.

2. **Edge Function**: `supabase functions deploy calculate-macros`.
   The function *fails closed* if `consume_macro_calc_quota()` is missing, so the
   migration must be applied first. Required function secrets: `NVIDIA_API_KEY`
   (`SUPABASE_URL`/`SUPABASE_ANON_KEY` are injected automatically).

3. **Web frontend**: merge to `main` → GitHub Actions runs quality gates
   (lint, typecheck, unit/component tests, build) and then deploys to GitHub Pages.
   The new frontend calls the RPCs from step 1 and expects the step-2 auth/quota
   behavior, so deploy it last.

Deploying the frontend before the migrations would break workout/routine/meal
saves (the repository methods call the RPCs and deliberately have **no**
delete-then-insert fallback).

## calculate-macros policy constants

Rate limits live in **one place**: the `DECLARE` block of
`consume_macro_calc_quota()` in `010_macro_rate_limit.sql`
(10 attempts per rolling hour, 30 per UTC day). Adjust there and re-apply; no
frontend or Edge Function change needed.

## Error contract (calculate-macros)

| Status | code | Meaning |
| --- | --- | --- |
| 401 | `unauthenticated` | Missing/invalid user JWT (anon key alone is rejected) |
| 400 | `invalid_request` | Bad body (empty description / unknown meal slot) |
| 429 | `rate_limited` | App per-user quota exhausted (`retry_after_seconds` included) |
| 503 | `provider_unavailable` | NVIDIA 429/5xx or network failure |
| 502 | `provider_invalid_output` | Model output unparseable |
| 500 | `internal` | Unexpected fault only |

There is intentionally **no silent fallback provider**; any future fallback must
be user-visible.

## CI / smoke tests

- `deploy.yml` blocks GitHub Pages deployment on install → lint → typecheck →
  unit/component tests → production build.
- Authenticated Playwright smoke (`npm run test:e2e`) reads credentials from the
  gitignored `.env.smoke.local` (`SMOKE_USER_EMAIL`, `SMOKE_USER_PASSWORD`,
  `SMOKE_USER_ID`). Never commit these values. In CI this is an **optional**,
  manually-triggered job that requires the same names as GitHub secrets — see
  `.github/workflows/smoke.yml`. It is not run on fork PRs.
