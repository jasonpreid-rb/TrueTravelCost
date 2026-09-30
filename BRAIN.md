# TrueTravelCost: Brain File

Working knowledge for anyone (human or AI) editing truetravelcost.com. Read this first, then change things.
Last updated: 2026-09-30 (added sitemap/robots, social tags, homepage prose, SEO plan; /api/estimate is not AI).

---

## 1. What the site is

A car trip cost calculator at **truetravelcost.com**. It shows what driving *really* costs (fuel or electricity, maintenance, tyres, wear, depreciation, tolls) instead of fuel alone.

- **Individuals:** see the true cost of taking the car (e.g. to compare against the train) and compare up to 3 vehicles.
- **Employers and staff:** check whether a mileage reimbursement covers the real cost.
- **SEO focus:** car comparisons for purchase decisions, true costs for business quoting, reimbursement for staff using private vehicles.
- **Monetisation plan:** fill in as much as possible from free APIs and preset common-knowledge costs, then offer a more comprehensive live-cost upgrade as the call to action. The paid product is a downloadable PDF report; `/example-report/` should look like that report (2 to 3 vehicles, states how each result was calculated).

## 2. Brand

| Item | Value |
|---|---|
| Wordmark | **TrueTravelCost.com**, Calistoga (Google Fonts), mixed case |
| Tagline | *Know what your journey really costs.* Times New Roman italic, small, under the wordmark |
| Motto | Compute · Compare · Commute (in the header markup but hidden by CSS) |
| Logo | Elephant head, `/truetravelcost-elephant-logo.png` |
| Body fonts | IBM Plex Sans (body), IBM Plex Mono (numbers), Space Grotesk (headings) |
| Default theme | **Light.** It never follows the OS. Dark is opt-in via the toggle. |

## 3. Repository layout

```
build.mjs                 build script (Node 18+, no dependencies)
migrate-pages.mjs         one-off migration for old-style pages (already run; keep for reference)
BRAIN.md                  this file
api/                      Vercel serverless functions (see section 6)
src/
  partials/               head.html, header.html, footer.html  <- shared, edit once
  pages/                  page SOURCES (edit these)
    index.html            the calculator (large, mostly inline CSS and JS)
    buy-a-car/index.html
    how-it-works/index.html
    trips-and-commutes/index.html
    vehicle-running-costs/index.html
    example-report/index.html
    methodology/index.html
  pages-backup/           originals from the migration; safe to delete
public/                   served by Vercel. Static assets plus BUILD OUTPUT
  css/site.css            shared: colour tokens, header, nav, footer, theme toggle
  css/style.css           page styles for the inner pages
  js/site.js              theme toggle behaviour
  sitemap.xml             all seven page URLs (update <lastmod> when a page changes; add new pages)
  robots.txt              allows crawling, blocks /api/, points to the sitemap
  og-image.png            1200x630 social share image (elephant logo in navy on off-white)
  *.png, favicon, site.webmanifest, etc.
```

**Golden rule: edit `src/`, never the HTML in `public/`.** The build overwrites every page in `public/` from `src/pages/`.

## 4. Build and deploy

- `node build.mjs` copies each `src/pages/**/*.html` into `public/`, expanding the partials.
- Vercel: Framework Preset **Other**, Build Command `node build.mjs`, Output Directory `public` (default).
- Local machine: Windows, project at `C:\dev\TrueTravelCost`, command prompt and git.
- Workflow: work on a branch, run `node build.mjs`, push, check the Vercel preview link, then merge to `main`.
  ```
  git checkout -b my-change
  node build.mjs
  git add .
  git commit -m "Describe the change"
  git push -u origin my-change
  ```
  After checking the preview: `git checkout main`, `git merge my-change`, `git push`.
- Commit the built `public/*.html` files too. That's the current practice.

## 5. How pages work

Each page in `src/pages/` is plain HTML plus three markers:

```html
<head>
<!-- @include head -->            shared: analytics, fonts, favicons, theme init, site.js
<title>…</title>                  page-specific
<meta name="description" content="…">
<link rel="canonical" href="https://www.truetravelcost.com/…/">
<link rel="stylesheet" href="/css/style.css">   inner pages only
</head>
<body>
<div class="wrap">
<!-- @include header -->
<main> … page content … </main>
<!-- @include footer -->
</div>
</body>
```

