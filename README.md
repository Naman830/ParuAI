<div align="center">

# ParuAI

**Describe a website in plain English. Get a live, editable page back.**

[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-B73CFE?logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/Tests-218_passing-2ea44f?logo=vitest&logoColor=white)](server/lib)

</div>

ParuAI is an AI website builder. You type a prompt, a language model generates a single standalone HTML file (styled with Tailwind via CDN), and you watch it stream into a live preview. From there you can click any element to edit it visually, hand-edit the code in a built-in editor, iterate by chat, run an SEO/accessibility audit, roll back to any previous version, publish to a public gallery, or download `index.html` and host it anywhere.

---

## ⚠️ Known Limitations

**Website generation is slow — and that is expected.** The project currently runs on a **free AI model** (via OpenRouter). Free models are shared by many people at once, so requests wait in line, get lower priority than paying customers, and are sometimes turned away when the service is busy. In practice this means:

- A page takes anywhere from **~40 seconds to a few minutes** to generate.
- Under heavy load, a generation may fail with a rate-limit error. Your credits are automatically refunded when this happens — just try again.
- Free models are occasionally withdrawn without notice. If *every* generation fails, the model name probably needs updating (see the tip in [Configuration](#-configuration)).

Switching to a paid API key (set `AI_RATE_LIMIT_DELAY_MS=0` and a paid `AI_MODEL`) is the single biggest speed and reliability upgrade available — no code changes required.

Other current limitations:

| Area | Status |
|---|---|
| Payments | Not implemented — credit purchases return `501`; every account starts with 20 free credits |
| Scaling | Live-preview streaming and the crash-recovery sweep assume a **single server instance** |
| Social sign-in | Fully wired, but not yet exercised against real Google/GitHub OAuth apps |
| Test coverage | 218 tests cover the pure logic; controllers, streaming, and React components are untested; no CI |

---

## ✨ Features

- **Prompt-to-website** — one prompt becomes a complete, self-contained HTML page.
- **Live streaming preview** — the page assembles itself in the preview as the model writes it, with real progress phases instead of a fake spinner.
- **Visual editor** — click any element in the preview to change its text, colors, and spacing from a side panel.
- **Code editor** — a lazy-loaded CodeMirror tab with syntax highlighting, line numbers, and search for direct HTML edits.
- **Conversational revisions** — ask for changes in chat; the model sees the current page *and* your earlier requests, so follow-ups like *"actually, darker"* resolve correctly.
- **SEO & accessibility audit** — 19 weighted checks score the page out of 100 and list exactly what is wrong; one click sends the fix list back to the model. Auditing is free.
- **Version history** — every AI revision and manual save is a snapshot you can preview and restore.
- **Publish & export** — share to a public community gallery, or download a plain `index.html` that runs anywhere.
- **Accounts & credits** — email/password and optional Google/GitHub sign-in, email verification, password reset, and a simple credit system (5 credits per generation or revision, refunded on failure).
- **Light & dark themes** — full theme toggle across the app.

---

## 🧭 How it works

1. **Describe it.** Type a prompt on the home page — e.g. *"a landing page for a coffee subscription box."*
2. **Two model calls build it.** The server first expands your prompt into a fuller design brief, then generates the actual HTML. The second call is streamed to your browser over Server-Sent Events.
3. **Preview it.** The finished page renders in a sandboxed iframe. All model output is validated and sanitized before anything is persisted.
4. **Edit it two ways.** Click-to-edit visually, or switch to the Code tab and edit the markup directly.
5. **Iterate, audit, ship.** Chat to revise, run the audit, roll back if needed, then publish or download.

---

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Client | React 19, Vite 7, TypeScript, Tailwind CSS v4, shadcn/ui, next-themes |
| Server | Express 5, TypeScript (run via `tsx`), Prisma 7, PostgreSQL |
| AI | OpenAI SDK pointed at [OpenRouter](https://openrouter.ai) (any OpenRouter model works) |
| Auth | [better-auth](https://better-auth.com) — email + password, Google/GitHub OAuth, cookie sessions |
| Email | [Brevo](https://www.brevo.com) transactional HTTP API — password reset and email verification |
| Testing | Vitest — 218 tests across the server's pure-logic modules |

> [!NOTE]
> `client/` and `server/` are two **independent** npm projects — there is no shared workspace root.

---

## 🏗️ Architecture

**Generation pipeline.** Creating a project charges 5 credits up front, responds immediately with a project ID, and generates in the background: a rate-limit pause, a prompt-enhancement call, then a streamed code-generation call. Every byte of model output passes through `server/lib/html.ts`, which strips markdown fences and chatter and validates that the result is renderable HTML before it is saved. On any failure the credits are refunded and the project is marked `failed`.

**Streaming.** `server/lib/generationStream.ts` keeps an in-memory channel per project with a per-subscriber cursor, so a browser that connects late replays the buffer and then tails live — over one code path. Frames are coalesced to ~7/s. The stream is cosmetic: the database is the only source of truth, and the client refetches the project on every terminal event.

**Crash recovery.** A startup sweep finds generations stranded by a restart, marks them failed, and refunds the credits — guarded so it can never kill a live job or refund a project whose code has since landed.

**Visual editor bridge.** A small script is injected into the preview iframe and talks to the editor panel over `postMessage`, with origin checks on both sides. Exported HTML is stripped of all editor instrumentation via a clone, so downloads are clean.

**Audit engine.** `server/lib/htmlScan.ts` + `server/lib/audit.ts` are dependency-free and pure: an offset-preserving HTML scanner feeds 19 weighted SEO/accessibility checks that sum to exactly 100. Checks that don't apply (e.g. no images on the page) are excluded from both sides of the score.

**Security posture.** The preview iframe is sandboxed without `allow-top-navigation`; every project route is ownership-scoped at the query level; public endpoints select only non-sensitive fields; unknown API routes and errors return JSON, never HTML stack traces.

---

## 🚀 Getting started

You'll need **Node 22+**, **npm 10+**, and a PostgreSQL database (a free [Neon](https://neon.tech) instance works well).

### 1. Server

```bash
cd server
cp .env.example .env       # fill in the values — see Configuration below
npm install                # postinstall runs `prisma generate` for you
npx prisma migrate deploy  # apply the schema to your database
npm run server             # → http://localhost:3000
```

### 2. Client

```bash
cd client
cp .env.example .env       # optional locally — falls back to localhost:3000
npm install
npm run dev                # → http://localhost:5173
```

Open **http://localhost:5173**, sign up, and try a prompt.

<details>
<summary><b>Useful commands</b></summary>

```bash
# server/
npm run typecheck    # tsc --noEmit — must stay at 0 errors
npm run test         # vitest run — 218 tests
npm run server       # dev server with reload

# client/
npm run build        # tsc -b && vite build — must succeed
npm run lint         # eslint . — must stay at 0
npm run dev          # dev server
```

</details>

---

## ⚙️ Configuration

All server config lives in `server/.env` (see `server/.env.example` for comments on every variable).

### Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres/Neon connection string |
| `BETTER_AUTH_SECRET` | Auth signing secret — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public URL of this API, e.g. `http://localhost:3000` |
| `TRUSTED_ORIGINS` | Comma-separated frontend origin(s), e.g. `http://localhost:5173` |
| `AI_API_KEY` | Your OpenRouter API key |

### Email (password reset & verification)

| Variable | Purpose |
|---|---|
| `BREVO_API_KEY` | Brevo API key (`xkeysib-…`) — mail is sent over Brevo's HTTPS API |
| `SMTP_FROM` | The "From" address on outgoing mail — must be a **verified sender** in Brevo |
| `CLIENT_URL` | Frontend origin used in reset links, verification callbacks, and OAuth error redirects. No trailing slash, and it must also appear in `TRUSTED_ORIGINS`. Defaults to the first `TRUSTED_ORIGINS` entry |

### Optional

| Variable | Default | Purpose |
|---|---|---|
| `AI_MODEL` | a free OpenRouter model | Generation model — swap here, never in code |
| `AI_RATE_LIMIT_DELAY_MS` | `4000` | Pause before generation to dodge free-tier rate limits; set `0` on a paid key |
| `AI_REQUEST_TIMEOUT_MS` | `300000` | Bounds a stalled provider so failures refund instead of hanging |
| `AI_STREAM_IDLE_TIMEOUT_MS` | `90000` | Aborts a streaming generation that stops producing tokens |
| `GENERATION_SWEEP_ON_BOOT` | on | Startup sweep that refunds generations killed by a restart. **Single-instance only** — set `false` before scaling out |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | unset | Enables "Sign in with Google". Set **both or neither** |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | unset | Enables "Sign in with GitHub". Set **both or neither** |
| `NODE_ENV` | — | `production` switches cookies to `Secure` + `SameSite=None` (required for cross-domain deploys) |
| `PORT` | `3000` | Never hardcode on Render — it injects its own |

The client needs one variable, in `client/.env`:

| Variable | Purpose |
|---|---|
| `VITE_BASEURL` | The API's origin, e.g. `http://localhost:3000` |

> [!TIP]
> **Free AI models are the most common source of "it's broken."** OpenRouter's `:free` models get rate-limited under load and are occasionally withdrawn without notice. If generation fails across the board, check `AI_MODEL` against the current free list before assuming a code bug:
> ```bash
> curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*:free"'
> ```

> [!NOTE]
> Mail goes over Brevo's **HTTP API**, not SMTP — Render's free tier blocks outbound SMTP ports, so an SMTP client just hangs. Leave Brevo's "Authorized IPs" setting **disabled**: Render's free-tier outbound IP isn't static, so a whitelist turns every send into `401 unauthorized`.

---

## 🔐 Enabling Google / GitHub sign-in

Social sign-in ships **disabled**: with no credentials set, the server registers no providers and the client renders no buttons. To enable it, create the OAuth apps yourself.

The redirect URI always points at **the API**, never at the client (`/api/auth` is better-auth's base path):

```
http://localhost:3000/api/auth/callback/google            # local
https://<your-api>.onrender.com/api/auth/callback/google  # production
```

<details>
<summary><b>Google setup</b></summary>

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → OAuth consent screen** → External. Scopes: `openid`, `email`, `profile` (better-auth's defaults — don't add more). While the app is in *Testing*, only accounts listed under **Test users** can sign in.
3. **Credentials → Create Credentials → OAuth client ID → Web application.**
4. Add both redirect URIs above, exactly, with no trailing slash.
5. Copy the id/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

</details>

<details>
<summary><b>GitHub setup</b></summary>

1. [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps → New OAuth App** (an *OAuth App*, not a GitHub App).
2. Authorization callback URL → the production URI above.
3. GitHub allows **one** callback URL per app, so create a **second** app for `http://localhost:3000/...` if you want local sign-in.
4. Copy the id/secret into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

</details>

> [!IMPORTANT]
> Set **both** the id and the secret for a provider, or neither. A half-configured provider still gets registered (better-auth only logs a warning), so the button appears and then dead-ends on the provider's `invalid_client` error page.

Because the client asks the API which providers are live (`GET /api/public/config`), turning a provider on is a **server restart — not a client redeploy**.

---

## ☁️ Deploying

| Piece | Host | Config |
|---|---|---|
| Client | [Vercel](https://vercel.com) | already in `client/vercel.json` (SPA rewrites + asset caching) |
| API | [Render](https://render.com) | blueprint already in `render.yaml` |
| Database | [Neon](https://neon.tech) | serverless PostgreSQL |

The short version: deploy the API first, deploy the client with `VITE_BASEURL` pointed at the API, then go back and set the API's `TRUSTED_ORIGINS` to the client's real Vercel URL and redeploy the API.

> [!IMPORTANT]
> The two halves live on different domains, so the session cookie is cross-site — that only works when both sides are HTTPS, `NODE_ENV=production` is set on the API, and each side correctly names the other. Rotate `BETTER_AUTH_SECRET` for production rather than reusing your local one. `VITE_BASEURL` is inlined at **build** time — changing it requires a client redeploy, not a restart.

> [!WARNING]
> Run database migrations with `npx prisma migrate deploy` only — **never** `migrate dev` or `migrate reset` against a live database.

---

## 📁 Project layout

```
client/                    # Vite SPA
  src/
    pages/                 # Home, Projects (builder), Community, Settings, ...
    components/
      home/                # landing page sections
      projects/            # builder UI: chat sidebar, iframe preview, element editor,
                           #   code editor (lazy-loaded CodeMirror), audit panel
      ui/                  # shadcn primitives
    lib/, configs/, types/ # auth client, axios instance, shared types

server/                    # Express API
  configs/openai.ts        # the only place AI model/timeout config lives
  controllers/             # project creation, revisions, publishing, credits, audit
  lib/html.ts              # extracts and validates raw HTML from model output
  lib/htmlScan.ts          # dependency-free, offset-preserving HTML scanner
  lib/audit.ts             # 19 weighted SEO/accessibility checks + fix-prompt builder
  lib/conversation.ts      # assistant message catalog + revision-history filter
  lib/generationStream.ts  # live-preview SSE channels
  lib/aiStream.ts          # streamed model completions + idle watchdog
  lib/auth.ts              # better-auth setup (sessions, reset, verification, OAuth)
  lib/email.ts             # Brevo HTTP sender — the only email path in the repo
  prisma/schema.prisma     # User, WebsiteProject, Conversation, Version, ...

render.yaml                # Render deployment blueprint for the API
```

---

## 🧪 Testing & quality

- **218 Vitest tests** across four server suites: HTML extraction (`lib/html.test.ts`), conversation filtering (`lib/conversation.test.ts`), the HTML scanner (`lib/htmlScan.test.ts`), and the audit engine (`lib/audit.test.ts`).
- Enforced baselines: server `tsc` at 0 errors, client `tsc` at 0 errors, ESLint at 0 problems, and a clean `vite build`.
- The audit weights are themselves under test — the 19 checks are asserted to sum to exactly 100.

---

## 📄 License

No license file is currently included — treat this as all-rights-reserved unless the repository owner specifies otherwise.
