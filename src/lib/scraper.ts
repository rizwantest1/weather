/**
 * =====================================================================
 *  BMD Weather Forecast Scraper
 * =====================================================================
 *  Server-side ONLY module. It downloads the official Bangladesh
 *  Meteorological Department (BMD) "Weather Forecast" page and extracts
 *  the URL of the *currently published* forecast PDF.
 *
 *  Design goals / reliability strategy:
 *  --------------------------------------------------------------------
 *  1. NEVER hardcode a PDF filename. The page is parsed every time and
 *     whatever PDF it currently points to is returned. When BMD uploads
 *     a new forecast the new file is picked up automatically.
 *
 *  2. Resilient to layout changes. We try several extraction strategies
 *     in order of reliability:
 *        (a) The dedicated forecast `<div id="docFrame" src="...pdf">`.
 *        (b) The "Download" anchor inside that block.
 *        (c) Any Google-Docs-viewer embed (`?url=...pdf&embedded=true`).
 *        (d) A regex fallback that finds any BMD `/file/.../pdf/*.pdf`.
 *     If one strategy fails we fall through to the next.
 *
 *  3. Resilient to server rotation. BMD serves the same site from
 *     several mirrors (server6, server8, ...). We try the primary page
 *     first and then any configured fallback pages.
 *
 *  4. The PDF link is normalised to an absolute URL.
 *
 *  This module is imported only from the API route — the scraping logic
 *  is therefore never shipped to the browser.
 * =====================================================================
 */

import * as cheerio from "cheerio";
import type { ForecastResponse } from "./types";

/** Primary BMD forecast page. */
const PRIMARY_URL =
  process.env.BMD_FORECAST_URL ?? "https://www.bmd.gov.bd/p/Weather-Forecast/";

/** Optional comma-separated fallback mirrors. */
const FALLBACK_URLS = (
  process.env.BMD_FALLBACK_URLS ??
  "https://server6.bmd.gov.bd/p/Weather-Forecast/,https://server8.bmd.gov.bd/p/Weather-Forecast/"
)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

/** Network timeout for the BMD request. */
const TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS ?? 15000);

/** A realistic browser User-Agent — some gov sites reject bare clients. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Fetch raw HTML for a given URL with a timeout and browser-like headers.
 * Throws if the response is not OK or the body is empty.
 */
async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Always bypass any intermediate cache so we read the live page.
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      throw new Error(`BMD responded with HTTP ${res.status}`);
    }

    const html = await res.text();
    if (!html || html.length < 200) {
      throw new Error("BMD returned an empty or truncated page");
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the first BMD forecast PDF URL found in the given HTML using a
 * layered set of strategies (most → least reliable).
 *
 * @returns the absolute PDF URL, or null if none could be found.
 */
function extractPdfUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);

  // Helper: turn a possibly relative/protocol-relative href into an
  // absolute URL anchored at the page we scraped.
  const absolutize = (raw?: string | null): string | null => {
    if (!raw) return null;
    let candidate = raw.trim();
    if (!candidate) return null;
    // Fix common malformed BMD links like "https:/server8..." (single slash).
    candidate = candidate.replace(/^https:\/(?!\/)/, "https://");
    try {
      return new URL(candidate, pageUrl).toString();
    } catch {
      return null;
    }
  };

  // Only accept links that genuinely look like BMD forecast PDFs.
  const looksLikeForecastPdf = (url: string | null): url is string =>
    !!url && /\.pdf(\?|#|$)/i.test(url) && /\/file\//i.test(url);

  // --- Strategy (a): the dedicated forecast iframe/div -----------------
  // <div id="docFrame" ... src="https://serverN.bmd.gov.bd/file/.../pdf/NNNN.pdf">
  const docFrameSrc = absolutize($("#docFrame").attr("src"));
  if (looksLikeForecastPdf(docFrameSrc)) return docFrameSrc;

  // --- Strategy (b): the "Download" anchor inside the forecast block ---
  // <a href="...pdf" download="Weather Forecast">Download</a>
  let downloadHref: string | null = null;
  $("a[href]").each((_, el) => {
    if (downloadHref) return;
    const href = absolutize($(el).attr("href"));
    const dl = $(el).attr("download");
    const text = ($(el).text() || "").toLowerCase();
    if (looksLikeForecastPdf(href) && (dl !== undefined || text.includes("download"))) {
      downloadHref = href;
    }
  });
  if (downloadHref) return downloadHref;

  // --- Strategy (c): a Google Docs viewer embed -----------------------
  // dataurl="https://docs.google.com/viewer?url=<PDF>&embedded=true"
  let viewerPdf: string | null = null;
  $("[dataurl], iframe[src]").each((_, el) => {
    if (viewerPdf) return;
    const attr = $(el).attr("dataurl") || $(el).attr("src") || "";
    const match = attr.match(/[?&]url=([^&]+)/i);
    if (match) {
      const decoded = decodeURIComponent(match[1]);
      const abs = absolutize(decoded);
      if (looksLikeForecastPdf(abs)) viewerPdf = abs;
    }
  });
  if (viewerPdf) return viewerPdf;

  // --- Strategy (d): brute-force regex over the whole HTML ------------
  // Catches any BMD /file/YYYY/MM/DD/pdf/NNNN.pdf anywhere in the markup.
  const regex = /https?:\/\/[^\s"'<>]*\/file\/[^\s"'<>]*?\.pdf/gi;
  const matches = html.match(regex);
  if (matches && matches.length > 0) {
    const abs = absolutize(matches[0]);
    if (looksLikeForecastPdf(abs)) return abs;
  }

  return null;
}

/**
 * Parse the publication date (YYYY-MM-DD) from a BMD PDF URL whose path
 * embeds the date, e.g. ".../file/2026/06/03/pdf/204915.pdf".
 *
 * @returns an ISO date string "YYYY-MM-DD" or null if not derivable.
 */
function parsePublishedDate(pdfUrl: string): string | null {
  const m = pdfUrl.match(/\/file\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
  if (!m) return null;
  const [, y, mo, d] = m;
  const yyyy = y.padStart(4, "0");
  const mm = mo.padStart(2, "0");
  const dd = d.padStart(2, "0");
  // Validate it is a real date.
  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Extract just the file name (e.g. "204915.pdf") from a PDF URL. */
function parseFileName(pdfUrl: string): string {
  try {
    const path = new URL(pdfUrl).pathname;
    return decodeURIComponent(path.split("/").pop() || "forecast.pdf");
  } catch {
    return "forecast.pdf";
  }
}

/**
 * Scrape the latest BMD forecast PDF.
 *
 * Tries the primary page first, then any fallback mirror pages. Throws a
 * descriptive Error if every attempt fails so the API route can surface a
 * graceful message to the user.
 */
export async function scrapeLatestForecast(): Promise<ForecastResponse> {
  const candidates = [PRIMARY_URL, ...FALLBACK_URLS];
  const errors: string[] = [];

  for (const pageUrl of candidates) {
    try {
      const html = await fetchHtml(pageUrl);
      const pdfUrl = extractPdfUrl(html, pageUrl);

      if (!pdfUrl) {
        errors.push(`No PDF link found on ${pageUrl}`);
        continue;
      }

      return {
        pdfUrl,
        fileName: parseFileName(pdfUrl),
        publishedDate: parsePublishedDate(pdfUrl),
        updatedAt: new Date().toISOString(),
        source: "BMD",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${pageUrl}: ${message}`);
      // Try the next candidate.
    }
  }

  throw new Error(
    `Unable to retrieve the latest BMD forecast. ${errors.join(" | ")}`
  );
}
