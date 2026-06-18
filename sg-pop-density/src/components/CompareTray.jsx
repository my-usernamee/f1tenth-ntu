import { GitCompareArrows, X } from "lucide-react";
import { titleCase } from "@/lib/formatters";

function featureName(feature, mode) {
  const props = feature?.properties || {};
  return mode === "electoral"
    ? titleCase(props.electoral_name)
    : titleCase(props.subzone_name);
}

export default function CompareTray({
  mode,
  compareMode,
  features,
  onToggle,
  onOpen,
  onClear
}) {
  const [left, right] = features;

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={[
          "fixed bottom-5 left-4 z-30 inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold shadow-civic transition lg:left-5",
          compareMode
            ? "border-amber-200/70 bg-amber-200 text-slate-950"
            : "border-white/10 bg-slate-950/82 text-slate-200 backdrop-blur-xl hover:bg-slate-900/90"
        ].join(" ")}
        aria-pressed={compareMode}
      >
        <GitCompareArrows size={15} />
        Compare
      </button>

      {compareMode ? (
        <section className="civic-panel fixed inset-x-3 bottom-4 z-30 mx-auto max-w-[720px] rounded-lg p-3 lg:bottom-5">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
            <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Slot A
              </p>
              <p className="mt-0.5 truncate text-[12px] font-semibold text-white">
                {left ? featureName(left, mode) : `Select first ${mode === "electoral" ? "GRC/SMC" : "subzone"}`}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Slot B
              </p>
              <p className="mt-0.5 truncate text-[12px] font-semibold text-white">
                {right ? featureName(right, mode) : `Select second ${mode === "electoral" ? "GRC/SMC" : "subzone"}`}
              </p>
            </div>
            <button
              type="button"
              disabled={!left || !right}
              onClick={onOpen}
              className="h-10 rounded-md bg-teal-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              Compare
            </button>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/8 px-3 text-[12px] font-semibold text-slate-200 transition hover:bg-white/15"
            >
              <X size={14} />
              Clear
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
