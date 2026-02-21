# SwingTrade — Development Log

> This document tracks real development progress against the [Development Plan](./DEVELOPMENT_PLAN.md).
>
> Convention: Update this log as each task is completed. Include date, what was done, and any deviations from the plan.

---

## Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Core Features | COMPLETE (pre-existing) |
| 2 | Auth — Dependencies & Configuration | Not started |
| 3 | Auth — Backend Auth Module | Not started |
| 4 | Auth — Server Integration | Not started |
| 5 | Auth — Frontend Auth | Not started |
| 6 | Auth — Validation & Testing | Not started |
| 7 | Staging Environment | Not started |
| 8 | Testing & Hardening | Not started |
| 9 | Production Deploy | Not started |

---

## Phase 1: Core Features — COMPLETE (Pre-existing)

All core features were built before this tracking document was created. See DEVELOPMENT_PLAN.md Phase 1 for full list.

---

## Phase 2: Auth — Dependencies & Configuration

### Task 2.1 — Install `jose` and `cookie-parser`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 2.2 — Add auth env vars to `.env.example`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 2.3 — Add `VITE_MEMBER_PORTAL_URL` to frontend env
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 2.4 — Add startup validation (always fail-fast if auth vars missing)
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 3: Auth — Backend Auth Module

### Task 3.1 — Create `server/auth.js` with `handleAuthHandoff`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 3.2 — Implement `requireAuth` middleware
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 3.3 — Export auth constants
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 4: Auth — Server Integration

### Task 4.1 — Add `cookie-parser` middleware
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 4.2 — Restrict CORS to `MEMBER_PORTAL_URL`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 4.3 — Register `GET /auth/handoff` route
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 4.4 — Apply `requireAuth` to `/api/*` routes
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 4.5 — Refactor cron jobs to call service functions directly
- **Status:** Pending
- **Date:**
- **Notes:** Critical — current cron jobs use internal HTTP calls that will fail with 401 once auth is enabled. Must refactor to bypass HTTP layer (same pattern as OptionStrategy).

---

## Phase 5: Auth — Frontend Auth

### Task 5.1 — Create `apiFetch` wrapper with credentials
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.2 — Add 401 → portal redirect
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.3 — Update all fetch calls to use `apiFetch`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.4 — Add `vite-env.d.ts` for Vite env types
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 6: Auth — Validation & Testing

### Task 6.1 — Startup validation test (missing vars → server refuses to start)
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 6.2 — Handoff flow test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 6.3 — Auth middleware test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 6.4 — Tier rejection test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 6.5 — Service mismatch test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 6.6 — Frontend 401 redirect test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 6.7 — Health check accessibility test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 6.8 — Cron jobs run correctly with auth enabled
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 7: Staging Environment

### Task 7.1–7.6
- **Status:** Pending
- **Date:**
- **Notes:** See DEVELOPMENT_PLAN.md for full task list.

---

## Phase 8: Testing & Hardening

### Task 8.1–8.5
- **Status:** Pending
- **Date:**
- **Notes:** See DEVELOPMENT_PLAN.md for full task list.

---

## Phase 9: Production Deploy

### Task 9.1–9.4
- **Status:** Pending
- **Date:**
- **Notes:** See DEVELOPMENT_PLAN.md for full task list.

---

## Deviations & Decisions

### 2026-02-21 — Plan alignment with OptionStrategy
After comparing with OptionStrategy's DEVELOPMENT_PLAN.md, the following gaps were identified and addressed:
1. **Cron job refactoring task added (4.5)** — internal HTTP calls will break under auth; must call service functions directly
2. **`vite-env.d.ts` task added (5.4)** — TypeScript type declarations for Vite env vars
3. **Phases 7-9 added** — Staging, Testing & Hardening, Production Deploy (was: auth-only plan)
4. **Phase numbering shifted** — Phase 1 now covers pre-existing core features; auth starts at Phase 2
5. **Cron validation test added (6.8)** — verify cron jobs work post-auth

### 2026-02-21 — Auth always required (no dev/prod distinction)
Removed optional dev mode for auth. Auth is always required — server fails fast if env vars are missing, regardless of environment. No shortcuts. Local development must use real or test auth secrets. This diverges from OptionStrategy (which has optional auth in dev) — OptionStrategy should update to match.

---

## Reference Links

- [Development Plan](./DEVELOPMENT_PLAN.md)
- [Implementation Spec](./SUB_PORTAL_AUTH_IMPLEMENTATION.md)
- [Golden Doc — Unified Auth Strategy](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
- [Cross-Project Discrepancies](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md)
- [OptionStrategy Development Plan](https://github.com/schiang418/OptionStrategy/blob/claude/option-income-strategy-app-xtFx9/docs/DEVELOPMENT_PLAN.md)

---

**Last updated:** 2026-02-21
