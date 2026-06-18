export const NO_DATA_COLOR = "#434a51";

export const MODES = [
  { key: "subzone", label: "Subzone" },
  { key: "electoral", label: "GRC/SMC" }
];

export const METRIC_CATEGORIES = [
  {
    key: "population",
    label: "Population",
    metrics: [
      {
        key: "density_per_km2",
        label: "Population density",
        shortLabel: "Population density / km²",
        unit: "/ km²"
      },
      {
        key: "total_population",
        label: "Total population",
        shortLabel: "Total population",
        unit: "people"
      }
    ]
  },
  {
    key: "age",
    label: "Age structure",
    metrics: [
      {
        key: "youth_share",
        label: "Youth 0-14 share",
        shortLabel: "Youth 0-14 share %",
        unit: "%"
      },
      {
        key: "working_age_share",
        label: "Working-age 15-64 share",
        shortLabel: "Working-age 15-64 share %",
        unit: "%"
      },
      {
        key: "elderly_share",
        label: "Elderly 65+ share",
        shortLabel: "Elderly 65+ share %",
        unit: "%"
      }
    ]
  },
  {
    key: "ethnic",
    label: "Ethnic group",
    metrics: [
      {
        key: "chinese_share",
        label: "Chinese share",
        shortLabel: "Chinese share %",
        unit: "%"
      },
      {
        key: "malay_share",
        label: "Malay share",
        shortLabel: "Malay share %",
        unit: "%"
      },
      {
        key: "indian_share",
        label: "Indian share",
        shortLabel: "Indian share %",
        unit: "%"
      },
      {
        key: "others_share",
        label: "Others share",
        shortLabel: "Others share %",
        unit: "%"
      },
      {
        key: "ethnic_diversity_index",
        label: "Ethnic diversity",
        shortLabel: "Ethnic diversity index",
        unit: "index"
      }
    ]
  },
  {
    key: "land_use",
    label: "Land use",
    metrics: [
      {
        key: "residential_land_share",
        label: "Residential land share",
        shortLabel: "Residential land share %",
        unit: "%"
      },
      {
        key: "park_open_space_share",
        label: "Park/open-space share",
        shortLabel: "Park/open-space share %",
        unit: "%"
      },
      {
        key: "commercial_land_share",
        label: "Commercial land share",
        shortLabel: "Commercial land share %",
        unit: "%"
      },
      {
        key: "industrial_land_share",
        label: "Industrial land share",
        shortLabel: "Industrial land share %",
        unit: "%"
      }
    ]
  },
  {
    key: "amenities",
    label: "Amenities",
    metrics: [
      {
        key: "hawker_centres_inside",
        label: "Hawker centres inside",
        shortLabel: "Hawker centres inside",
        unit: "centres"
      },
      {
        key: "hawker_per_100k_residents",
        label: "Hawker per 100k residents",
        shortLabel: "Hawker per 100k residents",
        unit: "/100k"
      },
      {
        key: "mrt_lrt_stations_within_800m_boundary",
        label: "MRT/LRT within 800m of boundary",
        shortLabel: "MRT/LRT within 800m",
        unit: "stations"
      },
      {
        key: "bus_stops_within_500m_boundary",
        label: "Bus stops within 500m of boundary",
        shortLabel: "Bus stops within 500m",
        unit: "stops"
      },
      {
        key: "amenity_score",
        label: "Amenity score",
        shortLabel: "Amenity score",
        unit: "/100"
      },
      {
        key: "access_gap_score",
        label: "Access gap score",
        shortLabel: "Access gap score",
        unit: "/100"
      }
    ]
  }
];

export const METRICS = METRIC_CATEGORIES.flatMap((category) => category.metrics);

export const METRIC_BY_KEY = Object.fromEntries(
  METRICS.map((metric) => [metric.key, metric])
);

export function metricsForCategory(categoryKey) {
  return METRIC_CATEGORIES.find((category) => category.key === categoryKey)?.metrics || METRIC_CATEGORIES[0].metrics;
}

const PALETTE = [
  "#16363c",
  "#12535a",
  "#0e7473",
  "#1f9a7c",
  "#88bf60",
  "#d3a647",
  "#f47b45"
];

export function getMetricValues(features, metricKey) {
  return features
    .map((feature) => feature?.properties?.[metricKey])
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number)
    .sort((a, b) => a - b);
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sortedValues[base + 1];
  if (next !== undefined) {
    return sortedValues[base] + rest * (next - sortedValues[base]);
  }
  return sortedValues[base];
}

export function buildColorStops(features, metricKey) {
  const values = getMetricValues(features, metricKey);
  if (!values.length) {
    return PALETTE.map((color, index) => ({ value: index, color }));
  }

  const quantiles = PALETTE.map((color, index) => ({
    value: quantile(values, index / (PALETTE.length - 1)),
    color
  }));

  let lastValue = -Infinity;
  return quantiles.map((stop, index) => {
    const adjustedValue = stop.value <= lastValue ? lastValue + 1 : stop.value;
    lastValue = adjustedValue;
    return {
      color: stop.color,
      value: Number(adjustedValue.toFixed(2)),
      label: index === 0 || index === quantiles.length - 1
    };
  });
}

export function colorForValue(value, stops) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return NO_DATA_COLOR;
  }
  const numeric = Number(value);
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (numeric >= stops[index].value) {
      return stops[index].color;
    }
  }
  return stops[0]?.color || NO_DATA_COLOR;
}

export function buildFillExpression(metricKey, stops) {
  const expression = [
    "interpolate",
    ["linear"],
    ["to-number", ["get", metricKey]],
    ...stops.flatMap((stop) => [stop.value, stop.color])
  ];

  return [
    "case",
    ["all", ["==", ["get", "has_data"], true], ["has", metricKey]],
    expression,
    NO_DATA_COLOR
  ];
}
