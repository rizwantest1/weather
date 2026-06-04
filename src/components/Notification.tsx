"use client";

import { AlertIcon, CloseIcon, RefreshIcon } from "./icons";

interface NotificationProps {
  show: boolean;
  onReload: () => void;
  onDismiss: () => void;
}

/**
 * Toast-style banner shown when a NEW BMD forecast is detected during an
 * auto-refresh poll. Lets the user apply the update immediately.
 */
export default function Notification({
  show,
  onReload,
  onDismiss,
}: NotificationProps) {
  if (!show) return null;

  return (
    <div
      role="alert"
      className="animate-slide-in fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-sky-200 bg-white p-4 shadow-xl ring-1 ring-black/5 dark:border-sky-500/30 dark:bg-slate-900 dark:ring-white/10 sm:inset-x-auto sm:right-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sky-600 dark:text-sky-400">
          <AlertIcon className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            New BMD forecast available.
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            A newer forecast PDF has been published. Reload to view it.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onReload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
            >
              <RefreshIcon className="h-3.5 w-3.5" /> View latest
            </button>
            <button
              onClick={onDismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