- The build adds `<link rel="stylesheet" href="/css/site.css">` just before `</head>`, so it always loads last.
- The nav highlights the current page automatically (`{{current:/path/}}` tokens in `header.html`).
- Optional page-specific footer disclaimer:
  ```html
  <!-- @footer-note -->
  Your text here.
  <!-- @end -->
  ```
  Without it, the default is "TrueTravelCost provides estimates for informational purposes. Actual vehicle and journey costs will vary."
- The build fails loudly on an unresolved `{{…}}` or `<!-- @… -->` marker.
- **Social tags:** `head.html` carries the site-wide ones (`og:type`, `og:site_name`, `og:image`, image size, `twitter:card`). `build.mjs` generates `og:title`, `og:description` and `og:url` per page from that page's own `<title>`, meta description and canonical, so never write them by hand (a hand-written tag is left alone). The build prints a WARNING if a page lacks a title, description, canonical or `<html lang>`.
- `head.html` starts with charset and viewport, before the analytics scripts. Keep it that way.

**Adding a page**
1. Copy `src/pages/buy-a-car/index.html` to `src/pages/<slug>/index.html`, then change the title, description, canonical and `<main>`.
2. Add the link to the nav in `src/partials/header.html` (with a `{{current:/<slug>/}}` token) and to `src/partials/footer.html`.
3. Update the "Explore TrueTravelCost" link list at the bottom of the related pages.
4. Add the URL to `public/sitemap.xml`.
5. Build, push, preview.

**Changing the header, footer or head:** edit the partial, rebuild, and all pages update.

## 6. The calculator (`src/pages/index.html`)

One big file: markup, inline CSS (page-specific only) and inline JS. The shared header/footer come from partials like every other page. Vercel Analytics (`/_vercel/insights/script.js`) is on this page only.

- **Modes:** an audience switch between personal and business (business shows the mileage reimbursement panel).
- **Vehicles:** up to 3 compared side by side. Trim and engine should come from a car database. Servicing, tyre and ownership defaults are anchored to AAA *Your Driving Costs 2025* (US) and scaled for other regions. A `PREMIUM_FACTOR` (1.5) estimates higher costs for premium brands.
- **API routes** (`api/`, serverless):
  - `/api/route`: distance from A to B
  - `/api/tolls`: live tolls for the route via HERE Routing API v8 (`HERE_API_KEY` env var in Vercel). **Tolls must be 0 unless known.**
  - `/api/trims`: makes, models, trims and engines
  - `/api/consumption`: live fuel consumption from EPA / fueleconomy.gov
  - `/api/estimate`: fallback estimates when data is missing. **No AI is used anywhere on the site.** (TODO: document exactly what this route does here and on `/methodology/`.)
- **Data sources:** European fuel prices from fuel-prices.eu (EU Commission Weekly Oil Bulletin, CC BY 4.0). Consumption from fueleconomy.gov. Defaults from AAA. Always keep the attribution in the footer note.
- **Defaults:** default distance is **0**. Prefer real data (fuel price, tolls, consumption) over presets wherever it exists.
- **Analytics (GA4, `G-WQHJCLN006`):** custom events `calculator_started` and `calculation_completed`. Don't rename them without updating the reports.
- **Browser storage keys:** `ttc-saved-trips` (saved comparisons), `ttc-theme` (`dark` only; absence means light).
- **Sharing:** WhatsApp, X, LinkedIn and email buttons, plus a Google Maps directions link. Link previews come from the Open Graph tags (see section 5).
- **Homepage prose:** below the capability chips and above the footer note there is a `section.about-ttc` with indexable text (what is included in the true cost, who it is for, where the numbers come from) linking to the inner pages. It exists for search; keep it factual and update it if the features change. Its CSS is in the calculator's inline `<style>`.
- **Language:** `<html lang="en">` for now. Set it to `en-GB` or `en-US` once the primary market is decided.

## 7. Styling system

Three layers, loaded in this order on inner pages: `style.css` then `site.css` (last, so it wins).

1. **`public/css/site.css`** (shared by every page): `:root` colour tokens (light) and the dark overrides under `:root[data-theme="dark"]`, header, nav, footer, theme toggle, compact header layout.
2. **`public/css/style.css`** (inner pages only): typography, hero, content, cards, formula box, tables, highlight, CTA, buttons.
3. **Inline `<style>` in the calculator**: calculator-specific layout only.

