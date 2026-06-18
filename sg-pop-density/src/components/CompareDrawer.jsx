import { X } from "lucide-react";
import { formatDecimal, formatNumber, formatPercent, titleCase } from "@/lib/formatters";

const METRICS = [
  ["Total population", "total_population", formatNumber],
  ["Density per km²", "density_per_km2", formatNumber],
  ["Youth share", "youth_share", formatPercent],
  ["Working-age share", "working_age_share", formatPercent],
  ["Elderly share", "elderly_share", formatPercent],
  ["Chinese share", "chinese_share", formatPercent],
  ["Malay share", "malay_share", formatPercent],
  ["Indian share", "indian_share", formatPercent],
  ["Others share", "others_share", formatPercent],
  ["Ethnic diversity", "ethnic_diversity_index", (value) => formatDecimal(value, 3)],
  ["Residential land", "residential_land_share", formatPercent],
  ["Park/open-space", "park_open_space_share", formatPercent],
  ["Hawker centres", "hawker_centres_inside", formatNumber],
  ["Hawker per 100k", "hawker_per_100k_residents", (value) => formatDecimal(value, 1)],
  ["MRT/LRT within 800m", "mrt_lrt_stations_within_800m_boundary", formatNumber],
  ["Bus stops within 500m", "bus_stops_within_500m_boundary", formatNumber],
  ["Amenity score", "amenity_score", (value) => formatDecimal(value, 1)],
  ["Access gap score", "access_gap_score", (value) => formatDecimal(value, 1)]
];

function valueWidth(left, right, key) {
  const leftValue = Number(left?.properties?.[key]);
  const rightValue = Number(right?.properties?.[key]);
  if (!Number.isFinite(leftValue) && !Number.isFinite(rightValue)) return [0, 0];
  const max = Math.max(leftValue || 0, rightValue || 0, 1);
  return [Math.max(4, ((leftValue || 0) / max) * 100), Math.max(4, ((rightValue || 0) / max) * 100)];
}

function featureName(feature, mode) {
  const props = feature?.properties || {};
  return mode === "electoral"
    ? titleCase(props.electoral_name)
    : titleCase(props.subzone_name);
}

export default function CompareDrawer({ features, open, mode, onClear, onClose }) {
  if (!open || features.length < 2) return null;

  const [left, right] = features;
  const label = mode === "electoral" ? "Compare GRC/SMC" : "Compare subzones";

  return (
    <section className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 backdrop-blur-[2px] lg:items-center">
      <div className="civic-panel w-full max-w-[760px] overflow-hidden rounded-lg">
        <div className="thin-scrollbar max-h-[78vh] overflow-y-auto p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              {label}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-white">
              {featureName(left, mode)}
              <span className="text-slate-500"> vs </span>
              {featureName(right, mode)}
            </h2>
            {mode === "electoral" ? (
              <p className="mt-2 text-[12px] leading-5 text-slate-400">
                Estimated by area-weighted overlay of 2020 census subzones onto 2025 electoral boundaries.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close comparison"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {METRICS.map(([label, key, formatter]) => {
            const [leftWidth, rightWidth] = valueWidth(left, right, key);
            return (
              <div key={key} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-slate-300">
                  <span>{label}</span>
                  <span className="text-slate-500">
                    {formatter(left?.properties?.[key])} / {formatter(right?.properties?.[key])}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-teal-300" style={{ width: `${leftWidth}%` }} />
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-amber-300" style={{ width: `${rightWidth}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClear}
          className="mt-4 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-[12px] font-semibold text-slate-200 transition hover:bg-white/15"
        >
          Clear comparison
        </button>
        </div>
      </div>
    </section>
  );
}
