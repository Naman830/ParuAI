# Deploying ParuAI

Client (Vite SPA) → **Vercel**. API (Express) → **Render**. Database → **Neon**.

The two halves live on different domains, which is the single biggest source of
deploy failures here: the session cookie is cross-site, so it only works when
both sides are HTTPS, `NODE_ENV=production` is set on the API, and each side
names the other in its config. Most of this guide is about getting that right.

---

## 0. Before you start

- [ ] A Neon Postgres database (the existing `DATABASE_URL` already points at one).
- [ ] An OpenRouter API key — https://openrouter.ai/keys
- [ ] A fresh `BETTER_AUTH_SECRET` for production: `openssl rand -base64 32`

> **Rotate your secrets before going live.** The values currently in
> `server/.env` are development credentials. Generate a new
> `BETTER_AUTH_SECRET` for production rather than reusing the local one — and
> note that changing it invalidates every existing session.

`server/.env` is gitignored and must stay that way. Nothing in this guide asks
you to commit a secret; Render and Vercel both hold them as env vars.

---

## 1. Deploy the API to Render

There are two routes. The Blueprint is less error-prone.

### Option A — Blueprint (uses `render.yaml`)

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo.
3. Render reads `render.yaml` and prompts for every `sync: false` value.

### Option B — Manual web service

Render dashboard → **New → Web Service**, then set:

| Field | Value |
|---|---|
| Root Directory | `server` |
| Runtime | Node |
| Build Command | `npm install && npx prisma migrate deploy` |
| Start Command | `npm start` |
| Health Check Path | `/` |

### Environment variables

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **pooled** connection string (the `-pooler` host) |
| `BETTER_AUTH_SECRET` | your freshly generated secret |
| `BETTER_AUTH_URL` | this service's own URL, e.g. `https://paruai-api.onrender.com` |
| `TRUSTED_ORIGINS` | the Vercel URL — **you won't have this until step 2** |
| `BETTER_AUTH_API_KEY` | your Better Auth Dash key (`ba_…`) |
| `AI_API_KEY` | your OpenRouter key |
| `AI_MODEL` | `poolside/laguna-s-2.1:free` |

Do **not** set `PORT` — Render injects it, and `server.ts` already reads
`process.env.PORT`.

For the first deploy, set `TRUSTED_ORIGINS` to any placeholder; you'll correct
it in step 3. Then note your API URL and check it:

```bash
curl https://paruai-api.onrender.com/          # -> Server is Live!
curl https://paruai-api.onrender.com/api/nope  # -> {"message":"Route not found"}
```

### Why `tsx` and `prisma` are runtime dependencies

`npm start` runs the TypeScript entrypoint through `tsx` (there is no compile
step), and the `postinstall` hook runs `prisma generate` to emit
`server/generated/prisma`, which is gitignored — without it the server cannot
start at all. Hosts install with `NODE_ENV=production`, which **skips
devDependencies**, so both packages have to sit in `dependencies`. Moving them
back to `devDependencies` will break the deploy, not just the build.

### Better Auth dashboard

`lib/auth.ts` mounts the `dash()` plugin from `@better-auth/infra`, which
connects this API to the hosted dashboard at https://dash.better-auth.com. It
reads `BETTER_AUTH_API_KEY` from the environment by itself — the plugin is
called with no arguments, so the **env var name is the wiring**; rename it and
the connection silently goes inert.

The dashboard's admin endpoints (ban user, send verification email, view
2FA setup, …) are mounted under `/api/auth/*` but are not open to the world:
each one requires a JWS signed by Dash's own JWKS and rejects anything older
than five minutes.

If the key is missing or wrong, auth keeps working normally — you just lose the
dashboard connection.

If the dashboard connects but its browser-side calls are blocked, add its
origin to `TRUSTED_ORIGINS` alongside the Vercel one — that list also bounds
which origins the plugin's invitation flows will redirect to:

```
TRUSTED_ORIGINS=https://your-app.vercel.app,https://dash.better-auth.com
```

---

## 2. Deploy the client to Vercel

1. Vercel → **Add New → Project** → import the repo.
2. Set **Root Directory** to `client`. This matters — `client/vercel.json`
   and the build only resolve correctly from there.
3. Framework preset should auto-detect **Vite**; the build settings in
   `client/vercel.json` take precedence anyway.
4. Add one environment variable:

   | Key | Value |
   |---|---|
   | `VITE_BASEURL` | your Render API URL, e.g. `https://paruai-api.onrender.com` |

   No trailing slash.

`client/vercel.json` rewrites all unmatched paths to `/index.html`. Vercel
applies rewrites *after* the filesystem check, so real files under
`/assets/` still serve normally — the catch-all only handles react-router
paths like `/projects/:id` and `/view/:id`, which would otherwise 404 on a
hard refresh.

