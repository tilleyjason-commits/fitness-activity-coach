# AGENTS.md — fitness-activity-coach

Project context for any AI agent (Hermes, Claude Code, Codex, …) working in this repo.
This file is injected into every session in this directory. Keep it accurate.

## What this is

Mobile-first React + Vite + Tailwind workout/nutrition logger with a rules-engine coach and a
Supabase backend. Check out at `~/dev/fitness-activity-coach`.

## Accounts — personal profile only

This repo belongs to the **personal** Hermes profile. Use the profile-scoped CLI wrappers, never a
bare `gh` / `supabase` / `vercel` login.

| Service | Identity | Access |
|---|---|---|
| GitHub | `tilleyjason-commits/fitness-activity-coach` | admin + push, via personal `gh` wrapper |
| Supabase | project ref `pctsrnaevhjeahbnrjfm` | via hosted connector alias `fitness` (project uses CLI wrapper) |
| Vercel | project `fitness-coach`, team `tilleyjason-9341s-projects` | personal `vercel` wrapper only |

Church/ministry accounts (Simplicity, GatherWell, `alfwc-church-mgmt`, `simplicity-staging`)
belong to the **ministry** profile. Never log in as, or deploy to, those from here.

## Branch and deploy rules

1. Branch from fresh `main` as `fix/...`. **Never push to `main` — a push deploys.**
2. Open a PR, wait for the `verify` and `smoke` checks, merge with `--merge` (history uses merge
   commits), then confirm the Deploy run on `main` succeeded.
3. Push a branch with personal credentials:
   `git -c credential.helper= -c "credential.helper!<personal gh wrapper> auth git-credential" push -u origin <branch>`
   — bare `git` uses the wrong login.
4. Stage only the paths you changed: `git add -A -- src` (plus `supabase/` for migrations).
   **Never `git add -A` blindly** — the tree may carry unrelated hosting changes.

## Local gate

```bash
npm ci                                  # first time in a checkout; node_modules may be absent
npx tsc --noEmit
npx eslint .
npm run build
NODE_OPTIONS=--no-experimental-webstorage npx vitest run
```

On Node 25+ the built-in `localStorage` shadows jsdom's and every test fails with
`localStorage.clear` undefined — the `NODE_OPTIONS` flag is required locally. CI uses Node 22 and
needs no flag. `npm run verify` runs lint + typecheck + test + build.

## Database changes

Migrations go to the **live project first** (migration file + connector SQL + a `schema_migrations`
row), then to the PR. Code must tolerate both states. Migrations 015–019 do not exist; the next
number follows the highest applied. Newest applied is **024**.

## Architecture invariants

- Canonical storage units: **height cm, weight lb, waist inches**.
  `user_settings.preferred_units` is `'lb'|'kg'` and only changes display; convert with
  `src/lib/units.ts`. Convert typed input when the toggle changes — never reinterpret digits.
- Offline queues (`workout-`, `meal-`, `daily-log-offline-queue.ts`) are keyed per user. A
  successful live save must dequeue its date/slot (daily-log: only the fields it wrote); finishing
  a workout dequeues its date; clearing a meal dequeues its slot; flush re-reads the queue before
  each item and removes by id. **Do not quarantine on sign-out.**
- A second workout on the same date is a supported flow ("repeat a day"), so `save_workout` must
  not refuse to insert an active row when a completed one exists.
- Rules engine (`src/lib/evaluate.ts`, `rules/rules.json`): a rule referencing a null/undefined
  context field is **skipped, not failed**. End-of-day triggers (`log.day.complete`) apply only to
  days before today. Do not map supplement booleans (beta-alanine, omega-3) into context with
  `false` defaults — that fails for users who do not take them; gate on the user's supplement list.
  The knee/shoulder rules and the protein/caffeine numbers are **one person's**; make them
  per-profile before treating them as universal.
- `daily_logs.barbell_squat_done` / `barbell_ohp_done` are set by the
  `summarize_completed_workout` trigger from the live workout. `double_progression_followed` is set
  **only** by the backfill form.
- Auth: `AuthContext` exposes `stalled` (slow first lookup — keep the spinner, offer retry),
  `passwordRecovery`, `resetPassword`, `updatePassword`. The app uses `HashRouter`, so recovery is
  driven by the `PASSWORD_RECOVERY` event and a synchronous read of `#...type=recovery` at load —
  **not** by routing on the URL. `src/lib/profile-gate.ts` decides ready / needs-setup / error; a
  lookup error lets in only users previously seen complete (offline use) and otherwise shows a
  retry screen.

