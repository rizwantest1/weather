/**
 * GET /api/forecast
 * ---------------------------------------------------------------------
 * Server-side endpoint that scrapes the BMD Weather Forecast page and
 * returns the latest PDF metadata as JSON. The scraping logic itself
 * lives in `@/lib/scraper` and is NEVER exposed to the browser.
 *
 * Response (200):
 *   {
 *     "pdfUrl": "...",
 *     "fileName": "...",
 *     "updatedAt": "...",
 *     "publishedDate": "...",
 *     "source": "BMD"
 *   }
 *
 * Response (502) when BMD is unreachable / unparseable:
 *   { "error": "...", "source": "BMD" }
 *
 * A small in-memory cache (TTL configurable via SCRAPE_CACHE_TTL) avoids
 * hammering BMD when many clients poll at once, while still surfacing new
 * forecasts quickly.
 */

import { NextResponse } from "next/server";
import { scrapeLatestForecast } from "@/lib/scraper";
import type { ForecastResponse } from "@/lib/types";

// Always run dynamically (no static optimisation / route caching).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_TTL_MS = Number(process.env.SCRAPE_CACHE_TTL ?? 300) * 1000;

// Module-level cache (per server instance / lambda warm container).
let cache: { data: ForecastResponse; expires: number } | null = null;

export async function GET(request: Request) {
  // A `?fresh=1` query param forces a cache bypass (used by manual refresh).
  const url = new URL(request.url);
  const forceFresh = url.searchParams.get("fresh") === "1";

  const now = Date.now();

  // Serve from cache when valid and not explicitly bypassed.
  if (!forceFresh && cache && cache.expires > now) {
    return jsonNoStore(cache.data);
  }

  try {
    const data = await scrapeLatestForecast();
    cache = { data, expires: now + CACHE_TTL_MS };
    return jsonNoStore(data);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error while contacting BMD.";

    // If we have a stale cache, prefer returning it (degraded but useful).
    if (cache) {
      return jsonNoStore(cache.data, { stale: true });
    }

    return NextResponse.json(
      { error: message, source: "BMD" as const },
      {
        status: 502,
        headers: noStoreHeaders(),
      }
    );
  }
}

/** Build a JSON response that browsers and CDNs must never cache. */
function jsonNoStore(data: ForecastResponse, extra?: { stale?: boolean }) {
  const headers = noStoreHeaders();
  if (extra?.stale) headers["X-Forecast-Stale"] = "1";
  return NextResponse.json(data, { headers });
}

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}
