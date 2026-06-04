/**
 * Shared TypeScript types for the BMD forecast feature.
 */

/** Successful payload returned by `/api/forecast`. */
export interface ForecastResponse {
  /** Absolute URL to the latest forecast PDF (with a cache-busting query param applied client-side). */
  pdfUrl: string;
  /** The PDF file name, e.g. "204915.pdf". */
  fileName: string;
  /** ISO timestamp representing when this data was fetched by our server. */
  updatedAt: string;
  /** Best-effort publication date parsed from the PDF URL path (YYYY-MM-DD) or null. */
  publishedDate: string | null;
  /** Always "BMD". */
  source: "BMD";
}

/** Error payload returned by `/api/forecast` when scraping fails. */
export interface ForecastError {
  error: string;
  source: "BMD";
}

export type ForecastApiResult = ForecastResponse | ForecastError;
