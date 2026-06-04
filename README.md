# Bangladesh Weather Forecast 🌦️

A modern, responsive web app that **automatically displays the latest Bangladesh
Meteorological Department (BMD) weather-forecast PDF** — and nothing else. No
government chrome, no menus, no clutter. Just the freshest official forecast,
fetched dynamically and rendered inline.

> **SEO Title:** Bangladesh Weather Forecast
> **SEO Description:** Latest Bangladesh Meteorological Department forecast PDF updated automatically.

---

## ✨ Features

- **Minimal, modern UI** — forecast at the top, mobile-first responsive layout.
- **Dynamic PDF fetching** — the BMD page is scraped server-side every time; the
  PDF filename is **never hardcoded**. When BMD publishes a new file, the site
  shows it automatically with **no code changes**.
- **Always the freshest bytes** — even if BMD reuses the same URL but updates the
  file contents, aggressive cache-busting (`no-store` headers + version tokens +
  a same-origin PDF proxy) guarantees users see the newest version.
- **Built-in PDF viewer (PDF.js)** with:
  - 🔍 Zoom in / out
  - ⬇️ Download PDF
  - ↗️ Open in new tab
  - ⛶ Fullscreen mode
- **Forecast information card** showing: publication date, PDF filename, last
  fetched time, and a live **"Latest Forecast Available"** status badge.
- **Auto-refresh every 15 minutes** + refresh when the tab regains focus. If a
  new PDF is detected, a toast appears: **"New BMD forecast available."**
- **Robust, well-commented scraping** with multiple fallback strategies and
  server mirrors (server6 / server8 / …).
- **Graceful error & loading states** when BMD is temporarily unavailable.
- **Light / Dark mode** with system-preference detection and no flash (FOUC-free).

---

## 🧱 Tech Stack

| Layer        | Technology                                   |
| ------------ | -------------------------------------------- |
| Framework    | **Next.js 15** (App Router)                  |
| Language     | **TypeScript**                               |
| Styling      | **Tailwind CSS** (class-based dark mode)     |
| PDF rendering| **PDF.js** (loaded from CDN)                 |
| Scraping     | **Cheerio** (server-side only)               |
| Hosting      | **Vercel** (recommended)                     |

---

## 📂 Project Structure

```
webapp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── forecast/route.ts   # Scrapes BMD → returns latest PDF metadata (JSON)
│   │   │   └── pdf/route.ts        # Same-origin PDF proxy (CORS + cache-busting + SSRF guard)
│   │   ├── globals.css             # Tailwind + base styles
│   │   ├── icon.svg                # App favicon
│   │   ├── layout.tsx              # Root layout + SEO metadata + theme init
│   │   └── page.tsx                # Home page (header / main / footer)
│   ├── components/
│   │   ├── ForecastInfoCard.tsx    # Info card + status badge + manual refresh
│   │   ├── Notification.tsx        # "New BMD forecast available" toast
│   │   ├── PdfViewer.tsx           # PDF.js viewer (zoom/download/new-tab/fullscreen)
│   │   ├── ThemeToggle.tsx         # Light / Dark toggle
│   │   ├── WeatherForecast.tsx     # Client orchestrator (fetch + 15-min poll)
│   │   └── icons.tsx               # Inline SVG icons
│   └── lib/
│       ├── scraper.ts              # Well-commented BMD scraping logic
│       └── types.ts                # Shared types
├── .env.example                    # Environment configuration template
├── vercel.json                     # Vercel config (no-store API headers)
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## 🔌 API Endpoints

### `GET /api/forecast`
Scrapes the BMD page server-side and returns the latest PDF metadata. The
scraping logic is **never exposed to the browser**.

```json
{
  "pdfUrl": "https://server6.bmd.gov.bd/file/2026/06/03/pdf/204915.pdf",
  "fileName": "204915.pdf",
  "updatedAt": "2026-06-04T02:43:14.818Z",
  "publishedDate": "2026-06-03",
  "source": "BMD"
}
```

- Add `?fresh=1` to bypass the short server-side cache (used by manual refresh).
- On BMD failure returns `502` with `{ "error": "...", "source": "BMD" }`
  (or a stale cached payload if one exists).

### `GET /api/pdf?url=<bmd-pdf-url>&v=<token>`
Streams a BMD PDF through the same origin so PDF.js can fetch it without CORS
issues, and so we control caching (`no-store`). Only `*.bmd.gov.bd` `.pdf` URLs
are allowed (SSRF protection).

---

## 🛠️ Local Development

```bash
# 1. Install dependencies
npm install

