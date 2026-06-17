"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, LocateFixed, Users } from "lucide-react";
import Legend from "@/components/Legend";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { buildColorStops, METRIC_BY_KEY } from "@/lib/colorScale";
import { formatCompact, formatNumber, formatPercent, titleCase } from "@/lib/formatters";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

function normalizeSearch(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function metricValue(feature, key) {
  const value = feature?.properties?.[key];
  return value === null || value === undefined ? null : Number(value);
}

function maxFeature(features, metricKey) {
  return features.reduce((best, feature) => {
    const value = metricValue(feature, metricKey);
    if (value === null || Number.isNaN(value)) return best;
    if (!best || value > metricValue(best, metricKey)) return feature;
    return best;
  }, null);
}

function SummaryCard({ label, value, helper, icon: Icon }) {
  return (
    <article className="civic-panel min-w-[190px] rounded-lg p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>
        <Icon size={16} className="text-teal-200" />
      </div>
      <p className="font-display text-[24px] font-bold leading-7 text-white">
        {value}
      </p>
      <p className="mt-1 truncate text-[12px] font-medium text-slate-400">{helper}</p>
    </article>
  );
}

function LoadingState({ error }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#070b0f] p-5">
      <div className="civic-panel max-w-md rounded-lg p-6 text-center">
        {error ? (
          <>
            <AlertTriangle className="mx-auto text-amber-300" size={30} />
            <h1 className="mt-4 font-display text-2xl font-bold text-white">
              Data could not be loaded
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">{error}</p>
          </>
        ) : (
          <>
            <div className="mx-auto h-10 w-10 animate-pulse rounded-lg bg-teal-300/20" />
            <p className="mt-4 text-sm font-semibold text-slate-300">
              Loading Singapore subzone atlas...
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [geojson, setGeojson] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [metric, setMetric] = useState("density_per_km2");
  const [query, setQuery] = useState("");
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedBoundaryFeatures, setSelectedBoundaryFeatures] = useState([]);
  const [focusRequest, setFocusRequest] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/sg-subzone-population.geojson")
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Run python scripts/process_population.py to generate public/data/sg-subzone-population.geojson."
          );
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setGeojson(data);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const features = useMemo(() => geojson?.features || [], [geojson]);
  const colorStops = useMemo(() => buildColorStops(features, metric), [features, metric]);

  const summary = useMemo(() => {
    const valid = features.filter((feature) => feature.properties?.has_data);
    const totalPopulation = valid.reduce(
      (sum, feature) => sum + Number(feature.properties.total_population || 0),
      0
    );
    return {
      totalPopulation,
      densest: maxFeature(valid, "density_per_km2"),
      largest: maxFeature(valid, "total_population"),
      elderly: maxFeature(valid, "elderly_share")
    };
  }, [features]);

  const searchResults = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (normalized.length < 2) return [];

    const planningAreas = new Map();
    const subzones = [];

    features.forEach((feature) => {
      const props = feature.properties || {};
      const subzoneName = titleCase(props.subzone_name);
      const planningArea = titleCase(props.planning_area);
      const region = titleCase(props.region);
      const planningKey = normalizeSearch(props.planning_area);

      if (!planningAreas.has(planningKey)) {
        planningAreas.set(planningKey, {
          type: "planning_area",
          label: planningArea,
          subtitle: `${region} planning area`,
          features: []
        });
      }
      planningAreas.get(planningKey).features.push(feature);

      if (
        normalizeSearch(props.subzone_name).includes(normalized) ||
        normalizeSearch(props.planning_area).includes(normalized)
      ) {
        subzones.push({
          type: "subzone",
          label: subzoneName,
          subtitle: `${planningArea} subzone`,
          feature
        });
      }
    });

    const matchingPlanningAreas = [...planningAreas.values()].filter((item) =>
      normalizeSearch(item.label).includes(normalized)
    );

    return [...matchingPlanningAreas, ...subzones].slice(0, 9);
  }, [features, query]);

  const selectFeature = useCallback((feature) => {
    const atlasId = String(feature?.properties?.atlas_id || "");
    setSelectedFeature(feature);
    setSelectedIds(atlasId ? [atlasId] : []);
    setSelectedBoundaryFeatures(feature ? [feature] : []);
  }, []);

  const handleSearchSelect = useCallback(
    (result) => {
      if (result.type === "subzone") {
        selectFeature(result.feature);
        setFocusRequest({ id: `${result.label}-${Date.now()}`, features: [result.feature] });
        setQuery(result.label);
      } else {
        setSelectedFeature(null);
        setSelectedIds([]);
        setSelectedBoundaryFeatures(result.features || []);
        setFocusRequest({ id: `${result.label}-${Date.now()}`, features: result.features || [] });
        setQuery(result.label);
      }
    },
    [selectFeature]
  );

  if (!geojson) {
    return <LoadingState error={loadError} />;
  }

  const metricConfig = METRIC_BY_KEY[metric];

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#070b0f]">
      <MapView
        geojson={geojson}
        metric={metric}
        colorStops={colorStops}
        selectedIds={selectedIds}
        selectedBoundaryFeatures={selectedBoundaryFeatures}
        onSelectFeature={selectFeature}
        focusRequest={focusRequest}
      />

      <TopBar
        metric={metric}
        onMetricChange={setMetric}
        query={query}
        onQueryChange={setQuery}
        results={searchResults}
        onSelectResult={handleSearchSelect}
      />

      <div className="pointer-events-none fixed left-4 top-[206px] z-10 max-w-[calc(100vw-2rem)] lg:left-5 lg:top-[146px] lg:max-w-[840px]">
        <div className="thin-scrollbar pointer-events-auto flex gap-2 overflow-x-auto pb-1 lg:overflow-visible">
          <SummaryCard
            label="Total resident population"
            value={formatCompact(summary.totalPopulation)}
            helper={`${formatNumber(summary.totalPopulation)} residents`}
            icon={Users}
          />
          <SummaryCard
            label="Densest subzone"
            value={formatCompact(summary.densest?.properties?.density_per_km2)}
            helper={`${titleCase(summary.densest?.properties?.subzone_name)} / km²`}
            icon={LocateFixed}
          />
          <SummaryCard
            label="Largest population subzone"
            value={formatCompact(summary.largest?.properties?.total_population)}
            helper={titleCase(summary.largest?.properties?.subzone_name)}
            icon={Users}
          />
          <SummaryCard
            label="Highest elderly concentration"
            value={formatPercent(summary.elderly?.properties?.elderly_share)}
            helper={titleCase(summary.elderly?.properties?.subzone_name)}
            icon={LocateFixed}
          />
        </div>
      </div>

      <div className="pointer-events-none fixed left-4 top-[346px] z-10 w-56 lg:bottom-12 lg:left-5 lg:top-auto">
        <Legend metric={metric} stops={colorStops} />
      </div>

      <Sidebar feature={selectedFeature} />
    </main>
  );
}
