"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { buildFillExpression } from "@/lib/colorScale";
import { formatNumber, titleCase } from "@/lib/formatters";

const SOURCE_ID = "subzones";
const UNDERLAY_SOURCE_ID = "subzone-underlay";
const UNDERLAY_LINE_LAYER_ID = "subzone-underlay-line";
const FILL_LAYER_ID = "subzone-fill";
const LINE_LAYER_ID = "subzone-line";
const HOVER_LAYER_ID = "subzone-hover-line";
const SELECTED_LAYER_ID = "subzone-selected-line";
const SELECTED_BOUNDARY_SOURCE_ID = "selected-boundary";
const SELECTED_BOUNDARY_LAYER_ID = "selected-boundary-line";
const PLANNING_LABEL_SOURCE_ID = "planning-labels";
const SUBZONE_LABEL_SOURCE_ID = "subzone-labels";
const ELECTORAL_LABEL_SOURCE_ID = "electoral-labels";
const LANDMARK_SOURCE_ID = "landmark-labels";

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const LANDMARKS = [
  ["Changi Airport", 103.9915, 1.3644],
  ["Marina Bay", 103.861, 1.2834],
  ["Orchard", 103.8318, 1.3048],
  ["Jurong East", 103.7434, 1.3331],
  ["Woodlands", 103.786, 1.436],
  ["Tampines", 103.9451, 1.3526],
  ["Punggol", 103.9023, 1.4052],
  ["Sentosa", 103.8303, 1.2494],
  ["NTU", 103.682, 1.3483],
  ["NUS", 103.7764, 1.2966],
  ["CBD", 103.8517, 1.2847]
];

const BASE_STYLE = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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

function centerOfFeatures(features) {
  const bounds = getFeatureBounds(features);
  if (!bounds) return null;
  const center = bounds.getCenter();
  return [center.lng, center.lat];
}

function buildSubzoneLabelGeoJson(features = []) {
  return {
    type: "FeatureCollection",
    features: features
      .map((feature) => {
        const center = centerOfFeatures([feature]);
        if (!center) return null;
        return {
          type: "Feature",
          properties: {
            label: titleCase(feature.properties?.subzone_name || feature.properties?.subzone)
          },
          geometry: { type: "Point", coordinates: center }
        };
      })
      .filter(Boolean)
  };
}

function buildPlanningLabelGeoJson(features = []) {
  const groups = new Map();
  features.forEach((feature) => {
    const name = feature.properties?.planning_area;
    if (!name) return;
    const key = String(name);
    groups.set(key, [...(groups.get(key) || []), feature]);
  });

  return {
    type: "FeatureCollection",
    features: [...groups.entries()]
      .map(([name, groupFeatures]) => {
        const center = centerOfFeatures(groupFeatures);
        if (!center) return null;
        return {
          type: "Feature",
          properties: { label: titleCase(name) },
          geometry: { type: "Point", coordinates: center }
        };
      })
      .filter(Boolean)
  };
}

function buildElectoralLabelGeoJson(features = []) {
  return {
    type: "FeatureCollection",
    features: features
      .map((feature) => {
        const center = centerOfFeatures([feature]);
        if (!center) return null;
        return {
          type: "Feature",
          properties: {
            label: titleCase(feature.properties?.electoral_name)
          },
          geometry: { type: "Point", coordinates: center }
        };
      })
      .filter(Boolean)
  };
}

function buildLandmarkGeoJson() {
  return {
    type: "FeatureCollection",
    features: LANDMARKS.map(([label, lng, lat]) => ({
      type: "Feature",
      properties: { label },
      geometry: { type: "Point", coordinates: [lng, lat] }
    }))
  };
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

function getResponsivePadding(hasInspector = false) {
  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return { top: 300, right: 24, bottom: hasInspector ? 220 : 130, left: 24 };
  }
  return { top: 218, right: hasInspector ? 430 : 44, bottom: 70, left: 44 };
}

