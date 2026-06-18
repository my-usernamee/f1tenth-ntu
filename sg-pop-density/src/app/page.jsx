"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, LocateFixed, Users } from "lucide-react";
import CompareDrawer from "@/components/CompareDrawer";
import CompareTray from "@/components/CompareTray";
import Legend from "@/components/Legend";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { buildColorStops, METRIC_BY_KEY, metricsForCategory } from "@/lib/colorScale";
import { formatCompact, formatNumber, formatPercent, titleCase } from "@/lib/formatters";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };

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

function parseAgeBreakdown(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return Boolean(value);
}

function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeMapFeature(feature) {
  if (!feature?.properties) return feature;

  const numericFields = [
    "area_km2",
    "total_population",
    "total_population_estimated",
    "density_per_km2",
    "density_per_km2_estimated",
    "youth_0_14",
    "youth_share",
    "youth_share_estimated",
    "working_age_15_64",
    "working_age_share",
    "working_age_share_estimated",
    "elderly_65_plus",
    "elderly_share",
    "elderly_share_estimated",
    "male_population",
    "female_population",
    "chinese_population",
    "malay_population",
    "indian_population",
    "others_population",
    "chinese_share",
    "chinese_share_estimated",
    "malay_share",
    "malay_share_estimated",
    "indian_share",
    "indian_share_estimated",
    "others_share",
    "others_share_estimated",
    "ethnic_diversity_index",
    "ethnic_diversity_index_estimated",
    "residential_land_share",
    "residential_land_share_estimated",
    "commercial_land_share",
    "industrial_land_share",
    "park_open_space_share",
    "park_open_space_share_estimated",
    "transport_utilities_land_share",
    "education_institution_land_share",
    "other_land_share",
    "hawker_centres_inside",
    "hawker_per_100k_residents",
    "mrt_stations_inside",
    "bus_stops_inside",
    "transport_score",
    "amenity_score",
    "access_gap_score",
    "access_gap_score_estimated"
  ];

  const properties = {
    ...feature.properties,
    has_data: parseBoolean(feature.properties.has_data),
    age_breakdown: parseAgeBreakdown(feature.properties.age_breakdown)
  };

  numericFields.forEach((field) => {
    properties[field] = parseNumberOrNull(properties[field]);
  });

  return {
    ...feature,
    properties
  };
}

function normalizeGeojson(data) {
  return {
    ...(data || EMPTY_GEOJSON),
    features: (data?.features || []).map(normalizeMapFeature)
  };
}

function featureName(feature, mode) {
  const props = feature?.properties || {};
  return mode === "electoral"
    ? titleCase(props.electoral_name)
    : titleCase(props.subzone_name);
}

