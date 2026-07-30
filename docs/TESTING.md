# ParuAI — End-to-End Audit & Testing Report

**Scope:** Full-stack security, functional, integration, and resilience audit of the ParuAI
AI website builder (React SPA client + Express/Prisma API).
**Method:** Isolated local environment, black-box API testing, real-browser end-to-end
testing (Playwright/Chromium), adversarial attack simulation, and deterministic race-condition
reproduction. Every finding was fixed and re-verified with no regressions to the project's five
green baselines.

**Final status: ✅ Production-ready.** 1 critical, 1 high, and 3 medium/low issues were found,
fixed, and re-verified. No known critical or high-severity defects remain. All baselines green.

---

## 1. Testing strategy

### 1.1 Environment isolation

The configured `DATABASE_URL` points at a **live Neon database** holding real user sessions and
generated sites, so no destructive testing was run against it. A fully isolated environment was
stood up instead:

| Layer | Setup |
|---|---|
| Database | Throwaway **PostgreSQL 18 in Docker** (`paruai-testdb`, port 55432). All three Prisma migrations applied via `prisma migrate deploy`. Neon never touched. |
| API | `tsx server.ts` on port **3100**, pointed at the test DB via shell-env overrides (`dotenv` does not override existing `process.env`, so the real AI/email keys still load while the DB, port, origins, and secret are swapped). |
| Client | Vite dev server on **5173**, `VITE_BASEURL=http://localhost:3100`. |
| Browser | **Playwright + Chromium** (installed in a scratchpad project, not added to the repo, to keep the audit diff focused on fixes). |

Cross-origin cookie flow works because `localhost:5173` and `localhost:3100` are the same *site*
(port is not part of a site), so `SameSite=Lax` cookies flow in dev exactly as they must.

### 1.2 Test dimensions covered

- **Authentication** — sign-up, sign-in, sign-out, session validation, wrong-password rejection,
  cookie flags, session tampering (both API and real-UI form submission).
- **Authorization / IDOR** — every owner-scoped route exercised as owner (must pass) and as a
  second account (must 404).
- **Input validation** — empty/missing/malformed/oversized bodies, wrong types, on every write endpoint.
- **Data integrity** — credit charge/refund correctness, atomic charging under concurrency,
  version/rollback state, publish state.
- **Security / attack vectors** — stored-XSS via the community gallery (iframe sandbox escape),
  SQL injection, session forgery, CORS, the hosted admin plugin, credentialed cross-frame exfiltration,
  rate limiting, information disclosure.
- **Live AI pipeline** — real end-to-end generations through OpenRouter (enhance → generate →
  extract → persist), including the streaming path.
- **Browser E2E** — visual editor click-to-select and update round-trip, CodeMirror Code tab,
  tab-switch iframe stability, responsiveness across mobile/tablet/desktop.

### 1.3 AI-call budget

Per the agreed plan, the live AI path was validated with a **small number of real generations**
(4 real generations + 2 real revisions completed successfully during testing, e.g. a 20,756-byte
and a 21,247-byte page), while failure/edge cases were exercised deterministically to avoid
free-tier rate limits and cost.

---

## 2. Test cases executed

### 2.1 Authentication & session (all ✅)

| Case | Expected | Result |
|---|---|---|
| Sign-up user A / user B (API) | 200 + session cookie | ✅ credits default 20 |
| Sign-up / sign-in via **real UI forms** | session established | ✅ PASS |
| Wrong password (UI) | rejected, no session | ✅ PASS |
| Tampered session cookie | 401 | ✅ |
| No cookie on protected route | 401 | ✅ |
| Cookie flags (dev) | `HttpOnly; SameSite=Lax`, no `Secure` | ✅ correct |
| CORS allowed origin | `Access-Control-Allow-Origin: 5173` | ✅ |
| CORS disallowed origin (`evil.com`) | no ACAO header | ✅ |

### 2.2 Authorization / IDOR — 13 protected routes (all ✅)

- **Unauthenticated:** all 13 protected endpoints return **401**; the two public endpoints
  (`/api/project/published`, `/api/public/config`) return **200**; unknown `/api/*` returns **JSON 404**.