export default function MapView({
  geojson,
  subzoneUnderlay,
  mode = "subzone",
  metric,
  colorStops,
  selectedIds,
  selectedBoundaryFeatures = [],
  hasInspector = false,
  onSelectFeature,
  focusRequest
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef(geojson);
  const underlayRef = useRef(subzoneUnderlay || EMPTY_FEATURE_COLLECTION);
  const modeRef = useRef(mode);
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
    underlayRef.current = subzoneUnderlay || EMPTY_FEATURE_COLLECTION;
  }, [subzoneUnderlay]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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
        data: dataRef.current || EMPTY_FEATURE_COLLECTION,
        promoteId: "atlas_id"
      });
      map.addSource(UNDERLAY_SOURCE_ID, {
        type: "geojson",
        data: modeRef.current === "electoral" ? underlayRef.current : EMPTY_FEATURE_COLLECTION
      });

      map.addSource(SELECTED_BOUNDARY_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });
      map.addSource(PLANNING_LABEL_SOURCE_ID, {
        type: "geojson",
        data: buildPlanningLabelGeoJson(dataRef.current.features || [])
      });
      map.addSource(SUBZONE_LABEL_SOURCE_ID, {
        type: "geojson",
        data: modeRef.current === "subzone"
          ? buildSubzoneLabelGeoJson(dataRef.current?.features || [])
          : EMPTY_FEATURE_COLLECTION
      });
      map.addSource(ELECTORAL_LABEL_SOURCE_ID, {
        type: "geojson",
        data: modeRef.current === "electoral"
          ? buildElectoralLabelGeoJson(dataRef.current?.features || [])
          : EMPTY_FEATURE_COLLECTION
      });
      map.addSource(LANDMARK_SOURCE_ID, {
        type: "geojson",
        data: buildLandmarkGeoJson()
      });

      map.addLayer({
        id: UNDERLAY_LINE_LAYER_ID,
        type: "line",
        source: UNDERLAY_SOURCE_ID,
        paint: {
          "line-color": "rgba(226, 232, 240, 0.18)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.45, 12, 0.9]
        }
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
          "line-color": modeRef.current === "electoral" ? "rgba(250, 204, 21, 0.82)" : "rgba(226, 232, 240, 0.42)",
          "line-width": modeRef.current === "electoral"
            ? ["interpolate", ["linear"], ["zoom"], 9, 2.6, 12, 4.2]
            : ["interpolate", ["linear"], ["zoom"], 9, 1.35, 12, 2.0]
        }
      });

      map.addLayer({
        id: HOVER_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "atlas_id"], ""],
        paint: {
          "line-color": "#d9fff8",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.8, 12, 5.2]
        }
      });

      map.addLayer({
        id: SELECTED_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "atlas_id"], ""],
        paint: {
          "line-color": "#fbbf24",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4.8, 12, 6.4]
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

      map.addLayer({
        id: "planning-area-labels",
        type: "symbol",
        source: PLANNING_LABEL_SOURCE_ID,
        minzoom: 10.2,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 12, 13],
          "text-letter-spacing": 0.05,
          "text-transform": "uppercase",
          "text-allow-overlap": false
        },
        paint: {
          "text-color": "rgba(224, 242, 254, 0.72)",
          "text-halo-color": "rgba(7, 11, 15, 0.9)",
          "text-halo-width": 1.2
        }
      });

      map.addLayer({
        id: "electoral-labels",
        type: "symbol",
        source: ELECTORAL_LABEL_SOURCE_ID,
        minzoom: 10.1,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 12, 16],
          "text-letter-spacing": 0.02,
          "text-transform": "uppercase",
          "text-allow-overlap": false
        },
        paint: {
          "text-color": "rgba(253, 224, 71, 0.86)",
          "text-halo-color": "rgba(7, 11, 15, 0.94)",
          "text-halo-width": 1.6
        }
      });

      map.addLayer({
        id: "subzone-labels",
        type: "symbol",
        source: SUBZONE_LABEL_SOURCE_ID,
        minzoom: 12.15,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 10,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": "rgba(226, 232, 240, 0.62)",
          "text-halo-color": "rgba(7, 11, 15, 0.86)",
          "text-halo-width": 1
        }
      });

      map.addLayer({
        id: "landmark-labels",
        type: "symbol",
        source: LANDMARK_SOURCE_ID,
        minzoom: 11.35,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 12,
          "text-offset": [0, 0.8],
          "text-allow-overlap": false
        },
        paint: {
          "text-color": "#fef3c7",
          "text-halo-color": "rgba(7, 11, 15, 0.9)",
          "text-halo-width": 1.3
        }
      });

      const bounds = getFeatureBounds(dataRef.current.features || []);
      if (bounds) {
        safeFitBounds(map, bounds, {
          padding: getResponsivePadding(false),
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
      map.getSource(PLANNING_LABEL_SOURCE_ID)?.setData(buildPlanningLabelGeoJson(geojson.features || []));
      map.getSource(SUBZONE_LABEL_SOURCE_ID)?.setData(buildSubzoneLabelGeoJson(geojson.features || []));
      const bounds = getFeatureBounds(geojson.features || []);
      if (bounds) {
        safeFitBounds(map, bounds, {
          padding: getResponsivePadding(hasInspector),
          duration: 700,
          maxZoom: 11.2
        });
      }
    }
  }, [geojson, hasInspector]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.getSource(UNDERLAY_SOURCE_ID)?.setData(
      mode === "electoral" ? (subzoneUnderlay || EMPTY_FEATURE_COLLECTION) : EMPTY_FEATURE_COLLECTION
    );
    map.getSource(PLANNING_LABEL_SOURCE_ID)?.setData(
      mode === "subzone" ? buildPlanningLabelGeoJson(geojson.features || []) : EMPTY_FEATURE_COLLECTION
    );
    map.getSource(SUBZONE_LABEL_SOURCE_ID)?.setData(
      mode === "subzone" ? buildSubzoneLabelGeoJson(geojson.features || []) : EMPTY_FEATURE_COLLECTION
    );
    map.getSource(ELECTORAL_LABEL_SOURCE_ID)?.setData(
      mode === "electoral" ? buildElectoralLabelGeoJson(geojson.features || []) : EMPTY_FEATURE_COLLECTION
    );
    if (map.getLayer(LINE_LAYER_ID)) {
      map.setPaintProperty(
        LINE_LAYER_ID,
        "line-color",
        mode === "electoral" ? "rgba(250, 204, 21, 0.86)" : "rgba(226, 232, 240, 0.42)"
      );
      map.setPaintProperty(
        LINE_LAYER_ID,
        "line-width",
        mode === "electoral"
          ? ["interpolate", ["linear"], ["zoom"], 9, 2.6, 12, 4.2]
          : ["interpolate", ["linear"], ["zoom"], 9, 1.35, 12, 2.0]
      );
    }
  }, [geojson, mode, subzoneUnderlay]);

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
      padding: getResponsivePadding(hasInspector),
      duration: 1100,
      maxZoom: focusRequest.features.length === 1 ? 13.2 : 12.2
    });
  }, [focusRequest, hasInspector]);

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
                {mode === "electoral" ? "GRC/SMC" : "Subzone"}
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {mode === "electoral"
                  ? titleCase(tooltipProperties.electoral_name)
                  : titleCase(tooltipProperties.subzone_name)}
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
              <dt className="text-slate-500">{mode === "electoral" ? "Type" : "Planning Area"}</dt>
              <dd className="text-right font-semibold text-slate-200">
                {mode === "electoral"
                  ? titleCase(tooltipProperties.electoral_type)
                  : titleCase(tooltipProperties.planning_area)}
              </dd>
            </div>
            {mode === "subzone" ? (
              <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Region</dt>
              <dd className="text-right font-semibold text-slate-200">
                {titleCase(tooltipProperties.region)}
              </dd>
              </div>
            ) : null}
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
