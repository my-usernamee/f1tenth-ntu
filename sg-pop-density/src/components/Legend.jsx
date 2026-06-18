import { NO_DATA_COLOR, METRIC_BY_KEY } from "@/lib/colorScale";
import { formatCompact } from "@/lib/formatters";

export default function Legend({ metric, stops }) {
  const metricConfig = METRIC_BY_KEY[metric];
  const min = stops?.[0]?.value;
  const max = stops?.[stops.length - 1]?.value;

  return (
    <section className="civic-panel pointer-events-auto rounded-lg p-3">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Legend
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-slate-100">
            {metricConfig?.shortLabel || metric}
          </p>
        </div>
        <div className="text-right text-[11px] leading-4 text-slate-400">
          <div>{formatCompact(min)}</div>
          <div>{formatCompact(max)}</div>
        </div>
      </div>
      <div
        className="h-2 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${stops
            .map((stop) => stop.color)
            .join(", ")})`
        }}
      />
      <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-[#05080c] px-1.5 py-1 text-[11px] text-slate-400 ring-1 ring-white/5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: NO_DATA_COLOR }}
        />
        <span>No data</span>
      </div>
    </section>
  );
}