- **Cross-user (attacker "Bob" vs owner "Alice"):** `get project`, `preview`, `preview?versionId`,
  `audit`, `publish-toggle`, `rollback`, `save`, `revision`, `delete`, and `stream` **all return 404**
  for the non-owner. Owner's data verified intact after every attack.

### 2.3 Input validation & write paths (all ✅ after fixes — see §3)

- `createUserProject`: empty/whitespace/number/array/`{}` prompt → 400; no body / malformed JSON /
  no Content-Type → **400** (was 500); oversized (>50 MB) → **413** (was 500).
- `makeRevision`: empty message → 400; revise before generation done → **409**; no body → 400.
- `saveProjectCode`: empty code → 400; non-HTML "just text" → 400; valid HTML → 200 (+ new version).
- `rollback`: valid version → 200 (current_code swaps); nonexistent version → 404.
- `publish-toggle`: ready project → 200; unfinished project → 400.

### 2.4 Data integrity (all ✅)

- **Credit charge/refund:** create charges 5; failed generation refunds 5; failed revision refunds 5
  (verified live — credits returned to 20 after an upstream AI failure).
- **Published endpoint privacy:** `/api/project/published` exposes `user: { name }` **only** — no
  email present anywhere in the payload (the documented invariant holds).
- **Rollback:** restores the exact target snapshot; sidebar version list preserved.

### 2.5 SSE generation stream (all ✅)

- Ready project → immediate `{"type":"done","status":"ready"}` and socket closes.
- Stranded (pending) project → on-demand sweep marks it `failed`, refunds, and the stream emits a
  `failed` terminal frame.
- Unauthenticated / non-owner stream → 401 / 404 **before** any header flush (no hung socket).

### 2.6 Browser E2E (all ✅)

| Case | Result |
|---|---|
| Visual editor **click-to-select** (iframe → "Edit Element" panel) | ✅ PASS |
| Visual editor **text update** (panel → iframe innerText) | ✅ PASS |
| Visual editor **style update** (font-size → computed style) | ✅ PASS |
| Selection outline applied in iframe | ✅ PASS |
| **Code tab** — CodeMirror lazy-mounts | ✅ PASS |
| Preview iframe **survives tab switch** (not reparented/reloaded) | ✅ PASS |
| Console errors during builder session | ✅ none |
| Responsiveness (`/`, `/pricing`, `/community`, `/contact`, `/auth/sign-in` at 375/768/1440) | ✅ no horizontal overflow, no page errors |

