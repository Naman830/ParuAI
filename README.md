# ParuAI

Describe a website in plain English, get a working, editable page in return.

ParuAI is an AI website builder: you type a prompt, an LLM generates a single
standalone HTML file (styled with Tailwind via CDN), and you preview it live,
click-to-edit individual elements, chat to revise it, roll back to any
previous version, publish it to a public gallery, or download `index.html`
and host it anywhere.

## How it works

1. **Describe it** — type a prompt on the home page (e.g. *"a landing page for
   a coffee subscription box"*).
2. **It gets built** — the server calls an LLM twice: once to expand your
   prompt into a fuller spec, once to generate the actual HTML. This takes
   anywhere from ~40 seconds to a few minutes depending on the model.
3. **Preview it** — the generated page renders live in a sandboxed iframe.
4. **Edit it** — click any element to select it, then change its text, color,
   or spacing from the side panel — no code required.
5. **Iterate by chat** — ask for changes ("make the header sticky", "swap the
   color scheme to green") and a new version is generated with the current
   page as context.
6. **Roll back, publish, or download** — every revision is saved as a
   version you can restore. Publish a project to the community gallery, or
   download it as a plain `index.html` you can host anywhere.

## Tech stack

| | |
|---|---|
| **Client** | React 19 + Vite + TypeScript, Tailwind CSS v4, shadcn/ui, better-auth |
| **Server** | Express 5 + TypeScript (via `tsx`), Prisma + PostgreSQL |
| **AI** | OpenAI SDK pointed at [OpenRouter](https://openrouter.ai) |
| **Auth** | better-auth (email + password, cookie sessions) |
| **Email** | Nodemailer over SMTP (password-reset links only) |

The project is two independent npm projects, `client/` and `server/` — there
is no shared workspace root.

## Getting started

You'll need Node 22+, npm 10+, and a PostgreSQL database (e.g. a free
[Neon](https://neon.tech) instance).

### 1. Server

```bash
cd server
cp .env.example .env      # fill in the values — see below
npm install                # postinstall runs `prisma generate` for you
npx prisma migrate deploy  # apply the schema to your database
npm run server              # http://localhost:3000
```

### 2. Client

```bash
cd client
cp .env.example .env       # optional locally — falls back to localhost:3000
npm install
npm run dev                 # http://localhost:5173
```

Open `http://localhost:5173`, sign up, and try a prompt.

### Useful commands

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

## Configuration

All server config lives in `server/.env` (see `server/.env.example` for full
comments on every variable). The essentials:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres/Neon connection string |
| `BETTER_AUTH_SECRET` | Auth signing secret — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public URL of this API |
| `TRUSTED_ORIGINS` | Comma-separated frontend origin(s), e.g. `http://localhost:5173` |
| `AI_API_KEY` | Your OpenRouter API key |
| `AI_MODEL` | Generation model — defaults to a free OpenRouter model |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | SMTP creds for password-reset emails |

The client only needs one variable, in `client/.env`:

| Variable | Purpose |
|---|---|
| `VITE_BASEURL` | The API's origin, e.g. `http://localhost:3000` |

> **Free AI models are the most common source of "it's broken."** OpenRouter's
> `:free` models get rate-limited under load and are occasionally withdrawn
> without notice. If generation starts failing across the board, check
> `AI_MODEL` against OpenRouter's current free model list before assuming a
> code bug:
> ```bash
> curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*:free"'
> ```

## Deploying

- **Client** → [Vercel](https://vercel.com) (config already in `client/vercel.json`)
- **API** → [Render](https://render.com) (blueprint already in `render.yaml`)
- **Database** → [Neon](https://neon.tech)

The short version: deploy the API first, deploy the client with
`VITE_BASEURL` pointed at the API, then go back and set the API's
`TRUSTED_ORIGINS` to the client's real Vercel URL and redeploy. The two
halves live on different domains, so the session cookie is cross-site — that
only works when both sides are HTTPS, `NODE_ENV=production` is set on the
API, and each side correctly names the other. Rotate `BETTER_AUTH_SECRET` for
production rather than reusing your local one.

Run database migrations with `npx prisma migrate deploy` only — never
`migrate dev` or `migrate reset` against a live database.

## Project layout

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

## Known limitations

- Generation is fire-and-forget in memory — if the server restarts mid-generation,
  that project is stranded with no result and no refund.
- No payment provider is wired up yet; credit purchases return "not implemented."
- Free OpenRouter models are slow (tens of seconds to a few minutes per page)
  and occasionally rate-limited — a paid key is the biggest reliability upgrade
  available.
- Test coverage is limited to `server/lib/html.ts`; most verification is manual
  (typecheck, lint, build, exercising the app).

## License

No license file is currently included — treat this as all-rights-reserved
unless the repository owner specifies otherwise.
