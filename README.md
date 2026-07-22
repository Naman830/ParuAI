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
| 2️⃣ | **It gets built** — the server calls an LLM twice: once to expand your prompt into a fuller spec, once to generate the actual HTML. Takes ~40 seconds to a few minutes depending on the model. |
| 3️⃣ | **Preview it** — the generated page renders live in a sandboxed iframe. |
| 4️⃣ | **Edit it** — click any element to select it, then change its text, color, or spacing from the side panel. No code required. |
| 5️⃣ | **Iterate by chat** — ask for changes ("make the header sticky", "swap the color scheme to green") and a new version is generated using the current page as context. |
| 6️⃣ | **Roll back, publish, or download** — every revision is saved as a version you can restore. Publish to the community gallery, or download a plain `index.html` you can host anywhere. |

---

## 🧱 Tech stack

<table>
<tr><th align="left">🎨 Client</th><td>React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui · better-auth</td></tr>
<tr><th align="left">⚙️ Server</th><td>Express 5 · TypeScript (via <code>tsx</code>) · Prisma · PostgreSQL</td></tr>
<tr><th align="left">🧠 AI</th><td>OpenAI SDK pointed at <a href="https://openrouter.ai">OpenRouter</a></td></tr>
<tr><th align="left">🔐 Auth</th><td>better-auth — email + password, cookie sessions</td></tr>
<tr><th align="left">✉️ Email</th><td>Nodemailer over SMTP — password-reset links only</td></tr>
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
| ✉️ `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | SMTP creds for password-reset emails |

The client only needs one variable, in `client/.env`:

| Variable | Purpose |
|---|---|
| 🌐 `VITE_BASEURL` | The API's origin, e.g. `http://localhost:3000` |

> [!TIP]
> **Free AI models are the most common source of "it's broken."** OpenRouter's `:free` models get rate-limited under load and are occasionally withdrawn without notice. If generation starts failing across the board, check `AI_MODEL` against OpenRouter's current free model list before assuming a code bug:
> ```bash
> curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*:free"'
> ```

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
      projects/            # builder UI: chat sidebar, iframe preview, element editor
      ui/                   # shadcn primitives
    lib/, configs/, types/  # auth client, axios instance, shared types

server/                 # Express API
  configs/openai.ts      # the only place AI model/timeout config lives
  controllers/            # project creation, revisions, publishing, credits
  lib/html.ts             # extracts and validates raw HTML from model output
  lib/auth.ts             # better-auth setup (sessions, password reset)
  prisma/schema.prisma    # User, WebsiteProject, Conversation, Version, ...

render.yaml              # Render deployment blueprint for the API
```

---

## 🚧 Known limitations

- ⚡ Generation is fire-and-forget in memory — if the server restarts mid-generation, that project is stranded with no result and no refund.
- 💳 No payment provider is wired up yet; credit purchases return "not implemented."
- 🐢 Free OpenRouter models are slow (tens of seconds to a few minutes per page) and occasionally rate-limited — a paid key is the biggest reliability upgrade available.
- 🧪 Test coverage is limited to `server/lib/html.ts`; most verification is manual (typecheck, lint, build, exercising the app).

---

## 📄 License

No license file is currently included — treat this as all-rights-reserved unless the repository owner specifies otherwise.

<div align="center">
<sub>Built with ❤️ using React, Express, and a bit of AI magic.</sub>
</div>
