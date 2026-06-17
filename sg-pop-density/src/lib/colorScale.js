export const NO_DATA_COLOR = "#434a51";

export const METRICS = [
  {
    key: "density_per_km2",
    label: "Population density",
    shortLabel: "Density",
    unit: "/ km²"
  },
  {
    key: "total_population",
    label: "Total population",
    shortLabel: "Population",
    unit: "people"
  },
  {
    key: "elderly_65_plus",
    label: "Elderly 65+",
    shortLabel: "Elderly",
    unit: "people"
  },
  {
    key: "youth_0_14",
    label: "Youth 0-14",
    shortLabel: "Youth",
    unit: "people"
  },
  {
    key: "working_age_15_64",
    label: "Working age 15-64",
    shortLabel: "Working age",
    unit: "people"
  }
];

export const METRIC_BY_KEY = Object.fromEntries(
  METRICS.map((metric) => [metric.key, metric])
);

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
