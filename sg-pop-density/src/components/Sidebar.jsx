import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis
} from "recharts";
import { CircleDot, MapPinned } from "lucide-react";
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
  if (!data?.length) {
    return (
      <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-[12px] text-slate-500">
        No age breakdown available.
      </div>
    );
  }

  return (
    <div className="mt-3 h-48 rounded-lg border border-white/10 bg-black/20 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -22, right: 4, top: 10, bottom: 0 }}>
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

export default function Sidebar({ feature }) {
  const properties = feature?.properties;
  const hasData = properties?.has_data;

  return (
    <aside className="civic-panel fixed inset-x-3 bottom-3 z-20 max-h-[48vh] overflow-hidden rounded-lg lg:bottom-5 lg:left-auto lg:right-5 lg:top-[146px] lg:flex lg:w-[390px] lg:max-h-none lg:flex-col">
      <div className="thin-scrollbar h-full overflow-y-auto p-4 lg:p-5">
        {!properties ? (
          <div className="flex min-h-40 flex-col justify-center lg:min-h-64">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-teal-200/20 bg-teal-300/10 text-teal-200">
              <MapPinned size={22} />
            </div>
            <p className="text-[15px] font-semibold text-white">
              Select a subzone to inspect population structure.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-200">
                  Selected Subzone
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-7 text-white">
                  {titleCase(properties.subzone_name)}
                </h2>
                <p className="mt-1 text-[13px] font-medium text-slate-400">
                  {titleCase(properties.planning_area)} · {titleCase(properties.region)}
                </p>
              </div>
              <CircleDot className="mt-1 shrink-0 text-teal-200" size={20} />
            </div>

            {!hasData ? (
              <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-4">
                <p className="text-sm font-semibold text-white">No data</p>
                <p className="mt-2 text-[13px] leading-6 text-slate-400">
                  This boundary did not match a Census 2020 subzone row. Run
                  the preprocessing script to review unmatched names.
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
                    label="Youth 0-14"
                    value={formatNumber(properties.youth_0_14)}
                  />
                  <StatRow
                    label="Working age 15-64"
                    value={formatNumber(properties.working_age_15_64)}
                  />
                  <StatRow
                    label="Elderly 65+"
                    value={formatNumber(properties.elderly_65_plus)}
                  />
                  <StatRow
                    label="Elderly share %"
                    value={formatPercent(properties.elderly_share)}
                  />
                </div>

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
            )}
          </>
        )}
      </div>
    </aside>
  );
}
