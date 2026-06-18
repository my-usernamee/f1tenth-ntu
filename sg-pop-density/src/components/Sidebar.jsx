import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis
} from "recharts";
import { CircleDot, X } from "lucide-react";
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  titleCase
} from "@/lib/formatters";

function StatRow({ label, value, emphasis = false }) {
  return (
    <div className="flex items-baseline justify-between gap-5 border-b border-white/10 py-2.5 last:border-b-0">
      <span className="text-[12px] font-medium text-slate-400">{label}</span>
      <span
        className={[
          "text-right font-semibold",
          emphasis ? "text-[20px] text-white" : "text-[13px] text-slate-100"
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function SexSplit({ properties }) {
  const male = properties?.male_population;
  const female = properties?.female_population;
  const total = Number(male || 0) + Number(female || 0);

  if (!total) {
    return (
      <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-[12px] text-slate-400">
        Sex split unavailable for this subzone.
      </p>
    );
  }

  const maleShare = (male / total) * 100;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold">
        <span className="text-cyan-200">Male {formatPercent(maleShare)}</span>
        <span className="text-amber-200">Female {formatPercent(100 - maleShare)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${maleShare}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
        <span>{formatNumber(male)} males</span>
        <span className="text-right">{formatNumber(female)} females</span>
      </div>
    </div>
  );
}

function AgeChart({ data }) {
  const chartData = Array.isArray(data) ? data : [];

  if (!chartData.length) {
    return (
      <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-[12px] text-slate-500">
        No age breakdown available.
      </div>
    );
  }

  return (
    <div className="mt-3 h-48 rounded-lg border border-white/10 bg-black/20 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: -22, right: 4, top: 10, bottom: 0 }}>
          <XAxis
            dataKey="age"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            interval={2}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <ChartTooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            contentStyle={{
              background: "rgba(8, 13, 18, 0.95)",
              border: "1px solid rgba(148, 163, 184, 0.24)",
              borderRadius: 8,
              color: "#e2e8f0"
            }}
            labelStyle={{ color: "#f8fafc", fontWeight: 700 }}
          />
          <Bar dataKey="total" fill="#5eead4" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniBar({ label, value, color = "#5eead4" }) {
  const numeric = Number(value);
  const width = Number.isFinite(numeric) ? Math.max(0, Math.min(numeric, 100)) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
        <span className="font-medium text-slate-400">{label}</span>
        <span className="font-semibold text-slate-100">{formatPercent(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function LandUseMix({ properties }) {
  const segments = [
    ["Residential", properties?.residential_land_share, "#5eead4"],
    ["Commercial", properties?.commercial_land_share, "#fbbf24"],
    ["Industrial", properties?.industrial_land_share, "#fb7185"],
    ["Park/open", properties?.park_open_space_share, "#86efac"],
    ["Transport", properties?.transport_utilities_land_share, "#93c5fd"],
    ["Education", properties?.education_institution_land_share, "#c4b5fd"],
    ["Other", properties?.other_land_share, "#94a3b8"]
  ];

  const hasAny = segments.some(([, value]) => Number.isFinite(Number(value)));
  if (!hasAny) {
    return <p className="mt-3 text-[12px] text-slate-500">No land-use overlay data.</p>;
  }

  return (
    <div className="mt-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        {segments.map(([label, value, color]) => (
          <div
            key={label}
            title={`${label}: ${formatPercent(value)}`}
            style={{
              width: `${Math.max(0, Number(value) || 0)}%`,
              backgroundColor: color
            }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {segments.slice(0, 6).map(([label, value, color]) => (
          <MiniBar key={label} label={label} value={value} color={color} />
        ))}
      </div>
    </div>
  );
}

function EthnicProfile({ properties }) {
  const rows = [
    ["Chinese", properties?.chinese_share, "#5eead4"],
    ["Malay", properties?.malay_share, "#fbbf24"],
    ["Indian", properties?.indian_share, "#93c5fd"],
    ["Others", properties?.others_share, "#f0abfc"]
  ];

  return (
    <div className="mt-3 space-y-3">
      {rows.map(([label, value, color]) => (
        <MiniBar key={label} label={label} value={value} color={color} />
      ))}
      <StatRow
        label="Ethnic diversity index"
        value={formatDecimal(properties?.ethnic_diversity_index, 3)}
      />
    </div>
  );
}

function UrbanContext({ properties }) {
  const noTransport =
    properties?.mrt_lrt_stations_within_800m_boundary === null &&
    properties?.bus_stops_within_500m_boundary === null &&
    properties?.transport_score === null;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Land-use mix
        </p>
        <LandUseMix properties={properties} />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 px-3">
        <StatRow
          label="Hawker centres inside"
          value={formatNumber(properties?.hawker_centres_inside)}
        />
        <StatRow
          label="Hawker per 100k residents"
          value={formatDecimal(properties?.hawker_per_100k_residents, 1)}
        />
        {noTransport ? (
          <div className="border-b border-white/10 py-2.5 text-[12px] font-medium text-slate-400">
            No transport data
          </div>
        ) : (
          <>
            <StatRow
              label="MRT/LRT within 800m"
              value={formatNumber(properties?.mrt_lrt_stations_within_800m_boundary)}
            />
            <StatRow
              label="Bus stops within 500m"
              value={formatNumber(properties?.bus_stops_within_500m_boundary)}
            />
            <StatRow label="Transport score" value={formatDecimal(properties?.transport_score, 1)} />
          </>
        )}
        <StatRow label="Amenity score" value={formatDecimal(properties?.amenity_score, 1)} />
        <StatRow label="Access gap score" value={formatDecimal(properties?.access_gap_score, 1)} />
      </div>
    </div>
  );
}

export default function Sidebar({ feature, mode = "subzone", onClose }) {
  const properties = feature?.properties;
  const hasData = properties?.has_data;
  const isElectoral = mode === "electoral";

  if (!properties) return null;

  return (
    <aside className="civic-panel fixed inset-x-3 bottom-3 z-20 max-h-[48vh] overflow-hidden rounded-lg lg:bottom-5 lg:left-auto lg:right-5 lg:top-[218px] lg:flex lg:w-[390px] lg:max-h-none lg:flex-col">
      <div className="thin-scrollbar h-full overflow-y-auto p-4 lg:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-200">
                  {isElectoral ? "Selected GRC/SMC" : "Selected Subzone"}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-7 text-white">
                  {isElectoral
                    ? titleCase(properties.electoral_name)
                    : titleCase(properties.subzone_name)}
                </h2>
                <p className="mt-1 text-[13px] font-medium text-slate-400">
                  {isElectoral
                    ? titleCase(properties.electoral_type)
                    : `${titleCase(properties.planning_area)} · ${titleCase(properties.region)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CircleDot className="shrink-0 text-teal-200" size={20} />
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close inspector"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {isElectoral ? (
              <p className="mt-4 rounded-lg border border-amber-200/20 bg-amber-200/10 p-3 text-[12px] leading-5 text-amber-50/85">
                Estimated by area-weighted overlay of 2020 census subzones onto 2025 electoral boundaries.
              </p>
            ) : null}

            {!hasData ? (
              <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-4">
                <p className="text-sm font-semibold text-white">No data</p>
                <p className="mt-2 text-[13px] leading-6 text-slate-400">
                  This boundary does not have matched Census 2020 metrics. Run
                  the preprocessing script to review unmatched names or missing
                  electoral data.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-5 rounded-lg border border-white/10 bg-black/20 px-3">
                  <StatRow
                    label="Total population"
                    value={formatNumber(properties.total_population)}
                    emphasis
                  />
                  <StatRow
                    label="Area km²"
                    value={formatDecimal(properties.area_km2, 3)}
                  />
                  <StatRow
                    label="Density per km²"
                    value={formatNumber(properties.density_per_km2)}
                  />
                  <StatRow
                    label="Youth 0-14 share"
                    value={formatPercent(properties.youth_share)}
                  />
                  <StatRow
                    label="Working-age 15-64 share"
                    value={formatPercent(properties.working_age_share)}
                  />
                  <StatRow
                    label="Elderly 65+ share"
                    value={formatPercent(properties.elderly_share)}
                  />
                </div>

                {!isElectoral ? (
                  <>
                    <section className="mt-5">
                      <h3 className="text-[13px] font-bold text-white">
                        Age Breakdown
                      </h3>
                      <AgeChart data={properties.age_breakdown} />
                    </section>

                    <section className="mt-5">
                      <h3 className="text-[13px] font-bold text-white">
                        Male/Female Split
                      </h3>
                      <SexSplit properties={properties} />
                    </section>
                  </>
                ) : null}

                <section className="mt-5">
                  <h3 className="text-[13px] font-bold text-white">
                    Ethnic Group Profile
                  </h3>
                  <EthnicProfile properties={properties} />
                </section>

                <section className="mt-5">
                  <h3 className="text-[13px] font-bold text-white">
                    Urban Context
                  </h3>
                  <UrbanContext properties={properties} />
                </section>
              </>
            )}
      </div>
    </aside>
  );
}
