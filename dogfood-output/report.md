# Fitness Activity Coach — Full Review + Smoke Test

**Target:** https://tilleyjason-commits.github.io/fitness-activity-coach/  
**Date:** 2026-07-22  
**Scope:** Full production review + unit/e2e/API/browser smoke  
**Repo:** `tilleyjason-commits/fitness-activity-coach` @ `main` (`efdd936`)  
**Tester:** Hermes Agent

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 3 |
| Medium | 5 |
| Low | 4 |
| **Total open** | **12** |

**Overall:** Production is materially healthier than the July baseline. Gates are green (lint/typecheck/**207** unit tests/build), live Pages deploys, authenticated Playwright smoke is green (**5/5** after a local env pitfall fix), workout/meal/routine RPCs work live, AI macros require auth + rate limit and returned **200**, and prior P0s (profile `user_id`, History dead-end, setup save-on-error, ErrorBoundary, transactional saves) are fixed.

Remaining value is mostly product completeness: **broken rule triggers** (coaching recommendations silently skip), **Jason-hardcoded targets/rules**, **6-tab IA vs approved 5**, and **no offline workout queue** yet.

---

## Metrics

| Metric | Value |
|--------|-------|
| Source TS/TSX files | 53 |
| Source LOC (approx) | ~13.4k |
| Unit/component test files | 28 |
| Unit tests | **207 passed** |
| E2E smoke | **5/5 passed** |
| Lint / typecheck / build | **pass** |
| Main JS chunk (live) | 432 KB (126 KB gzip) |
| Charts chunk (lazy) | 376 KB (104 KB gzip) |
| CSS | 31 KB |
| Live HTML/JS/CSS | **200** |
| Supabase project | `pctsrnaevhjeahbnrjfm` |
| Edge `calculate-macros` anon | **401** unauthenticated |
| Edge `calculate-macros` auth | **200** (banana → 105 kcal) |
| RPC `save_workout` / `save_meal` / `save_routine` | **live + working** |
| Runtime vulns (`npm audit` not re-run this pass) | prior: 0 |

---

## Smoke results (evidence classes)

### Directly exercised
- `npm run verify` → lint + typecheck + 207 tests + production build
- Playwright e2e (disposable users A/B): login, nav, History deep-link, RLS daily_log write/delete, supplements UI+RPC+isolation, meal slots pre-workout/bedtime manual entry+totals+isolation, commercial gym catalog add/save/cleanup
- Live browser: login, Home dashboard, Training blank workout → **Saved**, Macros 7 slots visible, 0 console JS errors
- Authenticated REST: profile patch, workout/meal/routine RPCs, cleanup

### Live deployment/schema probes
- Pages bundle embeds Supabase URL, meal slots, `save_meal`, `calculate-macros`, `set_supplement_taken`
- `save_workout` lives in lazy `workout-repo-*.js` chunk (not main index) — expected after code-split

### Static inspection only
- Rule DSL `new Function`, offline queue absence, Settings edit surface, IA labels

### Local pitfall (not app bug)
- Unquoted smoke passwords containing `#`/`$` break if the file is bash-sourced; Playwright refuses to overwrite existing env → false "Invalid login credentials". Fixed this session by unsetting polluted env; `.env.smoke.local` values are now double-quoted. **Do not `source` this file in bash.**

---

## Prior findings status (July full review)

| Prior issue | Status |
|-------------|--------|
| AI edge anon / paid path open | **Fixed** — 401 anon; auth+quota path works |
| NVIDIA 429 → 502 | **Mitigated** — structured 503/429 + manual fallback UI; live probe 200 |
| delete-then-insert data loss | **Fixed** — transactional RPCs (011/012) live |
| No tests/lint/smoke CI | **Fixed** — verify gate + PR smoke workflow + deploy gates |
| Setup wizard navigates after failed save | **Fixed** (unit coverage) |
| Profile upsert missing `user_id` | **Fixed** (live patch + unit) |
| History tab dead-end | **Fixed** (`/training?tab=history`) |
| No ErrorBoundary | **Fixed** |
| Completed workout auto-repopulate | **Fixed** (`hasCompletedWorkout`) |
| Jason-hardcoded multi-user rules | **Still open** |
| 5-item nav IA | **Still open** (still 6 tabs) |
| Offline workout sync queue | **Still open** (autosave comment only) |

---

## Open issues (priority-ordered)

### HIGH-001 — Rule triggers with bare `log.*` fields never fire
**Category:** Functional / coaching engine  
**Evidence:** Unit stderr during Dashboard tests + static analysis of `rules/rules.json` vs `evaluate.ts` `TRIGGER_PATHS`.

**Broken triggers (7 rules):**
- `log.training_done == true` → `carb_pre_workout`, `rest_interval_compliance`, `session_duration_max`, `caffeine_dose_monitor`, `full_rom_emphasis`
- `log.daily_protein_g > 100` → `protein_per_meal_distribution`
- `log.daily_fat_g > 0` → `fat_minimum_floor`

**Why:** `checkTriggerClause` only rewrites paths in `TRIGGER_PATHS`. Unknown `log.foo` is compiled with `new Function` and throws `ReferenceError: log is not defined`, caught as `false`.

**Fix:** Either:
1. Expand `TRIGGER_PATHS` / generic strip of `log.` prefix before eval, or  
2. Normalize rule JSON to flat context fields (`training_done == true`), plus unit tests for every trigger shape in `rules.json`.

**Impact:** Those coaching recommendations never appear even when conditions are true.

---

### HIGH-002 — Targets / meal timing / rules still Jason-hardcoded (multi-user gap)
**Category:** Product / multi-user  
**Where:** `rules/rules.json` athlete_profile + many evaluate literals; `src/lib/constants.ts` `TARGETS`, `MEAL_TIMING` (11:00 training, 195–205g protein, 2500 kcal).

**Impact:** Every user gets Jason’s targets/timing. Dashboard protein pass/fail and meal-slot hints are not profile-driven despite profiles storing `training_time` / goals.

**Fix:** Derive targets from profile (or user settings), inject into `buildContext` / UI constants; keep MASS evidence text generic.

---

### HIGH-003 — Offline workout sync not implemented
**Category:** Reliability / approved direction  
**Where:** `src/lib/autosave.ts` documents a future offline queue wrapper; no queue/replay UI.

**Impact:** Active workouts fail hard when offline/network blips (RPC errors surface, but no durable retry). Approved product direction required offline-first workouts.

**Fix:** Persist pending `save_workout` payloads + replay with backoff; show Sync indicator (FitTrack pattern).

---

### MED-001 — Nav IA still 6 tabs, not approved 5
**Category:** UX / IA  
**Current:** Home / Training / Log / Macros / Weekly / Settings  
**Approved:** Home / Workout / Log / Progress / More  

**Impact:** Crowded thumb bar; “Log” points at `/log/training` (backfill) while canonical tracker is `/training`. Dashboard quick action is still “Log Training” → `/log/training`.

**Fix:** Collapse Weekly+Settings+supplements under More; rename Training→Workout; Log hub for nutrition/sleep/subjective/weight; Progress for weekly.

---

### MED-002 — `new Function` rule engine remains a CSP/security smell
**Category:** Security  
**Where:** `src/lib/evaluate.ts` `runExpression`.

**Impact:** Breaks strict CSP; any future unsanitized rule authoring becomes code-exec. Currently rules are local JSON (lower risk) but still noisy failures.

**Fix:** Replace with a tiny expression interpreter (no `new Function`), or precompile allowlisted AST.

---

### MED-003 — Settings can’t edit full profile
**Category:** UX  
**Where:** `Settings.tsx` only edits weight + body fat; age/height/goals/training_time are read-only rows.

**Impact:** Users must re-run setup (or can’t) to change training time / goals that should drive rules.

**Fix:** Full profile editor or “Edit setup” path that reuses SetupWizard fields.

---

### MED-004 — Exercise picker dumps a very long unpaginated list
**Category:** UX / mobile  
**Where:** Training “Add Exercise” (live browser).

**Impact:** Hundreds of buttons before filters; workable with search/equipment but heavy first paint and scroll on phone.

**Fix:** Default to empty list until search ≥2 chars or equipment/muscle selected; virtualize list.

---

### MED-005 — Smoke credentials fragile for shell tooling
**Category:** Tooling / CI hygiene  
**Where:** `.env.smoke.local` passwords contain `#` and `$`.

**Impact:** Bash `source` truncates; Playwright keeps polluted env → false auth failures. CI OK if secrets injected as full env vars.

**Fix done this session:** double-quote values in `.env.smoke.local`. Document “never source”; consider password rotation without `#`.

---

### LOW-001 — No PWA / offline shell / favicon polish
Still a static GH Pages SPA without manifest/service worker.

### LOW-002 — No global focus-visible / skip-link audit pass
Status dots have text labels (good); keyboard focus styling not systematically verified.

### LOW-003 — Deploy workflow still Node 22 while PR #2 message mentioned Node 24
Minor drift only; not blocking.

### LOW-004 — Unit tests pass while printing many evaluate console.errors
Noise hides real regressions; fix HIGH-001 and assert zero trigger-eval errors in tests.

---

## What works well (keep)

- Transactional RPCs + no silent delete/insert fallback
- Auth-gated macro edge function + manual entry path + rate limit
- Lazy routes / chart split (main bundle ~half prior monolith)
- ErrorBoundary, SaveStatus, wall-clock rest timer
- History deep-link + completed-workout guard
- Strong unit + disposable-account e2e coverage for supplements/meals/catalog
- Profile ownership contract (`id` + `user_id`)
- Commercial gym catalog + equipment filters
- Pre-workout + bedtime meal slots end-to-end

---

## Recommended fix order

1. **HIGH-001** rule trigger normalization + tests (small, high coaching impact)  
2. **HIGH-002** profile-driven targets/timing (unlocks real multi-user)  
3. **MED-001** approved 5-item nav + Dashboard CTA → `/training`  
4. **HIGH-003** offline workout queue  
5. **MED-003** full profile edit  
6. **MED-002** drop `new Function`  
7. **MED-004** exercise list empty-until-filter  

---

## Testing coverage notes

**Tested:** login/logout, Home, Training blank workout save, Macros slots, unit/e2e suites, live APIs, edge function, RLS isolation (e2e).  

**Not fully browser-dogfooded this pass:** Weekly charts, AI calculate button on live UI, sleep/nutrition log forms, multi-set workout finish flow (covered partly by e2e catalog save).  

**Cleanup:** Disposable active workout created during live browser smoke was deleted via API.

---

## Appendix — gate commands

```bash
cd /c/Users/tille/fitness-activity-coach
npm run verify          # lint + typecheck + test + build
unset SMOKE_USER_*      # if shell ever sourced .env.smoke.local
npm run test:e2e        # 5 smoke tests
```
