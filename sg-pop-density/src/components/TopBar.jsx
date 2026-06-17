import { Search, X } from "lucide-react";
import MetricToggle from "@/components/MetricToggle";

export default function TopBar({
  metric,
  onMetricChange,
  query,
  onQueryChange,
  results,
  onSelectResult
}) {
  return (
    <header className="pointer-events-none fixed left-0 right-0 top-0 z-40 px-4 pt-4 lg:px-5">
      <div className="civic-panel pointer-events-auto mx-auto grid max-w-[1540px] gap-3 rounded-lg p-3 lg:grid-cols-[minmax(260px,1fr)_minmax(320px,420px)] lg:items-center">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-bold leading-7 text-white">
            SG Population Atlas
          </h1>
          <p className="mt-0.5 text-[12px] font-medium text-slate-400 sm:text-[13px]">
            Explore Singapore&apos;s resident population density by subzone.
          </p>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={17}
          />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search planning area or subzone"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/25 px-9 text-[13px] font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/70 focus:bg-black/35"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          ) : null}

          {query && results.length ? (
            <div className="thin-scrollbar absolute left-0 right-0 top-12 max-h-72 overflow-auto rounded-lg border border-white/10 bg-slate-950/95 p-1 shadow-civic backdrop-blur-xl">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.label}`}
                  type="button"
                  onClick={() => onSelectResult(result)}
                  className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-white/10"
                >
                  <span className="block text-[13px] font-semibold text-white">
                    {result.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    {result.subtitle}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <MetricToggle metric={metric} onMetricChange={onMetricChange} />
        </div>
      </div>
    </header>
  );
}