> `VITE_BASEURL` is inlined at **build** time, not read at runtime. Changing it
> requires a redeploy, not just a restart.

---

## 3. Close the loop (the step everyone forgets)

Go back to Render and set `TRUSTED_ORIGINS` to your real Vercel URL:

```
TRUSTED_ORIGINS=https://your-app.vercel.app
```

No trailing slash. Comma-separated if you have several (a custom domain, say):

```
TRUSTED_ORIGINS=https://your-app.vercel.app,https://paruai.com
```

This one value feeds **both** CORS (`server.ts`) and better-auth's
`trustedOrigins` (`lib/auth.ts`). Both trim whitespace around the commas.
If it's empty or wrong, the server boots fine and every browser request fails —
so an app that looks deployed but can't log in almost always means this.

Redeploy the API after changing it.

### Preview deployments

Every Vercel preview gets its own generated URL, and none of them will be in
`TRUSTED_ORIGINS` — so auth only works on the production domain unless you add
each preview URL explicitly. This is expected.

---

## 4. Verify

```bash
API=https://paruai-api.onrender.com
ORIGIN=https://your-app.vercel.app

# health
curl -s $API/

# CORS must echo your origin back
curl -si -X OPTIONS $API/api/user/credits \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow

# signup should return a user object and set a cookie
curl -si -X POST $API/api/auth/sign-up/email \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"SomeLongPassw0rd!","name":"You"}' \
  | grep -iE 'set-cookie|"id"'
```

A correct production response looks like:

```
set-cookie: __Secure-auth_session=…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None
```

Two things to check. It must say `Secure; SameSite=None` — if it says
`SameSite=Lax`, `NODE_ENV` is not `production` on Render, and the browser will
silently drop the cookie on every cross-site request, so you can sign up but
never stay signed in. And note the name gains a `__Secure-` prefix in
production: the cookie is `auth_session` locally but `__Secure-auth_session`
once `Secure` is set. That's better-auth's own behaviour, not a misconfiguration
— don't go looking for a bare `auth_session` in devtools and conclude it failed.

Then in a browser: sign up → enter a prompt → wait for the preview to render.

---

## Free-tier realities

These are properties of the free plans, not bugs:

- **Render free services sleep after ~15 minutes idle.** The next request pays a
  ~50 second cold start. The first load after a quiet period will feel broken.
- **Generation is slow.** On a free OpenRouter model, a full page takes
  **several minutes** (an end-to-end run measured here took ~8 minutes for the
  two-call enhance → generate chain). The client polls every 10s, which is what
  keeps the Render instance awake meanwhile.
- **Free models get rate-limited and withdrawn.** OpenRouter returns `429
  temporarily rate-limited upstream` under load, and slugs disappear from the
  free tier without notice — the previous default, `stepfun/step-3.5-flash:free`,
  now 404s as "unavailable for free". When *every* generation starts failing,
  check the model slug and key before suspecting the code:

  ```bash
  curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*:free"'
  ```

  Swap via the `AI_MODEL` env var — never by editing code.
- A paid OpenRouter key removes most of this. With one, also set
  `AI_RATE_LIMIT_DELAY_MS=0` to drop the free-tier pause.

Generation failures refund the user's 5 credits and write a
`[generation-failed]` message, which is what stops the client polling.
`AI_REQUEST_TIMEOUT_MS` (default 5 min) bounds a stalled provider so that path
is actually reachable.

---

## Database migrations

Only ever run:

```bash
npx prisma migrate deploy
```

It is idempotent and safe against a live database; the Render build command runs
it on every deploy. **Never** run `prisma migrate dev` or `prisma migrate reset`
against the production `DATABASE_URL` — they drop data, including all
better-auth `session` / `account` rows and every generated site.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Login succeeds, next request is 401 | `NODE_ENV` isn't `production` on Render, so the cookie is `SameSite=Lax` and dropped cross-site |
| Every request blocked by CORS | `TRUSTED_ORIGINS` missing the Vercel origin, or has a trailing slash |
| 404 on refresh at `/projects/:id` | Vercel Root Directory isn't `client`, so `vercel.json` was never applied |
| `Cannot find module '../generated/prisma/client.js'` | `prisma generate` didn't run — check `prisma` is in `dependencies` |
| `tsx: not found` on start | `tsx` was moved back to `devDependencies` |
| Spinner never resolves | Generation genuinely takes minutes on free models; if it exceeds `AI_REQUEST_TIMEOUT_MS` you'll get the refund message instead |
| First request after idle hangs ~50s | Render free-tier cold start |
