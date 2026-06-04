/**
 * GET /api/pdf?url=<encoded BMD pdf url>
 * ---------------------------------------------------------------------
 * Streams a BMD forecast PDF through our own server. This serves two
 * purposes:
 *
 *   1. CORS / framing — BMD's PDF host may not send permissive CORS
 *      headers, which can break PDF.js fetching it cross-origin from the
 *      browser. Proxying makes it same-origin.
 *
 *   2. Cache-busting / freshness — we always request the upstream PDF
 *      with `cache: "no-store"` and emit `no-store` headers downstream,
 *      so even when BMD keeps the SAME URL but updates the file contents,
 *      users always receive the newest bytes.
 *
 * Only BMD (*.bmd.gov.bd) PDF URLs are allowed, preventing this endpoint
 * from being abused as an open proxy (SSRF protection).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/pdf,*/*",
      },
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream PDF responded with HTTP ${upstream.status}` },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Stream the PDF bytes straight through to the client.
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
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