These close the previously "browser-unverified" items (tech-debt #5, #15).

### 2.7 Live AI pipeline (✅)

- Multiple real generations completed (20 KB+ documents) — enhance → stream → `extractHtml` →
  `Version` → `current_code`/`ready` all correct.
- A malicious SQL-injection string used as a prompt was safely treated as page content (no injection),
  and still produced a valid site.
- One real revision completed the full happy path (charge 5 → generate → new version → `ready`).

---

## 3. Bugs found, root causes, and fixes

### 🔴 FINDING 1 — Critical: Stored-XSS / account-data theft via the community gallery (iframe sandbox escape)

**Severity:** Critical (stored XSS, cross-user data theft, actions-as-victim).

**Where:** `client/src/pages/View.tsx`, `client/src/pages/Community.tsx`,
`client/src/pages/MyProjects.tsx`, and `client/src/components/projects/ProjectPreview.tsx` —
every place that rendered a project's `current_code` in a `srcDoc` iframe used
`sandbox="allow-scripts allow-same-origin"`.

**Root cause:** For a `srcDoc` iframe, `allow-same-origin` makes the framed document run in the
**parent app's own origin**. Combined with `allow-scripts`, any published site's own `<script>`
could reach `window.parent`, read the app DOM, and issue **credentialed** `fetch` calls to the API
as whoever was viewing the page. Because `/view/:id` and `/community` render **other users'**
published HTML to a viewer, this is a stored-XSS-equivalent: an attacker publishes a "website" to
the gallery, a logged-in victim opens it, and the attacker's script runs with the victim's session.

**Proof (real browser, before fix):** A malicious published project was opened by logged-in victim "Bob":
```
LOOT: PARENT_HREF=http://localhost:5173/view/<id> | PARENT_TITLE=ParuAI - Build the future
    | VICTIM_CREDITS={"credits":20} | VICTIM_PROJECT_COUNT=0
SANDBOX_ESCAPED: true
```
The framed script read the parent app and **exfiltrated the victim's account data via a credentialed
API call**.

**Fix:** `allow-same-origin` is now granted **only** in the builder, where `getCode()` and the
streaming `document.write` legitimately need `contentDocument` (and where the code being rendered is
the owner's own). For all public/untrusted renders — `View`, `Preview`, `Community`, `MyProjects`
thumbnails — the flag is dropped, forcing an **opaque origin**: the page still runs its own scripts
but cannot touch the app, its cookies, or the API. `ProjectPreview` now computes its sandbox from the
existing `showEditorPanel` prop, so builder behavior is unchanged.

**Proof (real browser, after fix):**
```
LOOT: parent_loc_blocked:SecurityError | parent_doc_blocked:SecurityError
    | credits_blocked:TypeError | projects_blocked:TypeError
SANDBOX_ESCAPED: false
```
The escape and every exfiltration attempt are blocked; published pages still render.

---

### 🟠 FINDING 2 — High: Credit balance can go negative (TOCTOU race → free generations)

**Severity:** High (economic bypass / billing integrity).

**Where:** `server/controllers/userController.ts::createUserProject` and
`server/controllers/projectController.ts::makeRevision`.

**Root cause:** Both charged credits with a non-atomic **check-then-decrement**: a `findUnique`
reads the balance, an `if (credits < cost)` gate passes, then a separate `update` decrements.
Under concurrency, N simultaneous requests all read the same balance, all pass the gate, and all
decrement — driving the balance negative and performing N charges' worth of work for one charge's
worth of credits.

**Proof (deterministic replay of the exact two operations):**
```
charges that 'succeeded': 5 (should be at most 1)
final credits: -20 (should be 0, never negative)
```
Five concurrent charges against a 5-credit balance all succeeded, leaving credits at **-20**.

**Fix:** Replaced check-then-decrement with a single **atomic conditional decrement** —
`updateMany({ where: { id, credits: { gte: cost } }, data: { credits: { decrement: cost } } })` —
and gate on the returned `count`. At most `floor(balance/cost)` concurrent charges can succeed and
the balance can never fall below zero. In `createUserProject` the charge now precedes project
creation and is **rolled back if the insert fails**; in `makeRevision` the charge precedes the
user-message write so a lost race leaves no orphaned prompt.

**Proof (live API, after fix):**
```
5 concurrent creates on a 5-credit balance → one 200 + four 403
Alice credits after: {"credits":0}   (never negative)
```

---

### 🟡 FINDING 3 — Medium: Client errors returned as HTTP 500 with internal error text leaked

**Severity:** Medium (incorrect status codes + information disclosure).

**Where:** `createUserProject`, `makeRevision`, `saveProjectCode`, and the final error handler in
`server/server.ts`.

**Root cause:** Two issues. (a) Handlers destructured `req.body` directly; a missing or non-JSON
body makes `req.body` `undefined`, so `const { x } = req.body` threw a `TypeError` surfaced as a
**500** with the message *"Cannot destructure property 'x' of 'req.body' as it is undefined."*
(b) The final error handler always returned `500` and echoed `err.message`, so body-parser's
malformed-JSON error (status 400) and over-limit error (status 413) both became **500s** leaking
parser internals.

**Proof (before fix):**
```
create no body     → 500 "Cannot destructure property 'initial_prompt'…"
create malformed   → 500 "Expected property name or '}' in JSON…"
oversized body     → 500 "request entity too large"
```

**Fix:** Guarded every body destructure with `req.body ?? {}`, and taught the final error handler to
honour `err.status`/`err.statusCode` (surfacing 400/413 for client errors) while returning a generic
`"Internal Server Error"` for genuine 500s instead of leaking internal text.

**Proof (after fix):** `create no body → 400`, `malformed → 400`, `oversized → 413`, revision/save
no body → 400.

---

### 🟡 FINDING 4 — Medium: Revision failures leaked the upstream AI provider error

**Severity:** Medium (information disclosure + poor UX; frequently hit).

**Where:** `server/controllers/projectController.ts::makeRevision` catch block.

**Root cause:** On any generation failure the handler returned `res.status(500).json({ message: error.message })`.
Because ~1/3 of free-tier revisions fail with a raw provider error, users routinely saw text like
`"Upstream error from Nvidia: ResourceExhausted: Worker local total request limit reached (33/32)"` —
disclosing the model backend and reading as a scary bug.

**Proof (before fix):**
```
{"message":"Upstream error from Nvidia: ResourceExhausted…"}  HTTP 500
credits after: 20   (refund path worked, but message leaked)
```

**Fix:** The catch now returns a clean, actionable message
(*"We couldn't generate your changes right now. Your credits were refunded — please try again."*)
and no longer surfaces `error.message`. The credit-refund path was already correct and is unchanged.

---

### 🔵 FINDING 5 — Hardening: No rate limiting on authentication / email endpoints

**Severity:** Low/hardening (brute-force + email-flood exposure).

**Where:** The entire `/api/auth/*` surface had no throttling.

**Root cause:** better-auth's rate limiter was not configured. `/sign-in/email` was open to online
password guessing, and `/forget-password` could be looped to flood a victim's inbox and burn the
free-tier Brevo quota (each call to a real address triggers a send), while also acting as an
account-enumeration oracle.

**Fix:** Enabled better-auth's built-in rate limiting in `server/lib/auth.ts` — a global
100-req/60 s default plus stricter custom rules: `/sign-in/email` 10/60 s, `/sign-up/email` 10/60 s,
`/forget-password` 3/60 s, `/reset-password` 5/60 s. No new dependency; memory store matches the
app's documented single-instance deployment.

**Proof (after fix):**
```
forget-password: 404, 404, 404, 429, 429      (custom 3/60s enforced)
sign-in/email:   401, 401, 401, 429, 429, …    (limit enforced)
```

---

## 4. Security checks summary

| Check | Result |
|---|---|
| Stored XSS / iframe sandbox escape (community gallery) | 🔴 Found → **Fixed & re-verified** |
| Credentialed cross-frame data exfiltration | 🔴 Found (same root cause) → **Fixed** |
| Credit TOCTOU race / negative balance | 🟠 Found → **Fixed & re-verified** |
| Client-error 500s + internal message disclosure | 🟡 Found → **Fixed** |
| Upstream provider error disclosure | 🟡 Found → **Fixed** |
| Auth/email rate limiting | 🔵 Added |
| SQL injection (Prisma parameterization) | ✅ Not exploitable (table intact after `'; DROP TABLE "user"; --`) |
| Session forgery / tampering | ✅ Rejected (401) |
| IDOR across all owner-scoped routes | ✅ Not exploitable (404) |
| CORS origin enforcement | ✅ Correct (allow-list, credentials) |
| Cross-domain mutation origin check (`delete-user`) | ✅ 403 `INVALID_ORIGIN` on foreign origin |
| Hosted admin plugin (`/api/auth/dash/*`) | ✅ Gated — 401 "Invalid API key" unauthenticated |
| Published-endpoint email leak | ✅ Not present (name only) |
| Session cookie flags | ✅ `HttpOnly`, `SameSite` env-correct, `Secure` in prod |

---

## 5. Performance checks

- **Generation latency:** Real generations took ~seconds to tens of seconds per call on the free
  tier (as documented). This is provider-bound, not an app defect. The streamed preview + real
  progress readout keep the UX responsive during the wait.
- **Poll payload discipline:** `GET /api/user/project/:id` continues to omit `Version.code` (verified),
  keeping the 10 s poll cheap.
- **SSE coalescing:** frames are batched on a 150 ms tick (verified by design/read); per-token writes
  are never emitted.
- **Responsiveness:** no horizontal overflow at 375 / 768 / 1440 px on any audited page.
- **Client bundle:** ~1.04 MB main chunk (325 KB gzip) + 577 KB lazy CodeMirror chunk. Vite's
  500 KB warning fires as expected. This is **documented, intentional tech debt** (out of the agreed
  fix scope) — see §7.

---

## 6. Regression testing summary

All five project baselines were **green before** changes and **remain green after** every fix:

| Baseline | Before | After |
|---|---|---|
| `server` `tsc --noEmit` | 0 errors | ✅ 0 errors |
| `server` `vitest run` | 218 passed | ✅ 218 passed |
| `client` `tsc -b` | 0 errors | ✅ 0 errors |
| `client` `eslint .` | 0 problems | ✅ 0 problems |
| `client` `vite build` | succeeds | ✅ succeeds |

Additional regression evidence: after the client sandbox change, the builder's own preview still
works (visual editor click-to-select, `getCode()`/`contentDocument` access, tab switching all
PASS in-browser), confirming `allow-same-origin` is still present exactly where the builder needs it.
After the atomic-charge reorder, a real revision completed the full happy path (charge → generate →
new version → `ready`), and a failed revision correctly refunded.

**Files changed (6):**
```
client/src/components/projects/ProjectPreview.tsx   (conditional iframe sandbox)
client/src/pages/Community.tsx                       (drop allow-same-origin on UGC thumbnail)
client/src/pages/MyProjects.tsx                      (drop allow-same-origin on thumbnail)
server/controllers/userController.ts                (body guard + atomic charge + refund-on-insert)
server/controllers/projectController.ts             (body guard + atomic charge + clean failure msg)
server/lib/auth.ts                                  (auth/email rate limiting)
server/server.ts                                    (error handler honours status, hides 500 internals)
```

---

## 7. Remaining limitations (out of agreed scope / provider-bound)

These are **documented, non-blocking** items — pre-existing tech debt intentionally left per the
"bugs + security hardening" scope, or environmental constraints:

1. **Client bundle is not code-split** (~1 MB main chunk). Pure performance debt; Vite warns on build.
2. **No CI workflow.** Test coverage is strong for pure functions (218 tests) but controllers, the
   SSE registry, and React components have no automated tests, and nothing runs the suite on push.
3. **Monetization is a shell** — `purchaseCredits` returns 501, `Transaction` is never written,
   pricing/contact have no handlers. Intentional; unchanged.
4. **Rate limiting and the generation sweep are single-instance** (in-memory). Correct for the
   documented Render free-tier deployment; both need a shared store (Redis/DB) before scaling out.
5. **Free-tier AI reliability** — ~1/3 of generations fail with upstream rate limits and each call
   takes tens of seconds. Provider-bound; the app degrades gracefully (refund + clean message). A
   paid key is the single biggest reliability upgrade.
6. **Malformed-JSON responses now return 400 with the parser's own message** (e.g. "Expected property
   name…"). This is a client error, not internal server state, and is standard API behavior — kept
   for API-consumer clarity rather than genericized.
7. **Social sign-in / email verification** were not exercised against real Google/GitHub/Brevo in this
   audit (no OAuth apps configured); the conditional-registration and config-degradation logic was
   verified locally (`/api/public/config` correctly reports `[]`).

---

## 8. Final production-readiness status

**✅ Production-ready.**

- The **critical** stored-XSS / account-data-theft vector in the community gallery is closed and
  re-verified in a real browser.
- The **high-severity** credit-integrity race is closed with an atomic charge and re-verified live.
- Input handling, information disclosure, and auth abuse surfaces are hardened.
- All authentication, authorization, ownership, validation, data-integrity, and SSE behaviors pass.
- The visual editor, Code tab, live AI generation, and responsiveness are verified end-to-end in a
  real browser for the first time.
- All five build/test/lint baselines remain green; no regressions were introduced.

The remaining limitations in §7 are known tech debt or provider constraints; none is a blocker for
deploying the current feature set. The highest-value next steps are a **paid AI key** (reliability),
**CI** running the existing suite, and a **shared rate-limit/sweep store** before horizontal scaling.

---

*Audit performed against an isolated Dockerized Postgres and local client/API, with real-browser
verification via Playwright/Chromium. The live Neon database and production deployment were not
modified.*
