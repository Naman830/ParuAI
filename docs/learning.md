# Everything I Learned Building ParuAI 🎓

*A friendly, story-driven guide to the real lessons behind an AI website builder.*

---

## Who this is for, and how to read it

I built **ParuAI** — a website where you type *"make me a bakery landing page"* and an AI
writes a complete HTML page, which you can then preview, edit visually, edit as code,
roll back, publish to a gallery, or download.

Along the way I hit almost every classic full-stack problem: cookies that vanish,
credits that go negative, AIs that ramble instead of coding, deploys that break in ways
localhost never showed. This document is me teaching you everything I learned — in the
order I learned it, with the actual bugs and the actual fixes.

**How to read it:**

- Every lesson starts with a **story** (what happened), then the **fix**, then a
  **takeaway** you can carry to any project.
- Plain-language explanations come first. Boxes marked **🔍 Going deeper** are for
  readers who already know React/Node and want the sharp edges.
- Code snippets are real code from this repo, sometimes trimmed for readability.
- You don't need to read in order. Jump to whatever part bites you today:

| Part | What it covers |
|---|---|
| [Part 0](#part-0--the-big-picture) | How the whole app fits together |
| [Part 1](#part-1--working-with-ai-models) | Talking to LLMs without getting burned |
| [Part 2](#part-2--auth--security) | Logins, cookies, and not leaking data |
| [Part 3](#part-3--architecture--react) | Credits, versions, iframes, and React state |
| [Part 4](#part-4--deploying-testing-debugging) | Free-tier hosting, env vars, tests, war stories |
| [The cheat sheet](#the-cheat-sheet--25-rules-i-now-live-by) | All takeaways in one list |

---

## Part 0 — The big picture

Before the lessons, here's the machine we're talking about.

ParuAI is **three separate things on three separate computers**:

```
┌──────────────────┐        ┌──────────────────┐        ┌─────────────┐
│  React client    │  HTTP  │  Express API     │  SQL   │  PostgreSQL │
│  (Vercel)        │ ─────► │  (Render)        │ ─────► │  (Neon)     │
│  Vite + Tailwind │ cookies│  better-auth     │ Prisma │             │
└──────────────────┘        └────────┬─────────┘        └─────────────┘
                                     │ HTTPS
                                     ▼
                            ┌──────────────────┐
                            │  OpenRouter      │  ← the AI lives here,
                            │  (LLM gateway)   │    not in my code
                            └──────────────────┘
```

The life of one website:

1. You type a prompt on the home page.
2. The API checks you have enough **credits** (each generation costs 5), charges you,
   creates a project row, and immediately replies *"OK, project created"* — the AI
   hasn't even started yet.
3. In the **background**, the server asks the AI twice: first *"rewrite this prompt to
   be clearer"* (the **enhancer**), then *"now write the full HTML page"* (the
   **generator**).
4. The HTML is cleaned up, saved as a **Version** (a snapshot), and set as the
   project's current code.
5. Meanwhile your browser has navigated to the project page and is watching for the
   code to appear — live-streamed token by token, with polling as a fallback.
6. The page renders inside a **sandboxed iframe**, with a small injected script that
   lets you click elements and edit them visually.
7. Every AI revision, rollback, and manual save creates another Version, so you can
   always go back.

Keep this picture in mind — half the lessons below are about the *arrows* in that
diagram, because **the seams between systems are where things break**.

---

# Part 1 — Working with AI models

## Lesson 1: Never trust what an LLM gives you — clean it first

**The story.** My generator prompt says, in capital letters, *"Return ONLY raw HTML.
No markdown. No explanations."* The models ignore this constantly. They wrap the code
in ` ```html ` fences. They open with *"Here is your updated code:"*. One of those
chatty preambles actually got **saved to the database as the website itself** — a user's
"site" began with a sentence of AI small talk.

**The fix.** One function that every single write path must pass through before
anything is persisted:

```ts
// server/lib/html.ts (trimmed)
export const extractHtml = (raw: string | null | undefined): string => {
  if (!raw) return "";

  // 1. Strip markdown code fences (```html ... ```)
  let code = raw.replace(/```[a-z]*\n?/gi, "").replace(/```$/g, "").trim();

  // 2. Drop any model preamble before the document starts.
  const doctype = code.search(/<!DOCTYPE/i);
  if (doctype !== -1) {
    code = code.slice(doctype);
  } else {
    const htmlTag = code.search(/<html[\s>]/i);
    if (htmlTag !== -1) code = code.slice(htmlTag);
  }

  return code.trim();
};

/** True when the model returned something we can actually render. */
export const isRenderableHtml = (code: string): boolean =>
  code.trim().length > 0 && /<html[\s>]/i.test(code);
```

And a gate: if `isRenderableHtml()` says no, we **refund the credits and report an
error** instead of saving garbage. A failed generation that says "sorry, try again"
is a much better experience than a "successful" one that renders nonsense.

**Takeaway.** Treat LLM output like user input: assume it's malformed, sanitize it in
*one* shared function, and validate before persisting. The prompt is a request, not a
contract.

> **🔍 Going deeper.** The bug that motivated centralizing this: the cleanup logic was
> copy-pasted into each handler, and the *revision* handler's copy was missing the
> preamble-slicing step. Copy-pasted validation drifts — that's a law of nature. The
> moment you have two callers, extract the function.

---

## Lesson 2: Two small AI calls beat one big one

**The story.** Users type prompts like *"portfolio site"*. Three words. If you hand
that straight to the code generator, you get a generic, thin page.

**The fix.** Every generation is **two sequential AI calls**:

1. **The enhancer** — takes *"portfolio site"* and expands it into a clear one-to-two
   sentence brief: sections, style, tone.
2. **The generator** — takes that brief and writes the actual HTML.

Splitting the "understand what they want" step from the "write the code" step made
output dramatically better, because each prompt gets to be simple and focused.

**Takeaway.** Pipelines of small, single-purpose AI calls are easier to prompt, debug,
and improve than one mega-prompt that does everything.

> **🔍 Going deeper — the enhancer is lossy, and that eventually bit me.** The enhancer
> is *told* to compress to 1–2 sentences. Great for vague human prompts; terrible when
> the input is already precise. When I built the SEO audit's "Fix with AI" button
> (Lesson 8), it sends a *numbered list of exact markup fixes* — and the enhancer
> cheerfully squashed that into one vague sentence. The fix was an `enhance: false`
> flag on the revision endpoint that skips the enhancer for machine-generated prompts.
> Second fix in the same spirit: the generator now receives **both** the original
> prompt *and* the enhanced one, so the enhancer can never silently drop a detail
> forever.

---

## Lesson 3: Set your own timeouts — defaults are for someone else's app

**The story.** Generation is *fire-and-forget*: the API replies instantly and the AI
runs in the background. One day a provider stalled mid-request. The OpenAI SDK's
defaults are a **10-minute timeout with 2 retries** — so my background job hung for
roughly **30 minutes**. During that whole time the project had no code and no failure
marker, so the client just… polled. Forever. To the user it looked like my app was
broken, when really nothing was ever going to arrive.

**The fix.** Explicit, environment-tunable bounds on the client:

```ts
// server/configs/openai.ts (trimmed)
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.AI_API_KEY,
  timeout: AI_REQUEST_TIMEOUT_MS,   // default 5 min — generous on purpose
  maxRetries: AI_MAX_RETRIES,       // default 2
});
```

The timeout is deliberately *generous* (a real page takes 37–72 seconds per call on
free models). It's not a latency target — it exists so the **failure path is reachable
at all**. Without it, my carefully written refund-and-report error handling was dead
code, because the request never actually failed.

**Takeaway.** Every external call needs a timeout *you chose*. And here's the subtle
part: **error handling you can't reach is the same as no error handling.** Ask
yourself, "what has to happen for my `catch` block to actually run?"

---

## Lesson 4: The AI model is configuration, not code

**The story.** One morning, every single generation failed. I assumed my key was bad,
then my code. Neither. The free model I'd hardcoded —
`stepfun/step-3.5-flash:free` — had been **withdrawn from OpenRouter's free tier** and
now answered `404`. Worse: the model name was hardcoded in **four different places**.

**The fix.** One constant, overridable by environment variable:

```ts
// server/configs/openai.ts
export const AI_MODEL = process.env.AI_MODEL || "poolside/laguna-s-2.1:free";
```

Now, when a model dies (and free models die regularly), the fix is a one-line `.env`
change and a restart — no code edit, no deploy.

**Takeaway.** Anything that changes on someone else's schedule — model names, API
endpoints, rate limits — belongs in configuration with a single source of truth.
And when *everything* fails at once, suspect the external dependency before your code:

```bash
# is the model even still offered?
curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*:free"'
```

---

## Lesson 5: Streaming — show progress, but let the database be the truth

**The story.** For months, generation UX was: submit, then stare at a fake loading
animation that cycled through four hardcoded labels on a timer — it claimed
*"Finalizing…"* before a single byte of HTML existed. Users refreshed, thought it was
broken, and submitted again (spending more credits).

**The fix** had three parts, and each taught me something.

**Part A — a real `status` column.** The project row now carries
`status: pending | generating | ready | failed`. Before this, "is it done?" was
inferred from side signals (is the code null? is there a failure marker in the chat?).
Explicit state beats inferred state.

**Part B — Server-Sent Events (SSE).** The generator's output streams token-by-token
to the browser over a long-lived HTTP response, so you literally watch the page being
written into the preview. SSE is much simpler than WebSockets when data only flows
one way — it's just an HTTP response that never ends, with `data: ...` lines.

**Part C — one rule that made all of it safe:**

> **The stream is cosmetic. The database is the only truth.**

The client *never* saves or downloads what came over the stream. When the stream says
"done" (or dies), the client refetches the project from the API. That single rule
means dropped frames, truncation, buffer caps, or a killed connection can make the
live preview *ugly* — but can never *corrupt* anything.

**Takeaway.** When you add a fast-but-unreliable channel (stream, cache, optimistic
UI) alongside a slow-but-reliable one (the database), decide explicitly which one is
authoritative, and make the pretty one strictly decorative.

> **🔍 Going deeper — four sharp edges from the SSE work.**
>
> 1. **Coalesce your frames.** Tokens arrive way faster than 60fps matters. A 150 ms
>    "collect and flush" tick caps frames at ~7/second no matter the token rate;
>    per-token writes made the preview strobe.
> 2. **Late subscribers are just a cursor at zero.** The server keeps one buffer per
>    generation and a per-subscriber cursor into it. "Replay history for someone who
>    connected late" and "tail live output" become the *same code path*.
> 3. **In Express 5, fail *before* you stream.** Every 4xx check and every `await`
>    that can throw runs **before** `flushHeaders()`. After headers are flushed, a
>    thrown async error goes to the error middleware, which sees `headersSent`,
>    gives up — and the socket leaks open forever.
> 4. **Streaming needs its own idle timeout.** The whole-request timeout (Lesson 3)
>    doesn't help when tokens *were* flowing and then stop. A separate watchdog
>    aborts if no token arrives for 90 s.
>
> Also: for the live preview iframe, updates go in via `document.write` on an
> `about:blank` frame — reassigning `srcDoc` reloads the whole iframe on every
> update, which made the Tailwind CDN rescan and the frame flicker.

---

## Lesson 6: Keep your app's own messages out of the AI's memory

**The story.** The sidebar chat contains two kinds of assistant messages: things like
*"Now generating your Website..."* (written by **my app**) and… well, actually that's
the only kind — the model's real output is HTML that lives elsewhere. When I added
conversation history to the revision prompt, I realized I was about to feed the model
its own fake dialogue: status lines *my code* wrote, presented as things *it* said.
Models get confused by that — they start imitating the boilerplate.

**The fix.** A single catalog of every fixed line the app ever writes to the chat:

```ts
// server/lib/conversation.ts (trimmed)
export const ASSISTANT_MESSAGES = {
  GENERATING: "Now generating your Website...",
  REVISING: "Now making changes to your website...",
  CREATED: "I've Created your Website! You can now preview it and request any changes.",
  ROLLED_BACK: "I've rolled back your website to selected version. ...",
  // ...
} as const;

/** True for any app-authored status line — anything the model should not see. */
export const isAssistantBoilerplate = (content: string): boolean => { /* ... */ };
```

Controllers write these exact strings, and the history filter matches these exact
strings. Because both sides read **the same object**, a reworded status message can
never silently start leaking into the model's context — there is no second list to
forget to update.

**Takeaway.** When one string is written in place A and matched in place B, define it
**once** and import it in both. Every duplicated "magic string" is a time bomb.

---

## Lesson 7: Context windows are a budget — spend them like money

**The story.** Revision prompts got better when the model could see what the user had
asked for previously (*"make it blue"* … *"no, darker"*). But conversation history
grows without limit, and the prompt box on the home page is an unbounded textarea —
one user pasting an essay could drown out everything else.

**The fix.** `formatRevisionHistory()` applies a strict budget: newest **8 turns**,
max **500 characters each**, max **2000 characters total**, walking newest-first so
the budget is spent on the most relevant turns — and truncating each turn *before*
measuring it, so one runaway prompt can't starve the others.

It also has my favorite subtle rule, the **rollback barrier**: everything at or before
the most recent *"I've rolled back your website"* message is discarded. Why? After a
rollback, the live document **is** the older snapshot — the requests that produced the
now-abandoned versions no longer describe reality. Feeding them to the model would be
telling it about changes that no longer exist.

**Takeaway.** Don't just cap history by length — ask *"which of these past messages
are still true?"* Stale context is worse than no context.

> **🔍 Going deeper.** Two more details worth stealing: (1) the history is read
> *before* the new user message is written to the DB, otherwise the current prompt
> appears twice — once as "history," once as "the request." (2) History goes to the
> cheap *enhancer* call only, never the generator — the generator already carries the
> entire ~40 KB HTML document and doesn't need 2 KB of chat on top.

---

## Lesson 8: You can grade AI output with plain code — no AI needed

**The story.** I wanted an SEO/accessibility audit for generated pages. First
instinct: ask another AI to review the HTML. But that costs money, takes a minute,
and can hallucinate.

**The fix.** A **pure-code auditor**: 19 weighted checks (does the page have a
`<title>`? do images have `alt` text? is there exactly one `<h1>`? …) whose weights
sum to exactly 100 — and a test asserts that sum, so nobody can add a check and
silently break the scale. Checks that don't apply (no images → no `alt` check) drop
out of both the numerator and denominator, so a page is never punished for what it
doesn't contain.

The audit endpoint is deliberately **free** — no AI call, no network, no writes.
Then "Fix with AI" turns the failed checks into a precise numbered prompt and sends
it through the normal (paid) revision flow — with `enhance: false` (see Lesson 2's
deep-dive for why).

**Takeaway.** The cheapest, most reliable "AI feature" is often deterministic code
that *feeds* the AI. Cheap detection + paid fixing is a great free/paid split, and
audit → fix → re-audit only feels fair if re-checking costs nothing.

> **🔍 Going deeper — the scrubbing trick.** I didn't add an HTML parser dependency.
> Instead a tiny scanner blanks out `<script>`, `<style>`, and comment contents with
> **equal-length spaces** before scanning. Same string length → every byte offset in
> the original document is still valid → check results can point at exact locations.
> Replacing with `""` would have shifted every offset after the first match.

---

# Part 2 — Auth & security

## Lesson 9: Cookies across two domains is where auth actually breaks

**The story.** Everything worked on localhost. Deployed — client on Vercel, API on
Render — signup *appeared* to work, but users were logged out on the very next
request. No errors anywhere. The session simply didn't stick.

**The why.** The client and API are on **different domains**, so every API request is
a *cross-site* request. Browsers refuse to send cookies cross-site unless the cookie
was set with `SameSite=None; Secure`. My dev config used `sameSite=lax` (correct for
localhost, where both ends share a site), so the browser silently dropped the session
cookie on every deployed request.

**The fix.** `NODE_ENV=production` on the API flips cookies to
`secure: true, sameSite: "none"`. That one environment variable is the difference
between working auth and invisible failure.

**Takeaway.** "Works locally, breaks deployed" for auth is almost always a cookie
attribute problem. Learn what `SameSite` does *before* you deploy across domains, not
after.

> **🔍 Going deeper — the `__Secure-` prefix ambush.** Once a cookie is `Secure`,
> better-auth renames it from `auth_session` to `__Secure-auth_session`. I spent real
> time in devtools hunting for a cookie named `auth_session`, concluded auth was
> broken, and it wasn't — it was sitting right there under the prefixed name. If you
> ever debug better-auth in production, search for the *prefixed* name.

---

## Lesson 10: If two libraries talk to the same server, give them ONE address

**The story.** The API URL lived in two places: axios (my data-fetching client) had a
fallback of `http://localhost:3000`, but the auth library got `baseURL: undefined`
and defaulted to *the page's own origin* — the Vite dev server on `:5173`. Result:
data requests went to the API, auth requests went to the dev server, and every login
404'd. The session cookie was effectively being set on one host and read from another.

**The fix.** One exported constant, imported by both:

```ts
// client/src/configs/axios.ts
export const API_BASE_URL =
  import.meta.env.VITE_BASEURL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,   // ← without this, cookies never ride along
});
```

**Takeaway.** Any value used by more than one module — an origin, a marker string, a
cost constant — gets defined exactly once and imported everywhere. Divergence isn't a
risk; it's a schedule.

---

## Lesson 11: The `.trim()` that took down login (a whitespace war story)

**The story.** `TRUSTED_ORIGINS` is a comma-separated env var feeding *two* systems:
CORS (which origins may call the API) and better-auth (which origins may perform auth
actions). With `TRUSTED_ORIGINS=https://a.com, https://b.com` — note the natural
space after the comma — the CORS parser trimmed whitespace and the auth parser did a
bare `.split(",")`. So the second origin became `" https://b.com"` (leading space) in
auth's list only.

The symptom was surreal: **CORS said yes, auth said 403**, but only for users on the
second domain. Everything about it looked like a permissions bug; it was a *space*.

**The fix.** Both parsers now trim, and the project docs say in bold: *keep both
parsers identical.* (Honestly, the better fix is to parse once and share the array.)

**Takeaway.** When two systems parse the same config string, they must share the
parser. And when a bug only affects "the second one" of anything comma-separated, go
stare at the whitespace.

---

## Lesson 12: Check ownership on every single route — the database makes it easy

**The story.** Being *logged in* and being *allowed to touch this project* are
different questions. Auth middleware answers the first. The second must be answered
per-route, and forgetting it even once means any logged-in user can read, modify, or
delete anyone else's project just by guessing IDs.

**The fix.** A pattern so small it's hard to get wrong — ownership is part of the
database query itself:

```ts
const project = await prisma.websiteProject.findFirst({
  where: { id: projectId, userId },   // ← both conditions, always
});
if (!project) return res.status(404).json({ message: "Project not found" });
```

If the project exists but belongs to someone else, the query returns nothing, and the
response is the same `404` as "doesn't exist." That's deliberate: a `403` would
confirm to an attacker that the ID is real.

I then verified it the honest way: created a **second account** and hit all 8
owner-scoped routes with the first account's project IDs. All returned 404.

**Takeaway.** Authorization belongs in the query (`WHERE id = ? AND userId = ?`), not
in an `if` after the query. And don't declare it done until you've actually attacked
it with a second account.

---

## Lesson 13: The day the API leaked every user's email

**The story.** The community gallery endpoint is public — anyone, logged in or not,
can list published projects. Each project shows its creator's name, so the query did
the lazy thing:

```ts
include: { user: true }   // 😱 the entire user row
```

That serialized the **whole user object** into a public JSON response: email address,
verification status, everything. For every publisher. To anyone who opened devtools.

**The fix.** Ask for exactly what the UI needs:

```ts
select: { user: { select: { name: true } } }   // name. only the name.
```

**Takeaway.** `include` is a data leak waiting to happen; `select` is a contract.
On any public endpoint, treat every field you return as published to the entire
internet — because it is.

---

## Lesson 14: OAuth "Sign in with Google" — three traps nobody warns you about

**The story.** Adding Google/GitHub sign-in looked like a config change. It was
three distinct ambushes.

**Trap 1 — a missing database column broke it 100% of the time.** My `User` table
had no `image` column. Google and GitHub *always* send a profile picture, the auth
library always tried to write it, and so **every first-time social sign-in failed**
with a generic "failed to create user." Email/password signup only worked by accident
— that flow never sends an image. Lesson: your schema must accommodate everything a
provider sends, not just what your own forms send.

**Trap 2 — half-configured providers fail on the *provider's* page.** If you set
`GOOGLE_CLIENT_ID` but forget the secret, better-auth doesn't throw — it *warns* and
registers the provider anyway. Users see a working Google button that dead-ends on
Google's own `invalid_client` error page, which looks like Google's fault. The fix is
structural — a helper that registers a provider only when **both** id and secret
exist:

```ts
// both-or-neither, enforced in code rather than by discipline
if (clientId && clientSecret) providers.google = { clientId, clientSecret };
```

…and a public `GET /api/public/config` that reports which providers the server can
actually service, so the client only renders buttons that will work.

**Trap 3 — after login, users landed on the wrong website.** The auth-UI library
has a `baseURL` setting that I "correctly" pointed at the API. Wrong: that setting is
the **front-end** origin that OAuth redirects return to. Users completed Google login
and got dumped onto the API domain, staring at raw JSON.

**Takeaway.** OAuth failures show up in other people's UIs (Google's error page, your
API's JSON) which makes them miserable to trace. Make invalid configurations
*impossible* (both-or-neither), and always ask of every URL setting: *which of my two
origins does this actually mean?*

> **🔍 Going deeper — email verification's silent default.** Configuring
> `sendVerificationEmail` alone sends **nothing**: the library resolves
> `sendOnSignUp ?? requireEmailVerification`, and both default to falsy. You must set
> `sendOnSignUp: true` explicitly. Meanwhile `requireEmailVerification: true` is a
> trap in the other direction — it blocks sign-in for unverified users while the only
> "resend email" button sits *behind* a login they can't complete. A lockout with no
> recovery path. I left requirement off and verification advisory.

---

## Lesson 15: An iframe with user content is a hostile embassy

**The story.** The heart of ParuAI's UI is an iframe rendering **AI-generated HTML** —
which, since users steer the AI, is effectively *user-supplied code running inside my
app*. The visual editor works by injecting a script into that page which reports
clicks back to the parent via `postMessage`.

Two things keep this from being a security hole:

**1. The sandbox attribute.** The iframe runs with a `sandbox` allowlist. The
critical *omission* is `allow-top-navigation` — without it, a generated page cannot
redirect the whole builder to another site (a classic trick for phishing).

**2. Verifying who's talking.** Anyone — any tab, any embedded ad — can call
`postMessage` at my window. So the listener checks the sender's identity:

```ts
// client/src/components/projects/ProjectPreview.tsx (essence)
if (event.source !== iframeRef.current?.contentWindow) return;
```

Without that line, any malicious page could puppet the visual editor.

**Takeaway.** `postMessage` is a public mailbox: always verify `event.source` (or
`event.origin`) before acting on a message. And sandbox attributes work by
*omission* — know which capability each missing flag denies.

---

## Lesson 16: Password reset links must point at the right one of your two websites

**The story.** I wired up "forgot password" and the emails went out fine — but
clicking the link landed on `Cannot GET /auth/reset-password`. The auth library
builds its reset URL relative to *itself*, i.e. the **API** server. But the
reset-password *page* is a React route that only exists on the **client** domain.

**The fix.** Take the raw token from the library and build the link myself, aimed
explicitly at the client:

```ts
const link = `${CLIENT_URL}/auth/reset-password?token=${token}`;
```

**Takeaway.** The moment your front-end and back-end live on different domains,
audit every URL your system *generates* — emails, redirects, OAuth callbacks — and
ask: which origin should this resolve against? Libraries assume one origin; you have
two.

> **🔍 Going deeper.** The *verification* email is the mirror-image case: there the
> link **must** point at the API, because the API's `GET /api/auth/verify-email`
> endpoint is what actually flips the verified flag — only its post-verification
> `callbackURL` gets rewritten to the client. Same principle, opposite answer.
> There's no rule like "always use the client URL" — only the question "who needs to
> *handle* this request?"

---

# Part 3 — Architecture & React

## Lesson 17: Money math must be atomic — my credits went to −20

**The story.** Users spend 5 credits per generation. My first implementation was the
obvious one: read the balance, check `credits >= 5`, then decrement. I tested it by
firing **5 simultaneous requests at an account with 5 credits**. All five passed the
check (they all read "5" before any of them wrote), all five decremented, and the
balance landed at **−20** — four free generations.

This is a **TOCTOU race** (time-of-check to time-of-use): the world changed between
looking and acting.

**The fix.** Put the check *inside* the write, as one atomic statement:

```ts
// server/controllers/userController.ts
const { count: charged } = await prisma.user.updateMany({
  where: { id: userId, credits: { gte: PROJECT_COST } },  // check…
  data: { credits: { decrement: PROJECT_COST } },          // …and act, atomically
});

if (charged === 0) {
  return res.status(403).json({ message: "add credits to create more projects" });
}
```

The database evaluates the condition and the decrement as one operation. Now at most
`floor(balance / cost)` concurrent charges can ever succeed, and the balance can't go
below zero — no locks, no transactions, one conditional `UPDATE`.

**Takeaway.** *Check-then-act* across two statements is a race, always. Push the
condition into the write. And test money paths with **concurrent** requests — a bug
like this is invisible to sequential testing.

> **🔍 Going deeper — the refund choreography.** The pattern is *charge up front,
> refund in `catch`*. Two refinements that matter: (1) the revision handler tracks a
> `charged` boolean so the catch only refunds if the charge actually happened —
> otherwise an early auth failure triggers a refund attempt with an undefined user
> ID, throwing a second error on top of the first; (2) after charging, *any* failure
> before the project row exists must refund, or a transient insert error silently
> eats 5 credits.

---

## Lesson 18: Background jobs need a plan for dying

**The story.** Generation runs *after* the HTTP response is sent (fire-and-forget), so
when it fails, there's no response left to put the error in. Worse: if the **server
process dies** mid-generation (deploys and free-tier restarts guarantee this), the
project is stranded — charged, code-less, and the client polls it forever.

**The fix**, in three layers, added over time:

1. **A failure contract.** On any failure the job refunds the credits and writes a
   chat message containing the marker `[generation-failed]`. The client's polling
   loop matches that exact string and stops. (This marker is written on the server
   and matched on the client — change it on one side only and the client polls
   forever. That pair of files is effectively one file.)
2. **A status column.** `pending | generating | ready | failed` on the project row —
   explicit state instead of inferring from side effects (Lesson 5).
3. **A boot sweep.** On startup, the server finds rows stuck in `generating` that
   have no live job, marks them `failed`, refunds, and writes the marker. Deaths get
   cleaned up on resurrection.

**Takeaway.** A background job needs: a durable record that it *started*, a
guaranteed record when it *ends* (either way), and a janitor for jobs that died
without saying goodbye. If you only build the happy path, restarts will strand users.

> **🔍 Going deeper — the sweep must not kill the living.** The scary failure mode of
> a janitor is sweeping a job that's *still running* or one that *just finished*. The
> sweep is guarded twice: a `hasLiveJob()` check against the in-memory job registry,
> and a compare-and-swap that re-asserts `current_code: null` in the UPDATE's WHERE
> clause — so if the generation landed between the check and the write, the write
> matches zero rows. Also, semantics matter: a failed *revision* returns the project
> to `ready`, not `failed`, because the previous document is still intact. `failed`
> means "never produced anything" — get that wrong and the sweep refunds working
> projects.

---

## Lesson 19: Never edit history — snapshot it

**The story.** Users iterate: generate, revise, revise again, hate it, want Tuesday's
version back. That only works if nothing is ever overwritten in place.

**The design.** Every AI run (and every manual save) creates an immutable **Version**
row — a full snapshot of the HTML. The project points at the current one. Rollback
doesn't delete anything; it copies an old snapshot forward as the new current state.
Undo is trivial when history is append-only.

**The performance catch.** Each snapshot is a complete ~40 KB HTML document, and the
project page polls every 10 seconds. Early on, the poll response included **every
version's full code** — hundreds of KB per poll, per user, forever. The fix: the poll
returns only version *metadata* (`{ id, timestamp, description }`), and the code for
one specific version is fetched on demand when you actually preview it.

**Takeaway.** Append-only snapshots make undo/rollback almost free to build. But
split your reads: **lists get metadata, details get content.** Never ship N large
blobs to render N list rows.

---

## Lesson 20: The invisible line that broke every layout — quirks mode

**The story.** Users reported that pages looked subtly *different* — spacing off,
boxes the wrong size — but only **after saving** in the editor, and never on first
generation. Same HTML, different layout. This one hurt.

**The cause.** When the editor exports the page, it serializes the iframe's live DOM
with `document.documentElement.outerHTML`. Here's the trap: **that string never
includes `<!DOCTYPE html>`** — the doctype isn't part of the element tree. So the
first manual save silently persisted a doctype-less document, and every browser
renders those in **quirks mode**: an ancient compatibility mode with different
box-sizing math. The AI-generated original had the doctype; the saved copy didn't.

**The fix.** A tiny guard, applied on both the client (`getCode()`) and the server
(save endpoint):

```ts
// server/lib/html.ts
export const ensureDoctype = (code: string): string =>
  /^\s*<!doctype/i.test(code) ? code : `<!DOCTYPE html>\n${code}`;
```

**Takeaway.** Serialization is lossy in ways you won't notice until much later.
When you round-trip a document (parse → edit → serialize), diff the output against
the input at least once — you'll be surprised what fell off.

> **🔍 Going deeper — the same function had a second, sneakier bug.** `getCode()`
> also strips the editor's injected helper script before export (users must not
> download my editor code inside their website). Originally it stripped it from the
> **live iframe DOM** — so after one click of Download, the injected script was gone
> from the running page, and click-to-select silently died. Save *accidentally*
> healed it (saving triggers a refetch, which reloads the iframe); Download didn't.
> A bug whose symptom is "the feature dies, but only after using an unrelated
> feature, and sometimes fixes itself" — that's what mutating shared state during a
> read looks like. The fix: `cloneNode(true)` first, strip the clone. **Reads must
> never mutate.**

---

## Lesson 21: Heavy dependencies ride in the back — lazy loading CodeMirror

**The story.** The Code tab uses CodeMirror, a full code editor. Bundled naively, it
added **~577 KB** to the app — roughly as large as *everything else combined* — paid
by every visitor, including the majority who never open the Code tab.

**The fix.** `React.lazy` at module scope:

```tsx
// client/src/pages/Projects.tsx
const CodeEditorPanel = lazy(() => import("../components/projects/CodeEditorPanel"));
```

Vite automatically splits it into a separate chunk, downloaded only when the tab is
first opened.

**Takeaway.** Before adding a heavy dependency, ask: *what fraction of sessions
actually use this?* If it's not "most," lazy-load it. And leave the bundler's size
warning **on** — mine now fires for exactly that chunk, which is the tool working,
not a nuisance to silence.

> **🔍 Going deeper — two traps around this.**
>
> **The `display:none` trap:** CodeMirror measures its container on mount. Mount it
> inside a hidden box and it measures 0×0 and renders collapsed. So the code panel
> mounts *only while its tab is active* — while the preview wrapper is never
> unmounted, merely `hidden` via className, because unmounting the iframe reloads it
> and destroys unsaved visual edits. Two panels, two *opposite* mounting strategies,
> each forced by its component's internals.
>
> **The phantom-dependency trap:** import only the packages you declared
> (`@uiw/react-codemirror`, `@codemirror/lang-html`, the theme). Their internals
> (`@codemirror/state` etc.) arrive transitively — import those directly and npm may
> resolve a *second copy*, and CodeMirror with duplicate `@codemirror/state`
> instances fails with a baffling `Unrecognized extension value`. If a package isn't
> in *your* `package.json`, don't import it, even though it happens to resolve.

---

## Lesson 22: Derive state during render — my favorite React trick from this project

**The story.** The Code tab holds a draft of the HTML you're editing. Meanwhile, an
AI revision or rollback can change the project's real code underneath you — at which
point your draft is stale and must be invalidated. The textbook answer is an effect:
"watch `current_code`, reset the draft when it changes." But effects that set state
cause extra render passes, and this repo's lint config (React Compiler rules) flags
`set-state-in-effect` as an outright **error**.

**The fix.** Tag the draft with what it was based on, and *compare during render*:

```tsx
// essence of the pattern in Projects.tsx
const [draft, setDraft] = useState({ code: "", basedOn: "" });

// during render — no effect, no subscription:
const draftIsStale = draft.basedOn !== project.current_code;
const editorValue  = draftIsStale ? project.current_code : draft.code;
```

When the underlying code changes for *any* reason — AI revision, rollback, manual
save, even a path I add next year — the comparison invalidates the draft
automatically. There's no event to forget to handle, because there's no event
handling at all. Staleness is a *fact computed from data*, not a *transition I have
to catch*.

**Takeaway.** Before writing `useEffect` to synchronize two pieces of state, try
deriving one from the other during render. Effects for derivation are where React
bugs breed; derived values can't be out of date.

> **🔍 Going deeper — state ownership.** This app uses zero state libraries — no
> Redux, no React Query. What keeps that sane is strict ownership: `Projects.tsx`
> owns the `project` object, children receive it (and `setProject`) as props, and
> server state is re-fetched rather than mirrored. A state library earns its keep at
> some scale, but "one owner per piece of state, props flow down" gets you shockingly
> far — and there's nothing to learn before reading the code.

---

## Lesson 23: Put loading-state cleanup in `finally` — the permanent spinner bug, ×5

**The story.** Five separate pages had the same bug:

```tsx
setLoading(true);
const { data } = await api.get("/api/user/projects");
setProjects(data.projects);
setLoading(false);        // ← never runs if the request throws
```

One failed request (server cold-starting, network blip) and the page shows a spinner
**forever** — no error, no retry, just eternal spinning. Five times. Same shape.

**The fix**, plus the repo's other error-handling convention:

```tsx
try {
  setLoading(true);
  const { data } = await api.get("/api/user/projects");
  setProjects(data.projects);
} catch (error) {
  toast.error(getErrorMessage(error));   // ONE shared error-extractor
} finally {
  setLoading(false);                     // runs on success AND failure
}
```

`getErrorMessage()` exists because untangling an axios error
(`error.response?.data?.message ?? error.message ?? "Something went wrong"`) was
being reimplemented, slightly differently, in every catch block.

**Takeaway.** Cleanup that must *always* happen goes in `finally` — make it muscle
memory. And when you fix a bug, immediately grep for its siblings; bugs of this shape
never come alone (this one had four).

---

# Part 4 — Deploying, testing, debugging

## Lesson 24: "Deployed" means three services and every seam between them

**The story.** Localhost is a lie of convenience: one machine, one origin, no cold
starts, env vars in a file. Production ParuAI is the client on **Vercel**, the API on
**Render**, and Postgres on **Neon** — and nearly every deploy-day bug lived on a
*seam* between two of them, not inside any one:

- client ↔ API: cookies (Lesson 9), CORS (Lesson 11), generated URLs (Lesson 16)
- API ↔ database: migrations, connection strings
- API ↔ the outside world: the SMTP block (Lesson 26), model availability (Lesson 4)

Two seam-bugs worth naming:

**The SPA refresh 404.** React Router handles `/projects/abc123` in the browser —
but refresh that page and Vercel's file server looks for a literal file at that path,
finds none, 404s. The fix is a rewrite rule sending every path to `index.html` so
React Router can take over. Every SPA on every static host needs this, and everyone
learns it via the same bug.

**The port you must not set.** Render injects its own `PORT`. Hardcode 3000 and the
platform's routing never finds your process. `process.env.PORT || 3000` — always.

**Takeaway.** Deployment is a topology change, not a copy. Walk every arrow in your
architecture diagram and ask what changed about it: origin? protocol? filesystem?
lifecycle? Each changed answer is a bug you can find before your users do.

---

## Lesson 25: Some env vars are baked into the bundle — Vite's build-time trap

**The story.** I updated `VITE_BASEURL` in Vercel's dashboard, restarted, and nothing
changed. Because for a Vite client app, `import.meta.env.VITE_*` isn't *read* at
runtime — it's **inlined into the JavaScript bundle at build time**, string-replaced
like a macro. There is no server "reading env vars" later; it's static files. So
changing the value requires a **rebuild and redeploy**, not a restart.

The evil twin of this trap: my code had a dev-friendly fallback of
`http://localhost:3000`. Build on Vercel with `VITE_BASEURL` unset, and that fallback
gets baked in — shipping a production bundle where every API call targets **the
visitor's own machine**. Every request fails as an opaque network error with no hint
of why. My mitigation, since I can't throw at build time from here:

```ts
// client/src/configs/axios.ts
if (import.meta.env.PROD && !import.meta.env.VITE_BASEURL) {
  console.error("[ParuAI] VITE_BASEURL is not set in this production build, ...");
}
```

**Takeaway.** For every env var, know *when* it's read: server vars at process start
(restart applies them), client `VITE_*`/`NEXT_PUBLIC_*` vars at build (only a
redeploy applies them). And make missing-config failures **loud** — a fallback that
silently produces a broken build is worse than a crash.

---

## Lesson 26: Free tiers shape your architecture — the day email couldn't use email ports

**The story.** Free hosting isn't just "slower" — it has *missing capabilities* that
force real design changes. My collection:

**Render blocks outbound SMTP ports** (25/465/587) on the free tier — spam
prevention. My nodemailer → Gmail setup didn't error; it **hung until timeout**,
so "forgot password" just spun forever. The fix was architectural: stop speaking
SMTP entirely and send mail via **Brevo's HTTP API** — a plain `fetch` to
`api.brevo.com`, because HTTPS on port 443 is never blocked. (Related gotcha:
Brevo's "authorized IPs" security toggle must stay off — Render's free-tier
outbound IP isn't static, so any whitelist eventually 401s.)

**Cold starts (~50 s).** Render free spins the API down when idle; the first visitor
after a quiet spell waits nearly a minute. That "looks completely broken" unless the
client messaging accounts for it.

**One instance, and I leaned into it.** The SSE stream registry (Lesson 5) and the
boot sweep (Lesson 18) both live in process memory — correct on exactly one instance.
Rather than pretend to scale, I wrote the assumption down in the docs alongside the
upgrade path (Redis pub/sub, disable the sweep) for when it's real.

**Takeaway.** Ask of any free tier: what does it *block*, when does it *sleep*, and
how many *instances* might run? Then either design within those limits or document
precisely which parts break when you outgrow them. Silent assumptions about
infrastructure are the ones that hurt.

> **🔍 Going deeper — the dependency-classification deploy bomb.** Production
> installs run with `NODE_ENV=production`, which **skips devDependencies**. This
> server has no build step — `npm start` runs TypeScript directly through `tsx`, and
> `postinstall` runs `prisma generate` to emit the (gitignored) database client. Both
> feel like "dev tools," but move either into devDependencies and the deploy breaks
> at install/boot time — while localhost, which installs everything, works
> perfectly. The classification question isn't "is this a dev tool?" but "does the
> production process *touch* this?"

---

## Lesson 27: Test the pure core, and design so a pure core exists

**The story.** This project went from 24 tests to **218** — without ever testing an
HTTP route or a React component. Every test targets four files of **pure functions**:
HTML extraction, conversation filtering, the HTML scanner, the audit checks. Pure
functions (same input → same output, no database, no network) are a joy to test:

```ts
// server/lib/html.test.ts (style)
it("strips a preamble before the doctype", () => {
  expect(extractHtml('Here is your code:\n<!DOCTYPE html><html>...')).
    toMatch(/^<!DOCTYPE/);
});
```

No mocks, no setup, hundreds of cases, milliseconds to run. The real lesson is
upstream of testing, though: those functions are only testable because the *logic was
extracted out of the controllers* into `lib/`. The controller stays a thin shell
(parse request → call pure functions → write DB → respond), and the interesting
behavior lives where a test can reach it. My favorite test in the repo asserts that
the 19 audit weights **sum to exactly 100** — it doesn't test behavior, it guards an
invariant against future me.

The equally important discipline is honesty about the gaps: controllers, the SSE
registry, and every React component are **untested**, there's no CI, and the visual
editor was verified only by review and build. The project docs say so explicitly, and
"verified by tests" is never claimed for things that aren't.

**Takeaway.** Don't start with "how do I test my endpoints?" Start with "how do I
move logic *out* of my endpoints into pure functions?" Testability is an architecture
property, not a tooling problem. And write down what is *not* tested — a false sense
of coverage is worse than a known gap.

---

## Lesson 28: Debugging method — what this project actually taught me about finding bugs

Looking back across every war story in this doc, my debugging playbook now looks
like this:

**1. When *everything* fails at once, look outside your code.** All generations
failing wasn't my bug — it was a withdrawn model (Lesson 4). Total failure has a
short list of causes: credentials, external service, config. Your code rarely breaks
*everywhere* simultaneously.

**2. Measure before "fixing" slowness.** Generation felt broken at "minutes per
site." I timed the actual AI calls: 37–72 seconds *each*, two per generation, plus a
~50 s cold start, plus a deliberate rate-limit delay. The system was performing
normally for its constraints — the fix was honest progress UI (streaming), not
performance work. Never optimize what you haven't timed.

**3. The bug is often in a *default* you never chose.** The 10-minute SDK timeout.
`sendOnSignUp` resolving to "send nothing." `sameSite=lax`. The auth-UI `baseURL` of
`""`. When behavior surprises you, read the library's defaults before your own code.

**4. Weird symptom pairs point at parser/config drift.** "CORS passes but auth
403s" = two parsers, one string, one `.trim()` (Lesson 11). When two systems
disagree about the same input, diff how they *read* it.

**5. Reproduce adversarially, not politely.** The credits race only appeared under
*concurrent* requests (Lesson 17). The ownership guarantee was only proven by a
second account attacking all 8 routes (Lesson 12). Nice testing confirms the happy
path; hostile testing finds the bugs that matter.

**6. Write the lesson down where the next person will trip.** This repo's docs are
full of bolded "do NOT do X" lines — each one is a scar with a paragraph explaining
*why*. Six months from now, "don't remove this trim" without the why will just get
removed by someone (me) who thinks it's noise.

---

# The cheat sheet — 25 rules I now live by

**AI / LLM**
1. Sanitize and validate every byte of model output before persisting; the prompt is a request, not a contract.
2. Prefer pipelines of small single-purpose AI calls over one mega-prompt.
3. Set explicit timeouts on every external call — unreachable error handling is no error handling.
4. Model names, endpoints, and limits are configuration with one source of truth, never hardcoded.
5. Streams and caches are cosmetic; pick one authoritative store and refetch from it at every finish line.
6. Never feed the model text your own app wrote; catalog boilerplate in exactly one place.
7. Budget context ruthlessly, and drop history that is no longer *true* (rollbacks!).
8. Deterministic code that grades/feeds the AI is cheaper and more reliable than more AI.

**Auth & security**
9. Cross-domain cookies need `SameSite=None; Secure` — and expect the `__Secure-` cookie-name prefix.
10. Every shared value (origins, markers, costs) is defined once and imported everywhere.
11. Two systems parsing one config string must share the parser — whitespace is a real bug.
12. Authorization lives in the query (`WHERE id AND userId`), and returns 404, not 403.
13. `select` exactly what public endpoints need; `include` on a user relation is a leak.
14. Make invalid config impossible (both-or-neither OAuth creds) and know which origin every URL setting means.
15. Verify `event.source` on every `postMessage`; know what each omitted sandbox flag denies.
16. Audit every generated URL (emails, callbacks) for *which host must handle it*.

**Architecture & React**
17. Check-then-act is a race; put the condition inside the write. Test money paths concurrently.
18. Background jobs need a start record, a guaranteed end record, and a janitor for orphans.
19. History is append-only snapshots; lists get metadata, details get content.
20. Reads must never mutate (clone before stripping), and round-trip serialization loses things (doctype!).
21. Lazy-load anything most sessions don't use; never import a package you didn't declare.
22. Derive state during render instead of syncing it with effects.
23. Loading-state cleanup goes in `finally`; when you fix a bug, grep for its siblings.

**Deploy, testing, debugging**
24. Deployment is a topology change — walk every seam. Know *when* each env var is read (build vs runtime), and make missing config loud.
25. Extract logic into pure functions and test those; be honest in writing about what is *not* tested; when everything fails at once, suspect the outside world first — and measure before optimizing.

---

*Written from the ParuAI codebase as of 2026-07-30. The stories are real; the
scars are documented in `CLAUDE.md` and the git history. If you're learning
full-stack development: build something with real users, real money-like state
(credits), and a real deploy across two domains — the bugs you meet there teach
more than any tutorial.*
