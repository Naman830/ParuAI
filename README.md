<div align="center">

# ✨ ParuAI

### Describe a website in plain English. Get a live, editable page back.

[![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-B73CFE?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

</div>

<br>

<div align="center">
<table>
<tr>
<td align="center" width="20%">💬<br><b>Prompt</b><br><sub>describe the site</sub></td>
<td align="center">➜</td>
<td align="center" width="20%">🤖<br><b>Generate</b><br><sub>LLM writes the HTML</sub></td>
<td align="center">➜</td>
<td align="center" width="20%">🖱️<br><b>Edit</b><br><sub>click any element</sub></td>
<td align="center">➜</td>
<td align="center" width="20%">🚀<br><b>Publish</b><br><sub>share or download</sub></td>
</tr>
</table>
</div>

<br>

ParuAI is an AI website builder: you type a prompt, an LLM generates a single
standalone HTML file (styled with Tailwind via CDN), and you preview it live,
click-to-edit individual elements, chat to revise it, roll back to any
previous version, publish it to a public gallery, or download `index.html`
and host it anywhere.

---

## 🧭 How it works

| Step | What happens |
|:---:|---|
| 1️⃣ | **Describe it** — type a prompt on the home page, e.g. *"a landing page for a coffee subscription box"*. |
| 2️⃣ | **Watch it get built** — the server calls an LLM twice: once to expand your prompt into a fuller spec, once to generate the actual HTML. The second call is **streamed to your browser**, so you watch the page assemble itself instead of staring at a spinner. Takes ~40 seconds to a few minutes depending on the model. |
| 3️⃣ | **Preview it** — the finished page renders live in a sandboxed iframe. |
| 4️⃣ | **Edit it two ways** — click any element to change its text, colour or spacing from the side panel, or switch to the **Code tab** and hand-edit the HTML directly with syntax highlighting, line numbers and search. |
| 5️⃣ | **Iterate by chat** — ask for changes ("make the header sticky", "swap the colour scheme to green") and a new version is generated using the current page *and your earlier requests* as context, so follow-ups like *"actually darker"* resolve correctly. |
| 6️⃣ | **Audit it** — a built-in SEO + accessibility check scores the page out of 100 across 19 rules and lists exactly what is wrong. One click sends the fix list back to the model. |
| 7️⃣ | **Roll back, publish, or download** — every revision is saved as a version you can restore. Publish to the community gallery, or download a plain `index.html` you can host anywhere. |

---

## 🧱 Tech stack

<table>
<tr><th align="left">🎨 Client</th><td>React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui · better-auth · next-themes (light/dark)</td></tr>
<tr><th align="left">⚙️ Server</th><td>Express 5 · TypeScript (via <code>tsx</code>) · Prisma · PostgreSQL</td></tr>
<tr><th align="left">🧠 AI</th><td>OpenAI SDK pointed at <a href="https://openrouter.ai">OpenRouter</a></td></tr>
<tr><th align="left">🔐 Auth</th><td>better-auth — email + password, cookie sessions</td></tr>
<tr><th align="left">✉️ Email</th><td><a href="https://www.brevo.com">Brevo</a> transactional HTTP API — password-reset links only</td></tr>
</table>

> [!NOTE]
> The project is two **independent** npm projects, `client/` and `server/` — there is no shared workspace root.

---

## 🚀 Getting started

You'll need **Node 22+**, **npm 10+**, and a PostgreSQL database (a free [Neon](https://neon.tech) instance works great).

### 1️⃣ Server

```bash
cd server
cp .env.example .env      # fill in the values — see Configuration below
npm install                # postinstall runs `prisma generate` for you
npx prisma migrate deploy  # apply the schema to your database
npm run server              # → http://localhost:3000
```

### 2️⃣ Client

```bash
cd client
cp .env.example .env       # optional locally — falls back to localhost:3000
npm install
npm run dev                 # → http://localhost:5173
```

Open **http://localhost:5173**, sign up, and try a prompt. 🎉

<details>
<summary><b>🔧 Useful commands</b></summary>

```bash
# server/
npm run typecheck   # tsc --noEmit — must stay at 0 errors
npm run test         # vitest run
npm run server       # dev server with reload

# client/
npm run build        # tsc -b && vite build — must succeed
npm run lint          # eslint . — must stay at 0
npm run dev            # dev server
```

</details>

---

## ⚙️ Configuration

All server config lives in `server/.env` (see `server/.env.example` for full comments on every variable).

| Variable | Purpose |
|---|---|
| 🗄️ `DATABASE_URL` | Postgres/Neon connection string |
| 🔑 `BETTER_AUTH_SECRET` | Auth signing secret — generate with `openssl rand -base64 32` |
| 🌐 `BETTER_AUTH_URL` | Public URL of this API |
| ✅ `TRUSTED_ORIGINS` | Comma-separated frontend origin(s), e.g. `http://localhost:5173` |
| 🧠 `AI_API_KEY` | Your OpenRouter API key |
| 🤖 `AI_MODEL` | Generation model — defaults to a free OpenRouter model |
| ✉️ `BREVO_API_KEY` | Brevo API key (`xkeysib-…`) — sends password-reset **and email-verification** mail over HTTPS |
| 📮 `SMTP_FROM` | The "From" address on outgoing mail — must be a **verified sender** in Brevo |
| 🔗 `CLIENT_URL` | Frontend origin used to build the reset-password link, the email-verification callback and the OAuth error redirect. **No trailing slash, and it must also appear in `TRUSTED_ORIGINS`** or verification links are rejected with `403 INVALID_CALLBACK_URL`. Defaults to the first `TRUSTED_ORIGINS` entry |
| 🔓 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — enables "Sign in with Google". **Set both or neither** |
| 🐙 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional — enables "Sign in with GitHub". **Set both or neither** |
| ⏱️ `AI_STREAM_IDLE_TIMEOUT_MS` | Optional (90000) — aborts a streaming generation that stops producing tokens, so it reaches the refund path instead of hanging |
| 🧹 `GENERATION_SWEEP_ON_BOOT` | Optional (on) — on startup, refunds and marks failed any generation killed by a restart. **Single-instance only**; set `false` before scaling out |

The client only needs one variable, in `client/.env`:

| Variable | Purpose |
|---|---|
| 🌐 `VITE_BASEURL` | The API's origin, e.g. `http://localhost:3000` |

> [!TIP]
> **Free AI models are the most common source of "it's broken."** OpenRouter's `:free` models get rate-limited under load and are occasionally withdrawn without notice. If generation starts failing across the board, check `AI_MODEL` against OpenRouter's current free model list before assuming a code bug:
> ```bash
> curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*:free"'
> ```

> [!NOTE]
> Password-reset and verification mail go over Brevo's **HTTP API**, not SMTP — Render's free tier blocks outbound SMTP ports, so an SMTP client just hangs. Leave Brevo's "Authorized IPs" setting **disabled**: Render's free-tier outbound IP isn't static, so a whitelist turns every send into `401 unauthorized`.

---

## 🔓 Enabling Google / GitHub sign-in

Social sign-in is wired up but **ships disabled** — with no credentials set, the server registers no providers and the client renders no buttons. You need to create the OAuth apps yourself.

The redirect URI always points at **the API**, never at the client, and `/api/auth` is better-auth's base path:

```
http://localhost:3000/api/auth/callback/google          # local
https://<your-api>.onrender.com/api/auth/callback/google # production
```

<table>
<tr><th align="left">Google</th><td>

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → OAuth consent screen** → External. Scopes: `openid`, `email`, `profile` (better-auth's defaults — don't add more). While the app is in *Testing*, only accounts listed under **Test users** can sign in.
3. **Credentials → Create Credentials → OAuth client ID → Web application.**
4. Add both redirect URIs above, exactly, with no trailing slash.
5. Copy the id/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

</td></tr>
<tr><th align="left">GitHub</th><td>

1. [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps → New OAuth App** (an *OAuth App*, not a GitHub App).
2. Authorization callback URL → the production URI above.
3. GitHub allows **one** callback URL per app, so create a **second** app for `http://localhost:3000/...` if you want local sign-in.
4. Copy the id/secret into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

</td></tr>
</table>

> [!IMPORTANT]
> Set **both** the id and the secret for a provider, or neither. A half-configured provider still gets registered by better-auth (it only logs a warning), so the button appears and then dead-ends on the provider's own `invalid_client` error page.

Because the client asks the API which providers are live (`GET /api/public/config`), turning a provider on is a **server restart — not a client redeploy**.

---

## ☁️ Deploying

<table>
<tr><td>🎨 <b>Client</b></td><td><a href="https://vercel.com">Vercel</a></td><td>config already in <code>client/vercel.json</code></td></tr>
<tr><td>⚙️ <b>API</b></td><td><a href="https://render.com">Render</a></td><td>blueprint already in <code>render.yaml</code></td></tr>
<tr><td>🗄️ <b>Database</b></td><td><a href="https://neon.tech">Neon</a></td><td>PostgreSQL, serverless</td></tr>
</table>

The short version: deploy the API first, deploy the client with `VITE_BASEURL` pointed at the API, then go back and set the API's `TRUSTED_ORIGINS` to the client's real Vercel URL and redeploy.

> [!IMPORTANT]
> The two halves live on different domains, so the session cookie is cross-site — that only works when both sides are HTTPS, `NODE_ENV=production` is set on the API, and each side correctly names the other. Rotate `BETTER_AUTH_SECRET` for production rather than reusing your local one.

> [!WARNING]
> Run database migrations with `npx prisma migrate deploy` only — **never** `migrate dev` or `migrate reset` against a live database.

---

## 📁 Project layout

```
client/                 # Vite SPA
  src/
    pages/               # Home, Projects (builder), Community, Settings, ...
    components/
      home/                # landing page sections
      projects/            # builder UI: chat sidebar, iframe preview, element editor,
                           #   code editor (lazy-loaded CodeMirror), audit panel
      ui/                   # shadcn primitives
    lib/, configs/, types/  # auth client, axios instance, shared types

server/                 # Express API
  configs/openai.ts      # the only place AI model/timeout config lives
  controllers/            # project creation, revisions, publishing, credits, audit
  lib/html.ts             # extracts and validates raw HTML from model output
  lib/htmlScan.ts         # dependency-free HTML tag scanner
  lib/audit.ts            # 19 weighted SEO/accessibility checks + fix-prompt builder
  lib/conversation.ts     # assistant message catalog + revision-history filter
  lib/generationStream.ts # live-preview SSE channels
  lib/aiStream.ts         # streamed model completions
  lib/auth.ts             # better-auth setup (sessions, reset, verification, OAuth)
  lib/email.ts            # Brevo HTTP sender — the only email path in the repo
  prisma/schema.prisma    # User, WebsiteProject, Conversation, Version, ...

render.yaml              # Render deployment blueprint for the API
```

---

## 🚧 Known limitations

- ⚡ Generation is still fire-and-forget in memory, but a restart no longer strands it: a startup sweep marks such projects failed and refunds the credits. That sweep, and the live-preview stream, assume **one server instance** — set `GENERATION_SWEEP_ON_BOOT=false` before scaling out.
- 💳 No payment provider is wired up yet; credit purchases return "not implemented."
- 🐢 Free OpenRouter models are slow (tens of seconds to a few minutes per page) and occasionally rate-limited — a paid key is the biggest reliability upgrade available.
- 🔓 Social sign-in has not been exercised against real Google/GitHub OAuth apps yet — the code paths and the disabled-by-default degradation are verified, the callback round-trip is not.
- 🧪 218 tests cover the pure logic (`html`, `conversation`, `htmlScan`, `audit`). The controllers, the SSE registry and all React components are untested, there is no CI, and the visual editor / Code tab are verified by review + build only.

---

## 📄 License

No license file is currently included — treat this as all-rights-reserved unless the repository owner specifies otherwise.

<div align="center">
<sub>Built with ❤️ using React, Express, and a bit of AI magic.</sub>
</div>