# 2. (Optional) configure environment
cp .env.example .env.local      # all values have sensible defaults

# 3. Run the dev server
npm run dev                     # http://localhost:3000
```

### Production build
```bash
npm run build
npm run start                   # serves the optimized build on port 3000
```

---

## ⚙️ Environment Variables (all optional)

| Variable             | Default                                             | Purpose                                         |
| -------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `BMD_FORECAST_URL`   | `https://www.bmd.gov.bd/p/Weather-Forecast/`        | Primary page to scrape                          |
| `BMD_FALLBACK_URLS`  | `https://server6.bmd.gov.bd/...,server8...`         | Comma-separated mirror pages tried on failure   |
| `SCRAPE_CACHE_TTL`   | `300`                                               | Server cache TTL (seconds) for scrape results   |
| `SCRAPE_TIMEOUT_MS`  | `15000`                                             | Network timeout (ms) when contacting BMD        |

See [`.env.example`](./.env.example).

---

## 🚀 Deploy to Vercel

This app is purpose-built for Vercel (Next.js 15 App Router + serverless API
routes).

### Option A — Vercel Dashboard (easiest)
1. Push this repo to GitHub / GitLab / Bitbucket.
2. Go to <https://vercel.com/new> and **Import** the repository.
3. Vercel auto-detects **Next.js** — keep the defaults:
   - **Build Command:** `next build`
   - **Output:** (managed automatically)
4. *(Optional)* Add any environment variables from the table above under
   **Settings → Environment Variables**. None are required.
5. Click **Deploy**. Your site goes live at `https://<project>.vercel.app`.

### Option B — Vercel CLI
```bash
npm i -g vercel
vercel            # first run links/creates the project (preview deploy)
vercel --prod     # promote to production
```

### Notes
- API routes (`/api/forecast`, `/api/pdf`) run as Vercel serverless functions and
  send `Cache-Control: no-store` (configured in `vercel.json` + `next.config.ts`)
  so forecasts are always fresh.
- No database or external secrets are needed.

---

## 🧠 How the Dynamic Fetching Works

1. The browser calls **`/api/forecast`**.
2. On the server, [`scraper.ts`](./src/lib/scraper.ts) downloads the BMD page and
   extracts the current PDF link using a layered strategy:
   1. `<div id="docFrame" src="…pdf">` (primary),
   2. the **Download** `<a href="…pdf">` anchor,
   3. a Google-Docs-viewer `?url=…pdf&embedded=true` embed,
   4. a regex fallback for any `…/file/…/pdf/*.pdf`.
   If the primary page fails, configured **mirror pages** are tried in turn.
3. The publication date is parsed from the URL path (`…/2026/06/03/…`).
4. The browser renders the PDF via **PDF.js**, fetching bytes through the
   same-origin **`/api/pdf`** proxy with a `?v=<timestamp>` cache-buster.
5. Every **15 minutes** (and on tab focus) the client re-polls. If the forecast
   signature changed, a **"New BMD forecast available."** toast is shown.

---

## ✅ Status

- **Deployment:** Ready for Vercel
- **Last Updated:** 2026-06-04
- **Disclaimer:** Independent viewer. Not affiliated with or endorsed by BMD.
  All forecast data belongs to the Bangladesh Meteorological Department.
