"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ZoomInIcon,
  ZoomOutIcon,
  DownloadIcon,
  ExternalIcon,
  FullscreenIcon,
  CloseIcon,
} from "./icons";

/**
 * Minimal PDF.js typings for the bits we use (loaded from CDN as a global).
 */
interface PdfPageViewport {
  width: number;
  height: number;
}
interface PdfRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}
interface PdfPage {
  getViewport(opts: { scale: number }): PdfPageViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfPageViewport;
  }): PdfRenderTask;
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(opts: {
    url: string;
    withCredentials?: boolean;
  }): { promise: Promise<PdfDocument> };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

const PDFJS_VERSION = "4.8.69";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

/** Load pdf.js as an ES module from the CDN exactly once. */
let pdfJsPromise: Promise<PdfJsLib> | null = null;
function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF.js can only load in the browser"));
  }
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = import(/* webpackIgnore: true */ PDFJS_CDN).then((mod) => {
    const lib = (mod.default ?? mod) as PdfJsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    window.pdfjsLib = lib;
    return lib;
  });
  return pdfJsPromise;
}

interface PdfViewerProps {
  /** The original BMD PDF URL (used for download / open-in-tab). */
  pdfUrl: string;
  /** Suggested download file name. */
  fileName: string;
  /**
   * A cache-busting token. When this changes the PDF is re-fetched and
   * re-rendered — guaranteeing the freshest bytes even if the URL is reused.
   */
  cacheBuster: string | number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;

export default function PdfViewer({
  pdfUrl,
  fileName,
  cacheBuster,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfDocument | null>(null);

  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Route the actual PDF bytes through our same-origin proxy so PDF.js can
  // always fetch them (CORS-safe) and so we control caching (no-store).
  const proxiedUrl = `/api/pdf?url=${encodeURIComponent(pdfUrl)}&v=${cacheBuster}`;

  /** Render all pages of the loaded document at the current scale. */
  const renderAllPages = useCallback(async (doc: PdfDocument, s: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = ""; // clear previous render

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: s });

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page-canvas";
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.scale(ratio, ratio);

      container.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  }, []);

  // Load + render whenever the PDF source or cache-buster changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ url: proxiedUrl }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        await renderAllPages(doc, scale);
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to render the PDF document."
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxiedUrl]);

  // Re-render (without re-fetching) when the zoom scale changes.
  useEffect(() => {
    if (docRef.current && !loading) {
      renderAllPages(docRef.current, scale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Keep fullscreen state in sync with the browser.
  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const zoomIn = () =>
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () =>
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));

  const toggleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* fullscreen may be blocked; ignore */
    }
  };

  const download = () => {
    // Trigger a download via the proxy (forces fresh bytes).
    const a = document.createElement("a");
    a.href = `/api/pdf?url=${encodeURIComponent(pdfUrl)}&v=${cacheBuster}`;
    a.download = fileName || "bmd-forecast.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openInNewTab = () => {
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      ref={wrapperRef}
      className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-white/80 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={zoomOut} label="Zoom out" disabled={scale <= MIN_SCALE}>
            <ZoomOutIcon className="h-5 w-5" />
          </ToolbarButton>
          <span className="min-w-[3.5rem] select-none text-center text-sm font-medium text-slate-600 dark:text-slate-300">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarButton onClick={zoomIn} label="Zoom in" disabled={scale >= MAX_SCALE}>
            <ZoomInIcon className="h-5 w-5" />
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-1">
          <ToolbarButton onClick={download} label="Download PDF">
            <DownloadIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Download</span>
          </ToolbarButton>
          <ToolbarButton onClick={openInNewTab} label="Open in new tab">
            <ExternalIcon className="h-5 w-5" />
            <span className="hidden sm:inline">New tab</span>
          </ToolbarButton>
          <ToolbarButton onClick={toggleFullscreen} label="Fullscreen">
            {isFullscreen ? (
              <CloseIcon className="h-5 w-5" />
            ) : (
              <FullscreenIcon className="h-5 w-5" />
            )}
            <span className="hidden sm:inline">
              {isFullscreen ? "Exit" : "Fullscreen"}
            </span>
          </ToolbarButton>
        </div>
      </div>

      {/* Render surface */}
      <div className="relative flex-1 overflow-auto p-3 sm:p-5">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-100/70 backdrop-blur-sm dark:bg-slate-900/70">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-sky-500 dark:border-slate-700 dark:border-t-sky-400" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Loading forecast PDF…
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="max-w-md text-sm text-rose-600 dark:text-rose-400">
              Could not display the PDF inline: {error}
            </p>
            <button
              onClick={openInNewTab}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
            >
              <ExternalIcon className="h-4 w-4" /> Open PDF directly
            </button>
          </div>
        )}

        <div ref={containerRef} className="flex flex-col items-center" />

        {!loading && !error && numPages > 0 && (
          <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
            {numPages} page{numPages > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/** Small reusable toolbar button. */
function ToolbarButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-sky-400"
    >
      {children}
    </button>
  );
}
