# SwingTrade Authentication — Development Log

> This document tracks real development progress against the [Development Plan](./DEVELOPMENT_PLAN.md).
>
> Convention: Update this log as each task is completed. Include date, what was done, and any deviations from the plan.

---

## Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Dependencies & Configuration | Not started |
| 2 | Backend Auth Module | Not started |
| 3 | Server Integration | Not started |
| 4 | Frontend Auth | Not started |
| 5 | Validation & Testing | Not started |

---

## Phase 1: Dependencies & Configuration

### Task 1.1 — Install `jose` and `cookie-parser`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 1.2 — Add auth env vars to `.env.example`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 1.3 — Add `VITE_MEMBER_PORTAL_URL` to frontend env
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 1.4 — Add startup validation for required auth env vars
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 2: Backend Auth Module

### Task 2.1 — Create `server/auth.js` with `handleAuthHandoff`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 2.2 — Implement `requireAuth` middleware
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 2.3 — Export auth constants
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 3: Server Integration

### Task 3.1 — Add `cookie-parser` middleware
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 3.2 — Restrict CORS to `MEMBER_PORTAL_URL`
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 3.3 — Register `GET /auth/handoff` route
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 3.4 — Apply `requireAuth` to `/api/*` routes
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 4: Frontend Auth

### Task 4.1 — Create `apiFetch` wrapper with credentials
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 4.2 — Add 401 → portal redirect
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 4.3 — Update all fetch calls to use `apiFetch`
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Phase 5: Validation & Testing

### Task 5.1 — Startup validation test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.2 — Handoff flow test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.3 — Auth middleware test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.4 — Tier rejection test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.5 — Service mismatch test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.6 — Frontend 401 redirect test
- **Status:** Pending
- **Date:**
- **Notes:**

### Task 5.7 — Health check accessibility test
- **Status:** Pending
- **Date:**
- **Notes:**

---

## Deviations & Decisions

> Record any deviations from the plan or architectural decisions made during development.

_(none yet)_

---

## Reference Links

- [Development Plan](./DEVELOPMENT_PLAN.md)
- [Implementation Spec](./SUB_PORTAL_AUTH_IMPLEMENTATION.md)
- [Golden Doc — Unified Auth Strategy](https://github.com/schiang418/cyclescope-doc/blob/main/docs/UNIFIED_AUTH_STRATEGY.md)
- [Cross-Project Discrepancies](https://github.com/schiang418/cyclescope-doc/blob/main/docs/CROSS_PROJECT_DISCREPANCIES.md)

---

**Last updated:** 2026-02-21
