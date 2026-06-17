import { Activity, Baby, Building2, UsersRound, UserRoundCog } from "lucide-react";
import { METRICS } from "@/lib/colorScale";

const ICONS = {
  density_per_km2: Activity,
  total_population: UsersRound,
  elderly_65_plus: UserRoundCog,
  youth_0_14: Baby,
  working_age_15_64: Building2
};

export default function MetricToggle({ metric, onMetricChange }) {
  return (
    <div className="thin-scrollbar flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/25 p-1 lg:flex-wrap lg:overflow-visible">
      {METRICS.map((item) => {
        const Icon = ICONS[item.key];
        const active = item.key === metric;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onMetricChange(item.key)}
            className={[
              "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-[12px] font-semibold transition",
              active
                ? "bg-teal-300 text-slate-950 shadow-glow"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            ].join(" ")}
            aria-pressed={active}
          >
            <Icon size={15} strokeWidth={2.1} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
