# Route Cost — deployment package

One file, no build step: `index.html` is the entire site (HTML, CSS and JS
inline, Google Fonts loaded from Google's CDN). Drop it on any static host.

## Deploy it

Pick whichever you already use:

- **Netlify / Vercel** — drag the `index.html` file (or the folder) onto
  their web dashboard, or run `netlify deploy` / `vercel` from this folder.
- **GitHub Pages** — push this folder to a repo, enable Pages on the
  `main` branch, done.
- **Your own server / S3 / Cloudflare Pages / rippingbombs.com hosting** —
  copy `index.html` into the web root (or a subfolder if you want it at
  e.g. `/tools/route-cost/`). No server-side code, no dependencies to
  install.

## What still works outside claude.ai — and what doesn't

This started life as a Claude Artifact, which gave it two features backed
by claude.ai's own infrastructure:

- **"Calculate trip cost"** (the AI estimate for distance, fuel, service,
  tyres and tolls)
- **"Save this trip" / the Saved trips list**

Both depend on a `window.claude` object that only exists inside the
claude.ai artifact viewer. The code already checks for it and fails
gracefully — on your own domain, `window.claude` won't exist, so:

- The **"Calculate trip cost"** button will detect this on load and
  disable itself with the message *"AI lookup isn't available in this
  view — fill in the numbers below by hand."*
- **"Save this trip"** and the saved-trips list will do the same.

Everything else works with zero backend: manual entry across all the
detail panels (distance, fuel, maintenance, tyres, tolls), unit and
currency switching, the live cost breakdown, the "Open in Google Maps"
link, the schematic route diagram, and "Copy summary" to clipboard.

### If you want the AI estimate to work on your own domain

That needs a small server-side piece — a backend endpoint on your own
infrastructure that holds an Anthropic API key and proxies the request
(the browser can't call the Anthropic API directly with a key embedded
in the page; that would expose the key to every visitor). Happy to build
that endpoint plus the small change to `index.html` to call it, if you
want to go that route — just say the word.

### If you want a real embedded Google Map instead of the link-out

On your own domain there's no sandbox restriction, so you could add
Google's official Maps Embed API or JavaScript API with your own API key
and billing. That's a separate, small build task — let me know if you'd
like it added.
