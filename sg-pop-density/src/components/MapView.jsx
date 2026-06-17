"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { buildFillExpression } from "@/lib/colorScale";
import { formatNumber, titleCase } from "@/lib/formatters";

const SOURCE_ID = "subzones";
const FILL_LAYER_ID = "subzone-fill";
const LINE_LAYER_ID = "subzone-line";
const HOVER_LAYER_ID = "subzone-hover-line";
const SELECTED_LAYER_ID = "subzone-selected-line";
const SELECTED_BOUNDARY_SOURCE_ID = "selected-boundary";
const SELECTED_BOUNDARY_LAYER_ID = "selected-boundary-line";

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const BASE_STYLE = {
  version: 8,
  sources: {
    cartoDark: {
      type: "raster",
      tiles: [
        "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO"
    }
  },
  layers: [
    {
      id: "carto-dark",
      type: "raster",
      source: "cartoDark",
      paint: {
        "raster-opacity": 0.72,
        "raster-saturation": -0.18,
        "raster-contrast": 0.05
      }
    }
  ]
};

function walkCoordinates(coordinates, callback) {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    callback(coordinates);
    return;
  }
  coordinates.forEach((child) => walkCoordinates(child, callback));
}

export function getFeatureBounds(features) {
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((feature) => {
    walkCoordinates(feature.geometry?.coordinates, ([lng, lat]) => {
      bounds.extend([lng, lat]);
    });
  });
  return bounds.isEmpty() ? null : bounds;
}

function tooltipStyle(point) {
  if (!point) return { display: "none" };
  return {
    transform: `translate(${point.x + 16}px, ${point.y + 16}px)`
  };
}

function makeSelectedFilter(ids) {
  if (!ids?.length) return ["==", ["get", "atlas_id"], ""];
  return ["in", ["get", "atlas_id"], ["literal", ids.map(String)]];
}

function coordinateKey(coordinate) {
  return `${Number(coordinate[0]).toFixed(6)},${Number(coordinate[1]).toFixed(6)}`;
}

function segmentKey(start, end) {
  const startKey = coordinateKey(start);
  const endKey = coordinateKey(end);
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function getGeometryRings(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function buildBoundaryGeoJson(features = []) {
  const segments = new Map();

  features.forEach((feature) => {
    getGeometryRings(feature.geometry).forEach((ring) => {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index];
        const end = ring[index + 1];
        const key = segmentKey(start, end);
        const current = segments.get(key);
        if (current) {
          current.count += 1;
        } else {
          segments.set(key, { count: 1, line: [start, end] });
        }
      }
    });
  });

  const coordinates = [...segments.values()]
    .filter((segment) => segment.count === 1)
    .map((segment) => segment.line);

  if (!coordinates.length) return EMPTY_FEATURE_COLLECTION;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiLineString",
          coordinates
        }
      }
    ]
  };
}

function safeFitBounds(map, bounds, options) {
  if (!bounds || bounds.isEmpty?.()) return;
  try {
    map.fitBounds(bounds, options);
  } catch {
    // Ignore malformed/empty bounds from partial search states instead of crashing.
  }
}

function getResponsivePadding() {
  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return { top: 380, right: 24, bottom: 220, left: 24 };
  }
  return { top: 162, right: 430, bottom: 44, left: 44 };
}

