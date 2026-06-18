import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { METRIC_CATEGORIES, MODES, metricsForCategory } from "@/lib/colorScale";

function SelectMenu({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((option) => option.key === value) || options[0];

  useEffect(() => {
    function handlePointerDown(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div ref={ref} className="relative min-w-[150px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 text-left transition hover:border-white/20 hover:bg-black/35 focus:border-teal-300/70 focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </span>
          <span className="block truncate text-[13px] font-semibold text-slate-100">
            {selected?.label}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={["shrink-0 text-slate-400 transition", open ? "rotate-180" : ""].join(" ")}
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-lg border border-white/10 bg-slate-950/96 p-1 shadow-civic backdrop-blur-xl"
          role="listbox"
        >
          {options.map((option) => {
            const active = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
                className={[
                  "block w-full rounded-md px-3 py-2 text-left text-[12px] font-semibold transition",
                  active
                    ? "bg-teal-300 text-slate-950"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                ].join(" ")}
                role="option"
                aria-selected={active}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function MetricToggle({
  mode,
  onModeChange,
  metricCategory,
  onMetricCategoryChange,
  metric,
  onMetricChange
}) {
  const metricOptions = metricsForCategory(metricCategory);

  return (
    <div className="flex flex-wrap gap-2">
      <SelectMenu label="Mode" value={mode} options={MODES} onChange={onModeChange} />
      <SelectMenu
        label="Category"
        value={metricCategory}
        options={METRIC_CATEGORIES}
        onChange={onMetricCategoryChange}
      />
      <SelectMenu
        label="Metric"
        value={metric}
        options={metricOptions}
        onChange={onMetricChange}
      />
    </div>
  );
}
