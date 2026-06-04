/**
 * GET /api/pdf?url=<encoded BMD pdf url>
 * Proxies BMD forecast PDFs with cache-busting and validates the response
 * is actually a PDF (BMD sometimes returns 204 No Content or HTML error
 * pages with 200, both of which break PDF.js).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS ?? 15000);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Allow only BMD-owned hosts to be proxied. */
function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const okProtocol = u.protocol === "https:" || u.protocol === "http:";
    const okHost = /(^|\.)bmd\.gov\.bd$/i.test(u.hostname);
    const okPdf = /\.pdf(\?|#|$)/i.test(u.pathname + u.search);
    return okProtocol && okHost && okPdf;
  } catch {
    return false;
  }
}

/** Pick a sensible Referer for the BMD page that "owns" this PDF. */
function refererFor(target: string): string {
  try {
    const u = new URL(target);
    // Bangla PDFs are linked from /bn/p/Weather-Forecast/, English from /p/Weather-Forecast/.
    // We can't perfectly tell from the PDF URL alone, so default to the English page —
    // BMD accepts either as a valid same-origin referer.
    return `${u.protocol}//www.bmd.gov.bd/p/Weather-Forecast/`;
  } catch {
    return "https://www.bmd.gov.bd/";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target || !isAllowedUrl(target)) {
    return NextResponse.json(
      { error: "Invalid or disallowed PDF URL." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
        "Accept-Encoding": "identity", // disable gzip — some upstreams 204 when they can't encode
        Referer: refererFor(target),
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    // Reject 204 No Content and any non-200 — both break PDF.js downstream.
    if (upstream.status !== 200 || !upstream.body) {
      return NextResponse.json(
        {
          error: `Upstream PDF responded with HTTP ${upstream.status}. The BMD server returned no PDF content for this URL.`,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Buffer fully so we can validate the magic bytes before sending.
    // BMD PDFs are small (~100-500 KB), so this is cheap and catches HTML
    // error pages disguised as 200.
    const buf = Buffer.from(await upstream.arrayBuffer());

    if (buf.length === 0) {
      return NextResponse.json(
        { error: "Upstream returned an empty body." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Validate PDF magic bytes: "%PDF"
    const looksLikePdf =
      buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;

    if (!looksLikePdf) {
      return NextResponse.json(
        {
          error:
            "Upstream returned a response that is not a PDF (likely an HTML error page).",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buf.length),
        "Content-Disposition": "inline",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch the PDF.";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    clearTimeout(timer);
  }
}
