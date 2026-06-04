import ThemeToggle from "@/components/ThemeToggle";
import WeatherForecast from "@/components/WeatherForecast";
import { CloudIcon } from "@/components/icons";

/**
 * Home page — minimal, mobile-first layout with the forecast at the top.
 * No government chrome, menus or sidebars: just the latest BMD forecast.
 */
export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-sm">
              <CloudIcon className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900 dark:text-white sm:text-lg">
                Bangladesh Weather Forecast
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official BMD forecast · updated automatically
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <WeatherForecast />
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4 text-center sm:px-6">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Data sourced live from the{" "}
          <a
            href="https://www.bmd.gov.bd/p/Weather-Forecast/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            Bangladesh Meteorological Department
          </a>
          . This is an independent viewer and is not affiliated with BMD.
        </p>
      </footer>
    </div>
  );
}