function SummaryCard({ label, value, helper, icon: Icon }) {
  return (
    <article className="civic-panel min-w-[176px] rounded-lg p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {label}
        </p>
        <Icon size={15} className="text-teal-200" />
      </div>
      <p className="font-display text-[22px] font-bold leading-7 text-white">
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
              Loading Singapore population atlas...
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [subzoneGeojson, setSubzoneGeojson] = useState(null);
  const [electoralGeojson, setElectoralGeojson] = useState(EMPTY_GEOJSON);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState("subzone");
  const [metricCategory, setMetricCategory] = useState("population");
  const [metric, setMetric] = useState("density_per_km2");
  const [query, setQuery] = useState("");
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedBoundaryFeatures, setSelectedBoundaryFeatures] = useState([]);
  const [focusRequest, setFocusRequest] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [comparisonFeatures, setComparisonFeatures] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/sg-subzone-enriched.geojson")
        .then((response) => (response.ok ? response : fetch("/data/sg-subzone-population.geojson")))
        .then((response) => {
          if (!response.ok) {
            throw new Error("Run python scripts/process_population.py to generate public/data/sg-subzone-enriched.geojson.");
          }
          return response.json();
        }),
      fetch("/data/sg-electoral-2025-enriched.geojson")
        .then((response) => (response.ok ? response.json() : EMPTY_GEOJSON))
        .catch(() => EMPTY_GEOJSON)
    ])
      .then(([subzoneData, electoralData]) => {
        if (cancelled) return;
        setSubzoneGeojson(normalizeGeojson(subzoneData));
        setElectoralGeojson(normalizeGeojson(electoralData));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeGeojson = mode === "electoral" ? electoralGeojson : subzoneGeojson;
  const features = useMemo(() => activeGeojson?.features || [], [activeGeojson]);
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

    if (mode === "electoral") {
      return features
        .filter((feature) => normalizeSearch(feature.properties?.electoral_name).includes(normalized))
        .slice(0, 9)
        .map((feature) => ({
          type: "electoral",
          label: titleCase(feature.properties?.electoral_name),
          subtitle: `${titleCase(feature.properties?.electoral_type)} electoral division`,
          feature
        }));
    }

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
  }, [features, mode, query]);

  const clearComparison = useCallback(() => {
    setComparisonFeatures([]);
    setSelectedIds([]);
    setCompareOpen(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFeature(null);
    setSelectedIds([]);
    setSelectedBoundaryFeatures([]);
  }, []);

  const handleModeChange = useCallback((nextMode) => {
    setMode(nextMode);
    setQuery("");
    clearSelection();
    clearComparison();
    setCompareMode(false);
  }, [clearComparison, clearSelection]);

  const handleMetricCategoryChange = useCallback((category) => {
    const firstMetric = metricsForCategory(category)[0]?.key || "density_per_km2";
    setMetricCategory(category);
    setMetric(firstMetric);
  }, []);

  const selectFeature = useCallback((feature) => {
    const normalizedFeature = normalizeMapFeature(feature);
    const atlasId = String(normalizedFeature?.properties?.atlas_id || "");

    if (compareMode && normalizedFeature) {
      setComparisonFeatures((current) => {
        const withoutDuplicate = current.filter(
          (item) => String(item.properties.atlas_id) !== atlasId
        );
        const next = [...withoutDuplicate, normalizedFeature].slice(-2);
        setSelectedIds(next.map((item) => String(item.properties.atlas_id)));
        if (next.length === 2) setCompareOpen(true);
        return next;
      });
      return;
    }

    setSelectedFeature(normalizedFeature);
    setSelectedIds(atlasId ? [atlasId] : []);
    setSelectedBoundaryFeatures(normalizedFeature ? [normalizedFeature] : []);
  }, [compareMode]);

  const handleSearchSelect = useCallback(
    (result) => {
      if (result.type === "subzone" || result.type === "electoral") {
        selectFeature(result.feature);
        setFocusRequest({ id: `${result.label}-${Date.now()}`, features: [result.feature] });
        setQuery(result.label);
      } else {
        clearSelection();
        setSelectedBoundaryFeatures(result.features || []);
        setFocusRequest({ id: `${result.label}-${Date.now()}`, features: result.features || [] });
        setQuery(result.label);
      }
    },
    [clearSelection, selectFeature]
  );

  const toggleCompareMode = useCallback(() => {
    setCompareMode((current) => {
      const next = !current;
      clearSelection();
      clearComparison();
      return next;
    });
  }, [clearComparison, clearSelection]);

  if (!subzoneGeojson) {
    return <LoadingState error={loadError} />;
  }

  const summaryPrefix = mode === "electoral" ? "Estimated " : "";
  const areaLabel = mode === "electoral" ? "electoral division" : "subzone";
  const noElectoralData = mode === "electoral" && features.length === 0;
  const metricConfig = METRIC_BY_KEY[metric];

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#070b0f]">
      <MapView
        geojson={activeGeojson || EMPTY_GEOJSON}
        subzoneUnderlay={subzoneGeojson}
        mode={mode}
        metric={metric}
        colorStops={colorStops}
        selectedIds={selectedIds}
        selectedBoundaryFeatures={selectedBoundaryFeatures}
        hasInspector={Boolean(selectedFeature)}
        onSelectFeature={selectFeature}
        focusRequest={focusRequest}
      />

      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        metricCategory={metricCategory}
        onMetricCategoryChange={handleMetricCategoryChange}
        metric={metric}
        onMetricChange={setMetric}
        query={query}
        onQueryChange={setQuery}
        results={searchResults}
        onSelectResult={handleSearchSelect}
      />

      <div className="pointer-events-none fixed left-4 top-[202px] z-10 max-w-[calc(100vw-2rem)] lg:left-5 lg:top-[196px] lg:max-w-[760px]">
        <div className="thin-scrollbar pointer-events-auto flex gap-2 overflow-x-auto pb-1">
          <SummaryCard
            label={`${summaryPrefix}total residents`}
            value={formatCompact(summary.totalPopulation)}
            helper={`${formatNumber(summary.totalPopulation)} residents`}
            icon={Users}
          />
          <SummaryCard
            label={`Densest ${areaLabel}`}
            value={formatCompact(summary.densest?.properties?.density_per_km2)}
            helper={`${featureName(summary.densest, mode)} / km²`}
            icon={LocateFixed}
          />
          <SummaryCard
            label={`Largest ${areaLabel}`}
            value={formatCompact(summary.largest?.properties?.total_population)}
            helper={featureName(summary.largest, mode)}
            icon={Users}
          />
          <SummaryCard
            label="Highest elderly share"
            value={formatPercent(summary.elderly?.properties?.elderly_share)}
            helper={featureName(summary.elderly, mode)}
            icon={LocateFixed}
          />
        </div>
      </div>

      {noElectoralData ? (
        <div className="civic-panel pointer-events-none fixed left-4 top-[344px] z-10 max-w-sm rounded-lg p-4 text-[13px] leading-6 text-slate-300 lg:left-5">
          Add <span className="font-semibold text-white">data/raw/electoral-boundary-2025.geojson</span> and rerun preprocessing to populate GRC/SMC mode.
        </div>
      ) : null}

      <div className="pointer-events-none fixed left-4 top-[356px] z-10 w-56 lg:bottom-20 lg:left-5 lg:top-auto">
        <Legend metric={metricConfig?.key || metric} stops={colorStops} />
      </div>

      <Sidebar feature={selectedFeature} mode={mode} onClose={clearSelection} />
      <CompareTray
        mode={mode}
        compareMode={compareMode}
        features={comparisonFeatures}
        onToggle={toggleCompareMode}
        onOpen={() => setCompareOpen(true)}
        onClear={clearComparison}
      />
      <CompareDrawer
        open={compareOpen}
        mode={mode}
        features={comparisonFeatures}
        onClear={clearComparison}
        onClose={() => setCompareOpen(false)}
      />
    </main>
  );
}
