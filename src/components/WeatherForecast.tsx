"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ForecastResponse, ForecastApiResult } from "@/lib/types";
import ForecastInfoCard from "./ForecastInfoCard";
import PdfViewer from "./PdfViewer";
import Notification from "./Notification";
import { AlertIcon, RefreshIcon } from "./icons";

/** Auto-refresh interval: 15 minutes (in ms). */
const AUTO_REFRESH_MS = 15 * 60 * 1000;

type Status = "loading" | "ready" | "error";

/**
 * Top-level client orchestrator for the forecast feature:
 *  - Fetches forecast metadata from /api/forecast.
 *  - Renders the info card + PDF.js viewer.
 *  - Polls every 15 minutes; if a new PDF is detected, shows a toast.
 *  - Applies cache-busting so updated-but-same-URL PDFs always refresh.
 */
export default function WeatherForecast() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Cache-buster token forces the PDF viewer to re-fetch fresh bytes.
  const [cacheBuster, setCacheBuster] = useState<number>(() => Date.now());

  // Pending new forecast detected by a background poll (awaiting user action).
  const [pendingUpdate, setPendingUpdate] = useState<ForecastResponse | null>(
    null
  );

  // Track the currently displayed signature to detect changes.
  const currentSigRef = useRef<string>("");

  /**
   * Build a signature that captures "is this a different forecast?".
   * Includes the URL, file name and published date.
   */
  const signatureOf = (d: ForecastResponse) =>
    `${d.pdfUrl}|${d.fileName}|${d.publishedDate ?? ""}`;

  /** Fetch the latest forecast from our API. */
  const fetchForecast = useCallback(
    async (opts?: { fresh?: boolean }): Promise<ForecastResponse | null> => {
      const qs = opts?.fresh ? "?fresh=1" : "";
      const res = await fetch(`/api/forecast${qs}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const json = (await res.json()) as ForecastApiResult;
      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json;
    },
    []
  );

  /** Initial load. */
  const initialLoad = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await fetchForecast();
      if (!result) throw new Error("Empty response");
      currentSigRef.current = signatureOf(result);
      setData(result);
      setCacheBuster(Date.now());
      setLastFetched(new Date());
      setStatus("ready");
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Bangladesh Meteorological Department is temporarily unavailable."
      );
      setStatus("error");
    }
  }, [fetchForecast]);

  /** Manual refresh (user clicked Refresh). Always applies immediately. */
  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await fetchForecast({ fresh: true });
      if (result) {
        currentSigRef.current = signatureOf(result);
        setData(result);
        // New cache-buster guarantees fresh PDF bytes even if URL is unchanged.
        setCacheBuster(Date.now());
        setLastFetched(new Date());
        setStatus("ready");
        setPendingUpdate(null);
      }
    } catch {
      /* keep showing existing forecast on transient failures */
    } finally {
      setRefreshing(false);
    }
  }, [fetchForecast]);

  /** Background poll — only notifies; does not disrupt the current view. */
  const backgroundPoll = useCallback(async () => {
    try {
      const result = await fetchForecast({ fresh: true });
      if (!result) return;
      const sig = signatureOf(result);
      if (sig !== currentSigRef.current) {
        // A genuinely new forecast — surface a notification.
        setPendingUpdate(result);
      } else {
        // Same forecast: still refresh "last fetched" and bust the PDF cache
        // silently so updated-in-place files are picked up over time.
        setLastFetched(new Date());
      }
    } catch {
      /* ignore transient poll failures */
    }
  }, [fetchForecast]);

  // Apply a pending update when the user clicks "View latest".
  const applyPendingUpdate = useCallback(() => {
    if (!pendingUpdate) return;
    currentSigRef.current = signatureOf(pendingUpdate);
    setData(pendingUpdate);
    setCacheBuster(Date.now());
    setLastFetched(new Date());
    setPendingUpdate(null);
  }, [pendingUpdate]);

  // Initial fetch on mount.
  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  // 15-minute auto-refresh timer + refresh when tab becomes visible again.
  useEffect(() => {
    const id = setInterval(backgroundPoll, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") backgroundPoll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [backgroundPoll]);

  // ---- Render states ----------------------------------------------------

  if (status === "loading") {
    return <LoadingState />;
  }

  if (status === "error") {
    return <ErrorState message={errorMsg} onRetry={initialLoad} />;
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <ForecastInfoCard
        data={data}
        lastFetched={lastFetched}
        onRefresh={manualRefresh}
        refreshing={refreshing}
      />

      <div className="h-[78vh] min-h-[480px]">
        <PdfViewer
          pdfUrl={data.pdfUrl}
          fileName={data.fileName}
          cacheBuster={cacheBuster}
        />
      </div>

      <Notification
        show={Boolean(pendingUpdate)}
        onReload={applyPendingUpdate}
        onDismiss={() => setPendingUpdate(null)}
      />
    </div>
  );
}

/** Skeleton/loading UI. */
function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-8 w-48 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60"
            />
          ))}
        </div>
      </div>
      <div className="flex h-[60vh] min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-sky-500 dark:border-slate-700 dark:border-t-sky-400" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Fetching the latest BMD forecast…
        </p>
      </div>
    </div>
  );
}

/** Graceful error UI when BMD is unavailable. */
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10">
      <span className="text-rose-500 dark:text-rose-400">
        <AlertIcon className="h-12 w-12" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-rose-700 dark:text-rose-300">
          Forecast temporarily unavailable
        </h2>
        <p className="mt-1 max-w-md text-sm text-rose-600/90 dark:text-rose-300/80">
          We couldn&apos;t reach the Bangladesh Meteorological Department right
          now. This is usually temporary — please try again in a moment.
        </p>
        <p className="mt-2 max-w-md break-words text-xs text-rose-500/70 dark:text-rose-300/60">
          {message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
      >
        <RefreshIcon className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}
