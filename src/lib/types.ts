/**
 * Shared TypeScript types for the BMD forecast feature.
 */

/** A single language variant of the forecast PDF. */
export interface ForecastLanguageVariant {
  /** Absolute URL to the PDF on BMD. */
  pdfUrl: string;
  /** The PDF file name, e.g. "204944.pdf". */
  fileName: string;
  /** Best-effort publication date parsed from the PDF URL path (YYYY-MM-DD) or null. */
  publishedDate: string | null;
}

/** Successful payload returned by `/api/forecast`. */
export interface ForecastResponse {
  /** English variant — always present (we fail the response if the EN scrape fails). */
  english: ForecastLanguageVariant;
  /** Bangla variant — null if the BN scrape failed but EN succeeded (degraded mode). */
  bangla: ForecastLanguageVariant | null;
  /** ISO timestamp representing when this data was fetched by our server. */
  updatedAt: string;
  /** Always "BMD". */
  source: "BMD";

  /* ---------------- Legacy fields (kept for backward compatibility) ----------------
   * Mirror the English variant so any existing consumer that still reads
   * `data.pdfUrl` / `data.fileName` / `data.publishedDate` keeps working.
   */
  pdfUrl: string;
  fileName: string;
  publishedDate: string | null;
}

/** Error payload returned by `/api/forecast` when scraping fails. */
export interface ForecastError {
  error: string;
  source: "BMD";
}

export type ForecastApiResult = ForecastResponse | ForecastError;

/** Language tab identifier in the UI. */
export type ForecastLang = "en" | "bn";
