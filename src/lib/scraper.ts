/**
 * =====================================================================
 *  BMD Weather Forecast Scraper
 * =====================================================================
 *  Server-side ONLY module. Scrapes both the English AND Bangla BMD
 *  forecast pages in parallel and returns the URLs of the currently
 *  published PDFs for both languages.
 *
 *  Design goals / reliability strategy:
 *  --------------------------------------------------------------------
 *  1. NEVER hardcode a PDF filename. Each page is parsed every time.
 *  2. Resilient to layout changes — layered extraction strategies.
 *  3. Resilient to server rotation — primary + mirror fallbacks.
 *  4. Resilient to one-language outage — if Bangla fails but English
 *     succeeds we still return a usable response (`bangla: null`).
 *  5. Both PDF links are normalised to absolute URLs.
 * =====================================================================
 */

import * as cheerio from "cheerio";
import type { ForecastLanguageVariant, ForecastResponse } from "./types";

/* ----------------------------- URL config ---------------------------- */

/** Primary BMD English forecast page. */
const PRIMARY_URL_EN =
  process.env.BMD_FORECAST_URL ?? "https://www.bmd.gov.bd/p/Weather-Forecast/";

/** Primary BMD Bangla forecast page. */
const PRIMARY_URL_BN =
  process.env.BMD_FORECAST_URL_BN ??
  "https://www.bmd.gov.bd/bn/p/Weather-Forecast/";

/** Optional comma-separated fallback mirrors (English). */
const FALLBACK_URLS_EN = (
  process.env.BMD_FALLBACK_URLS ??
  "https://server6.bmd.gov.bd/p/Weather-Forecast/,https://server8.bmd.gov.bd/p/Weather-Forecast/"
)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

/** Optional comma-separated fallback mirrors (Bangla). */
const FALLBACK_URLS_BN = (
  process.env.BMD_FALLBACK_URLS_BN ??
  "https://server6.bmd.gov.bd/bn/p/Weather-Forecast/,https://server8.bmd.gov.bd/bn/p/Weather-Forecast/"
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

/* ----------------------------- Fetching ------------------------------ */

/** Fetch raw HTML with a timeout and browser-like headers. */
async function fetchHtml(url: string, acceptLang: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": acceptLang,
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

/* ---------------------------- Extraction ----------------------------- */

/**
 * Extract the first BMD forecast PDF URL from HTML using layered strategies
 * (most → least reliable). Returns the absolute PDF URL or null.
 */
function extractPdfUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);

  const absolutize = (raw?: string | null): string | null => {
    if (!raw) return null;
    let candidate = raw.trim();
    if (!candidate) return null;
    candidate = candidate.replace(/^https:\/(?!\/)/, "https://");
    try {
      return new URL(candidate, pageUrl).toString();
    } catch {
      return null;
    }
  };

  const looksLikeForecastPdf = (url: string | null): url is string =>
    !!url && /\.pdf(\?|#|$)/i.test(url) && /\/file\//i.test(url);

  // (a) #docFrame src
  const docFrameSrc = absolutize($("#docFrame").attr("src"));
  if (looksLikeForecastPdf(docFrameSrc)) return docFrameSrc;

  // (b) <a download> / "Download" anchor
  let downloadHref: string | null = null;
  $("a[href]").each((_, el) => {
    if (downloadHref) return;
    const href = absolutize($(el).attr("href"));
    const dl = $(el).attr("download");
    const text = ($(el).text() || "").toLowerCase();
    // The Bangla page uses "ডাউনলোড" (Bengali for "download") — match either,
    // or rely on the presence of a `download` attribute / a forecast-shaped URL.
    if (
      looksLikeForecastPdf(href) &&
      (dl !== undefined ||
        text.includes("download") ||
        text.includes("ডাউনলোড"))
    ) {
      downloadHref = href;
    }
  });
  if (downloadHref) return downloadHref;

  // (c) Google Docs viewer embed
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

  // (d) Brute-force regex
  const regex = /https?:\/\/[^\s"'<>]*\/file\/[^\s"'<>]*?\.pdf/gi;
  const matches = html.match(regex);
  if (matches && matches.length > 0) {
    const abs = absolutize(matches[0]);
    if (looksLikeForecastPdf(abs)) return abs;
  }

  return null;
}

/** Parse YYYY-MM-DD from a BMD PDF URL (e.g. .../file/2026/06/04/pdf/204944.pdf). */
function parsePublishedDate(pdfUrl: string): string | null {
  const m = pdfUrl.match(/\/file\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
  if (!m) return null;
  const [, y, mo, d] = m;
  const yyyy = y.padStart(4, "0");
  const mm = mo.padStart(2, "0");
  const dd = d.padStart(2, "0");
  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Extract just the file name (e.g. "204944.pdf") from a PDF URL. */
function parseFileName(pdfUrl: string): string {
  try {
    const path = new URL(pdfUrl).pathname;
    return decodeURIComponent(path.split("/").pop() || "forecast.pdf");
  } catch {
    return "forecast.pdf";
  }
}

/* ----------------------- Single-language scrape ---------------------- */

/**
 * Scrape one language variant by trying its primary URL + fallbacks in
 * order. Resolves to a ForecastLanguageVariant on success or throws an
 * Error describing every attempt that failed.
 */
async function scrapeOneLanguage(
  primary: string,
  fallbacks: string[],
  acceptLang: string
): Promise<ForecastLanguageVariant> {
  const candidates = [primary, ...fallbacks];
  const errors: string[] = [];

  for (const pageUrl of candidates) {
    try {
      const html = await fetchHtml(pageUrl, acceptLang);
      const pdfUrl = extractPdfUrl(html, pageUrl);

      if (!pdfUrl) {
        errors.push(`No PDF link found on ${pageUrl}`);
        continue;
      }

      return {
        pdfUrl,
        fileName: parseFileName(pdfUrl),
        publishedDate: parsePublishedDate(pdfUrl),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${pageUrl}: ${message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

/* --------------------------- Public entry ---------------------------- */

/**
 * Scrape the latest BMD forecast — both English and Bangla — in parallel.
 *
 *  - English MUST succeed (English is the primary product; if it fails the
 *    whole response fails and the user sees the graceful error UI).
 *  - Bangla is best-effort. If only Bangla fails, the response still
 *    resolves with `bangla: null` (the UI falls back to "Bangla unavailable").
 */
export async function scrapeLatestForecast(): Promise<ForecastResponse> {
  const [enResult, bnResult] = await Promise.allSettled([
    scrapeOneLanguage(PRIMARY_URL_EN, FALLBACK_URLS_EN, "en-US,en;q=0.9"),
    scrapeOneLanguage(PRIMARY_URL_BN, FALLBACK_URLS_BN, "bn-BD,bn;q=0.9,en;q=0.5"),
  ]);

  if (enResult.status !== "fulfilled") {
    throw new Error(
      `Unable to retrieve the latest BMD English forecast. ${enResult.reason instanceof Error ? enResult.reason.message : String(enResult.reason)}`
    );
  }

  const english = enResult.value;
  const bangla = bnResult.status === "fulfilled" ? bnResult.value : null;

  return {
    english,
    bangla,
    updatedAt: new Date().toISOString(),
    source: "BMD",
    // Legacy mirror fields — keep the EN variant exposed at the root.
    pdfUrl: english.pdfUrl,
    fileName: english.fileName,
    publishedDate: english.publishedDate,
  };
}
