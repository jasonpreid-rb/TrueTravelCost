# Route Cost — deployment package

A vehicle trip cost calculator with an AI-powered estimate feature,
backed by your own OpenAI API key.

```
.
├── index.html          the whole front end — HTML, CSS and JS inline
├── api/
│   └── estimate.js     serverless function that calls OpenAI (keeps your key server-side)
├── package.json
└── .env.example         documents the environment variables you need
```

## How the AI estimate works now

The "Calculate trip cost" button asks an AI model for distance, fuel
consumption, a regional fuel price, maintenance, tyre cost/lifespan and
likely tolls for the vehicle + route you enter. On the deployed site,
that call goes to `api/estimate.js`, a small serverless function that:

1. Receives the prompt from the browser
2. Calls OpenAI's Chat Completions API server-side, using an API key
   that's never exposed to visitors
3. Returns the parsed JSON back to the page

The frontend is written to work in two places without any code changes:
if it detects it's running inside a claude.ai Artifact, it uses that
platform's built-in AI capability directly; everywhere else (your own
domain), it automatically falls back to `POST /api/estimate`. You don't
need to do anything to enable this — it's automatic.

## Deploy it (Vercel)

Vercel is the easiest fit here because `/api/*.js` files become
serverless functions with zero configuration — no separate backend to
stand up.

1. Push this folder to a GitHub repo (or run `vercel` from inside it
   directly — the CLI can deploy without git).
2. Import the repo in Vercel, or run `vercel --prod` from this folder.
3. In the Vercel project's **Settings → Environment Variables**, add:
   - `OPENAI_API_KEY` — your key from platform.openai.com (required)
   - `OPENAI_MODEL` — optional, defaults to `gpt-5-mini` if unset
4. Redeploy after adding the env vars (Vercel doesn't pick up new ones
   on an already-running deployment).

That's it — `index.html` and `api/estimate.js` are both live at your
Vercel URL, same origin, no CORS setup needed.

### Local testing

```
npm i -g vercel     # if you don't already have it
vercel dev
```

This runs the static file and the `/api/estimate` function together
locally, using a `.env` file (copy `.env.example` to `.env` and fill in
your key — `.env` is for local dev only, never deploy it or commit it).

## Deploying somewhere other than Vercel

- **Netlify**: move `api/estimate.js` to `netlify/functions/estimate.js`
  and change its export to Netlify's `exports.handler = async (event) => {...}`
  signature (different from Vercel's `(req, res)` — the request/response
  handling needs a small rewrite, not just a file move). Set the same
  env vars in Netlify's dashboard. Happy to write that version if you'll
  be hosting on Netlify instead.
- **Your own Node server / rippingbombs.com infrastructure**: the logic
  in `api/estimate.js` is plain Node with the global `fetch` — wrap it
  in an Express route (`app.post('/api/estimate', ...)`) or similar and
  it'll work the same way. Static `index.html` can be served from
  anywhere alongside it.
- **A static host with no server at all** (GitHub Pages, S3, etc.): the
  AI estimate feature specifically needs *some* server to hold the API
  key, so plain static hosting won't support it — everything else on
  the page (manual entry, the Maps link, the route diagram, copy
  summary) still works with zero backend if you'd rather skip this part.

## Cost & usage notes

- Every click of "Calculate trip cost" is one OpenAI API call, billed
  to your account under normal OpenAI pricing for whichever model you
  set in `OPENAI_MODEL`.
- There's no rate limiting on `api/estimate.js` yet — anyone who can
  reach your deployed URL can trigger calls (and cost). Worth adding
  before this gets real traffic: e.g. a simple per-IP rate limit, or
  gating the button behind login. Say the word if you want that added.
- Responses are capped by OpenAI's own token limits for the model; the
  prompt asks for a small, fixed-shape JSON object, so this shouldn't
  be a practical concern.

## Still claude.ai-only

**"Save this trip"** and the **Saved trips** list still only work
inside a claude.ai Artifact — they use that platform's shared document
storage, which isn't something this deployment has access to. On your
own domain that button greys itself out automatically (same graceful-
fallback pattern as everything else here) — the rest of
the page — including the OpenAI-backed estimate — works fully
standalone. If you want save/share working on your own site too,
that's a similar shape to the estimate feature: a small backend
endpoint plus a real database (or even just a lightweight one like
Vercel KV or a Postgres add-on) — happy to build that next if useful.
