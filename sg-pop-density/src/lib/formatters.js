export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "No data";
  }
  return new Intl.NumberFormat("en-SG").format(Math.round(Number(value)));
}

export function formatCompact(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "No data";
  }
  return new Intl.NumberFormat("en-SG", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value));
}

export function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "No data";
  }
  return new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: digits
  }).format(Number(value));
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "No data";
  }
  return `${new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: 1
  }).format(Number(value))}%`;
}

export function titleCase(value) {
  if (!value) return "No data";
  return String(value)
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