## UI conventions

- Text buttons: `emerald-700` fill with white text (white on `emerald-500` is only 2.5:1).
  `emerald-500` is for pass dots and icons only.
- Muted text: `slate-500` on light / `slate-400` on dark — **never** the reverse.
- Error text: `text-red-600 dark:text-red-400` with `role="alert"`.
- A failed fetch shows an error **with Retry**, never the empty-state copy ("No routine for today",
  "All clear").
- Modals use `src/hooks/useFocusTrap.ts` plus `role="dialog" aria-modal aria-labelledby`. The trap
  must **not** filter focusable elements by `offsetParent` (always null in jsdom — Tab handling and
  tests break). Query the selector only.
- Keep the correction pages (`/log/training` backfill, `/log/nutrition` daily totals/timing flags):
  they are the only setters for `double_progression_followed` and the casein/snack/dinner flags the
  rules read. Label them as corrections rather than deleting them, unless asked.

## Test pitfalls

- Add tests with each behavior change.
- `vi.mock('~/lib/db', ...)` factories in page tests list exports explicitly, so adding a `db.ts`
  export used by a page means updating those mocks (SetupWizard, `Settings.reminders` tests). When a
  UI string or empty-state behavior changes on purpose, update the tests that assert the old copy
  (LogHub, `Dashboard.today`) instead of keeping the old behavior.
- **Hook mocks in page tests must return stable references** (hoist `const NO_SUPPLEMENTS = []`;
  never `supplements: []` inline). A fresh array per call re-fires Dashboard's recommendation effect
  on every render. It stays hidden until a test triggers a re-render after the page settles (e.g.
  clicking Retry), then loops until the worker dies with a heap OOM ("Worker exited unexpectedly").
  To locate it, count renders from the mock and throw past a cap; write traces with
  `fs.appendFileSync` — worker console output is lost when the worker crashes.

## Hosting

| Host | URL | Trigger |
|---|---|---|
| GitHub Pages | `https://tilleyjason-commits.github.io/fitness-activity-coach/` | push to `main` |
| Vercel | `https://fitness-coach-xi-nine.vercel.app` | push to `main` (Git-connected) |

`vite.config.ts` sets `base` from `process.env.VERCEL` so a Pages build keeps the repo path. **Do
not hardcode the Pages path into a Vercel build** — asset URLs 404 at the domain root. Do not
connect Git, or let a production deploy run, while `main` still hardcodes the Pages path.
HashRouter means routes need no SPA rewrite.

Vercel project settings: framework `vite`, build `npm run build`, install `npm ci`, output `dist`,
Node `22.x`. Manual deploys go through the personal `vercel` wrapper:
`--scope tilleyjason-9341s-projects --project fitness-coach`. The CLI uploads the working tree, and
`npm run build` is `tsc --noEmit && vite build`, so a type error in an uncommitted file fails the
deploy. `.vercel/` stays gitignored.

`vercel git connect` fails until the fitness Vercel account has a GitHub login connection. Do not
add that connection on the church Vercel account — two Vercel accounts cannot share one GitHub
login, and connecting it on one removes it from the other.

## Environment variables

Set `VITE_SUPABASE_URL` and the **legacy anon key** on production, preview, and development:

```bash
supabase projects api-keys --project-ref pctsrnaevhjeahbnrjfm --name anon
```

Get the legacy key (type `legacy`), not the short publishable key — the client is not changed.
Env-add and protection-disable rules live in the `hermes-profile-operations` skill.

Confirmation emails follow `site_url` = `https://fitness-coach-xi-nine.vercel.app/`. `signUp` does
not pass `redirectTo`, so **do not move `site_url` back to Pages**. Keep the Pages origin,
`http://localhost:5173/**`, and `https://fitness-coach-xi-nine.vercel.app/**` in `uri_allow_list`.
Password reset uses `origin + BASE_URL`.

## Do not

- Do not call JEFIT or copy its exercise media when extending screens.
- Do not treat leaked-password protection as available — it is plan-gated (Pro).
- Do not push to `main`, deploy manually from a dirty tree, or mix ministry credentials in.