Rules of thumb:
- **Use the tokens** (`var(--bg)`, `--panel`, `--text`, `--muted`, `--navy`, `--blue`, `--gold`, `--line`, and so on) instead of hard-coded colours. Dark mode works by swapping the tokens.
- If you must hard-code a colour, add a `:root[data-theme="dark"] …` override. This has already bitten twice: `.formula` (white text on navy) and `.button` text.
- Theme: `data-theme="dark"` on `<html>` is the only switch. The saved choice is applied by an inline script in `head.html` before first paint, and `site.js` handles the toggle.
- Header markup lives **inside `.wrap`**, as does the footer. Don't move them outside.
- Check every change at about 390px wide (there must be no horizontal scroll) and in dark mode.

## 8. Content and SEO conventions

- Inner pages follow a pattern: `.page-hero` (eyebrow, h1, lead, optional button), then `.content` sections, an optional `.feature-grid`, `.formula`, `.highlight`, a `.cta` block, and an "Explore TrueTravelCost" link list.
- Each page needs a unique `<title>`, meta description and canonical (`https://www.truetravelcost.com/<slug>/`, with trailing slash).
- Tone: plain, non-alarmist, honest about uncertainty. Present figures as **estimates, not guarantees**. Don't give tax or legal advice (mileage reimbursement rules vary; cite IRS / HMRC only as examples).
- Copy uses British spelling ("tyres", "kilometre") and € examples on the inner pages.
- **No generic or AI-generated filler pages.** Any data-driven page (per vehicle or per commute) must show figures the site computes itself from sourced data, state the method, and carry short human-written explanation. Start with 20 to 50 useful pages, not thousands of near-duplicates.
- **Current SEO state (2026-09-30):** site is about 5 days old; Search Console shows nothing yet. Homepage has title, description, canonical, social tags and prose. `robots.txt` and `sitemap.xml` are correct. GA4 (`G-WQHJCLN006`) loads on every page with no consent step.
- **Market is undecided.** Data and copy currently mix US (AAA, EPA, imperial toggle), UK spelling and EU (€, fuel-prices.eu). Decide before building per-vehicle pages: US is easiest on the data side; UK/EU needs a European consumption source (WLTP) and regional cost defaults.

## 9. Working agreements

- Jason prefers **complete drop-in replacement files**, not snippets.
- The latest file he uploads is the **source of truth**. He edits files in parallel, so apply changes on top of the latest upload.
- Uploading several files that share a name (all `index.html`) makes them collide. Upload them one at a time, or name them by page.
- Explain steps for Windows command prompt, and don't assume familiarity with git or Node.

## 10. Open items

- [ ] Search Console: verify the domain, submit `https://www.truetravelcost.com/sitemap.xml`, request indexing for all seven pages.
- [ ] Check share previews (LinkedIn Post Inspector, Facebook Sharing Debugger) for the homepage and one inner page.
- [ ] Write an About page (who built it, why, where the data comes from); add to the nav and footer partials and the sitemap.
- [ ] Decide the primary market (US vs UK/EU), then set `<html lang>`, spelling, currency and data sources to match.
- [ ] Build the first 20 to 50 data-driven vehicle or commute pages (see section 8 rules), after the market decision.
- [ ] Publish one linkable asset (e.g. an annual "true cost of driving" dataset for the 20 most popular cars).
- [ ] Cookie consent for GA4 once the market is known (UK/EU rules probably apply).
- [ ] Document what `/api/estimate` does (here and on `/methodology/`).
- [ ] Optional: regenerate `og-image.png` with the Calistoga wordmark.
- [ ] `/example-report/`: make it look like the paid PDF report and state how each figure is calculated. Check its dark mode (its layout hasn't been reviewed).
- [ ] Build the paid comprehensive report / live-cost upgrade CTA.
- [ ] Decide whether Vercel Analytics should run on every page (currently the calculator only).
- [ ] Decide whether to show the Compute · Compare · Commute motto again (hidden via CSS).
- [ ] Delete `src/pages-backup/` once the migration is confirmed good.
- [ ] Update the `<title>` and logo alt text if the "TrueTravelCost.com" wordmark should carry through to them.
