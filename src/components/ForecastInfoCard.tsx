"use client";

import type { ForecastResponse } from "@/lib/types";
import {
  CalendarIcon,
  FileIcon,
  ClockIcon,
  CheckIcon,
  RefreshIcon,
} from "./icons";

interface ForecastInfoCardProps {
  data: ForecastResponse;
  /** When the data was last fetched into the client (Date). */
  lastFetched: Date | null;
  /** Manual refresh handler. */
  onRefresh: () => void;
  /** Whether a refresh is in-flight. */
  refreshing: boolean;
}

/** Format an ISO/Date value as a readable local date. */
function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Format a Date as a readable local time. */
function formatTime(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ForecastInfoCard({
  data,
  lastFetched,
  onRefresh,
  refreshing,
}: ForecastInfoCardProps) {
  return (
    <section
      id="forecast-info-card"
      className="animate-fade-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Status badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <CheckIcon className="h-4 w-4" />
          Latest Forecast Available
        </div>

        {/* Manual refresh */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-sky-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RefreshIcon
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Checking…" : "Refresh"}
        </button>
      </div>

      {/* Detail grid */}
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InfoItem
          icon={<CalendarIcon className="h-5 w-5" />}
          label="Publication Date"
          value={formatDate(data.publishedDate)}
        />
        <InfoItem
          icon={<FileIcon className="h-5 w-5" />}
          label="PDF File Name"
          value={data.fileName}
          mono
        />
        <InfoItem
          icon={<ClockIcon className="h-5 w-5" />}
          label="Last Fetched"
          value={formatTime(lastFetched)}
        />
      </dl>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Source: Bangladesh Meteorological Department (BMD) · Auto-checks for a
        new forecast every 15 minutes.
      </p>
    </section>
  );
}

function InfoItem({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <span className="mt-0.5 text-sky-600 dark:text-sky-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </dt>
        <dd
          className={`mt-0.5 truncate text-sm font-semibold text-slate-800 dark:text-slate-100 ${
            mono ? "font-mono" : ""
          }`}
          title={value}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