export default function MapView({
  geojson,
  metric,
  colorStops,
  selectedIds,
  selectedBoundaryFeatures = [],
  onSelectFeature,
  focusRequest
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef(geojson);
  const fillExpressionRef = useRef(null);
  const selectFeatureRef = useRef(onSelectFeature);
  const [hovered, setHovered] = useState(null);
  const [tooltipPoint, setTooltipPoint] = useState(null);
  const [mapError, setMapError] = useState("");
  const fillExpression = useMemo(
    () => buildFillExpression(metric, colorStops),
    [metric, colorStops]
  );

  useEffect(() => {
    dataRef.current = geojson;
  }, [geojson]);

  useEffect(() => {
    fillExpressionRef.current = fillExpression;
  }, [fillExpression]);

  useEffect(() => {
    selectFeatureRef.current = onSelectFeature;
  }, [onSelectFeature]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASE_STYLE,
        center: [103.8198, 1.3521],
        zoom: 10.45,
        minZoom: 9.6,
        maxZoom: 15.5,
        pitch: 0,
        attributionControl: false,
        failIfMajorPerformanceCaveat: false
      });
    } catch {
      setMapError("Map renderer unavailable");
      return undefined;
    }

    map.on("error", (event) => {
      const message = event?.error?.message || "";
      if (/webgl|context/i.test(message)) {
        setMapError("Map renderer unavailable");
      }
    });

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: dataRef.current,
        promoteId: "atlas_id"
      });

      map.addSource(SELECTED_BOUNDARY_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });

      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": fillExpressionRef.current,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.94,
            0.78
          ]
        }
      });

      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "rgba(226, 232, 240, 0.18)",
          "line-width": 0.8
        }
      });

      map.addLayer({
        id: HOVER_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "atlas_id"], ""],
        paint: {
          "line-color": "#d9fff8",
          "line-width": 2.2
        }
      });

      map.addLayer({
        id: SELECTED_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "atlas_id"], ""],
        paint: {
          "line-color": "#fbbf24",
          "line-width": 3.1
        }
      });

      map.addLayer({
        id: SELECTED_BOUNDARY_LAYER_ID,
        type: "line",
        source: SELECTED_BOUNDARY_SOURCE_ID,
        paint: {
          "line-color": "#ffe08a",
          "line-opacity": 0.98,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.2, 12, 5.2],
          "line-blur": 0.25
        }
      });

      const bounds = getFeatureBounds(dataRef.current.features || []);
      if (bounds) {
        safeFitBounds(map, bounds, {
          padding: getResponsivePadding(),
          duration: 900,
          maxZoom: 11.2
        });
      }
    });

    map.on("mousemove", FILL_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      map.getCanvas().style.cursor = "pointer";
      setHovered(feature);
      setTooltipPoint(event.point);
      try {
        map.setFilter(HOVER_LAYER_ID, ["==", ["get", "atlas_id"], String(feature.properties.atlas_id)]);
      } catch {}
    });

    map.on("mouseleave", FILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
      setTooltipPoint(null);
      try {
        map.setFilter(HOVER_LAYER_ID, ["==", ["get", "atlas_id"], ""]);
      } catch {}
    });

    map.on("click", FILL_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      if (feature) {
        selectFeatureRef.current?.(feature);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID);
    if (source) {
      source.setData(geojson);
      const bounds = getFeatureBounds(geojson.features || []);
      if (bounds) {
        safeFitBounds(map, bounds, {
          padding: getResponsivePadding(),
          duration: 700,
          maxZoom: 11.2
        });
      }
    }
  }, [geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer(FILL_LAYER_ID)) return;
    map.setPaintProperty(FILL_LAYER_ID, "fill-color", fillExpression);
  }, [fillExpression]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer(SELECTED_LAYER_ID)) return;
    try {
      map.setFilter(SELECTED_LAYER_ID, makeSelectedFilter(selectedIds));
    } catch {}
  }, [selectedIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource(SELECTED_BOUNDARY_SOURCE_ID);
    if (!source) return;
    source.setData(buildBoundaryGeoJson(selectedBoundaryFeatures));
  }, [selectedBoundaryFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest?.features?.length) return;
    const bounds = getFeatureBounds(focusRequest.features);
    if (!bounds) return;
    safeFitBounds(map, bounds, {
      padding: getResponsivePadding(),
      duration: 1100,
      maxZoom: focusRequest.features.length === 1 ? 13.2 : 12.2
    });
  }, [focusRequest]);

  const tooltipProperties = hovered?.properties;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(20,184,166,0.06),transparent_30%),linear-gradient(90deg,rgba(7,11,15,0.38),transparent_22%,transparent_68%,rgba(7,11,15,0.42))]" />

      {mapError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070b0f] p-6">
          <div className="max-w-sm rounded-lg border border-amber-200/20 bg-slate-950/85 p-5 text-center shadow-civic">
            <p className="text-sm font-bold text-white">{mapError}</p>
            <p className="mt-2 text-[13px] leading-6 text-slate-400">
              WebGL is required for the interactive choropleth map. The
              population data, search, and inspector remain available when the
              browser supports hardware-accelerated rendering.
            </p>
          </div>
        </div>
      ) : null}

      {tooltipProperties ? (
        <div
          className="pointer-events-none absolute left-0 top-0 z-30 w-64 rounded-lg border border-white/15 bg-slate-950/92 p-3 shadow-civic backdrop-blur-xl"
          style={tooltipStyle(tooltipPoint)}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-200">
                Subzone
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {titleCase(tooltipProperties.subzone_name)}
              </p>
            </div>
            {!tooltipProperties.has_data ? (
              <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300">
                No data
              </span>
            ) : null}
          </div>
          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Planning Area</dt>
              <dd className="text-right font-semibold text-slate-200">
                {titleCase(tooltipProperties.planning_area)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Region</dt>
              <dd className="text-right font-semibold text-slate-200">
                {titleCase(tooltipProperties.region)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Population</dt>
              <dd className="text-right font-semibold text-white">
                {formatNumber(tooltipProperties.total_population)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Density / km²</dt>
              <dd className="text-right font-semibold text-white">
                {formatNumber(tooltipProperties.density_per_km2)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
