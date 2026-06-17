#!/usr/bin/env python3
"""
Build the enriched Singapore subzone population GeoJSON used by SG Population Atlas.

Expected inputs:
  data/raw/master-plan-2019-subzone.geojson
  data/raw/resident-population-census-2020.csv

Output:
  public/data/sg-subzone-population.geojson

The Census 2020 CSV distributed by SingStat/Data.gov.sg is grouped as:
  Planning Area - Total
  Subzone row
  Subzone row

If your downloaded CSV has explicit planning-area/subzone columns instead, adjust the
column mapping block in load_population() below. The script prints the detected
headers, join success rate, and unmatched subzones to make name debugging visible.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
GEOJSON_PATH = RAW_DIR / "master-plan-2019-subzone.geojson"
CSV_PATH = RAW_DIR / "resident-population-census-2020.csv"
OUTPUT_PATH = ROOT / "public" / "data" / "sg-subzone-population.geojson"


AGE_ORDER = [
    "0_4",
    "5_9",
    "10_14",
    "15_19",
    "20_24",
    "25_29",
    "30_34",
    "35_39",
    "40_44",
    "45_49",
    "50_54",
    "55_59",
    "60_64",
    "65_69",
    "70_74",
    "75_79",
    "80_84",
    "85_89",
    "90andOver",
]


def normalize_key(value: Any) -> str:
    """Normalize Census and Master Plan names for joining."""
    text = "" if value is None else str(value)
    text = text.upper().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def numeric(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("-", "", regex=False)
        .str.strip()
    )
    return pd.to_numeric(cleaned, errors="coerce").fillna(0).astype(int)


def detect_column(columns: list[str], candidates: list[str], required: bool = True) -> str | None:
    lower_lookup = {column.lower(): column for column in columns}
    for candidate in candidates:
        found = lower_lookup.get(candidate.lower())
        if found:
            return found

    normalized_lookup = {
        re.sub(r"[^a-z0-9]", "", column.lower()): column for column in columns
    }
    for candidate in candidates:
        found = normalized_lookup.get(re.sub(r"[^a-z0-9]", "", candidate.lower()))
        if found:
            return found

    if required:
        raise ValueError(
            f"Could not detect a required column. Tried: {', '.join(candidates)}"
        )
    return None


def detect_property(properties: dict[str, Any], candidates: list[str]) -> str:
    columns = list(properties.keys())
    found = detect_column(columns, candidates)
    if not found:
        raise ValueError(f"Could not detect GeoJSON property from {candidates}")
    return found


def age_label(age_key: str) -> str:
    return age_key.replace("_", "-").replace("andOver", "+")


def age_start(age_key: str) -> int:
    match = re.match(r"(\d+)", age_key)
    return int(match.group(1)) if match else 0


def age_total_column(columns: list[str], age_key: str) -> str | None:
    target = f"Total_{age_key}".lower()
    for column in columns:
        if column.lower() == target:
            return column
    return None


def sex_total_column(columns: list[str], sex: str, age_key: str | None = None) -> str | None:
    suffix = "Total" if age_key is None else age_key
    target = f"{sex}_{suffix}".lower()
    for column in columns:
        if column.lower() == target:
            return column
    return None


def build_age_breakdown(row: pd.Series, columns: list[str]) -> list[dict[str, int | str]]:
    breakdown: list[dict[str, int | str]] = []
    for key in AGE_ORDER:
        total_col = age_total_column(columns, key)
        male_col = sex_total_column(columns, "Males", key)
        female_col = sex_total_column(columns, "Females", key)
        breakdown.append(
            {
                "age": age_label(key),
                "total": int(row.get(total_col, 0)) if total_col else 0,
                "male": int(row.get(male_col, 0)) if male_col else 0,
                "female": int(row.get(female_col, 0)) if female_col else 0,
            }
        )
    return breakdown


def load_population() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH, encoding="utf-8-sig")
    print("CSV columns detected:")
    print(", ".join(df.columns))

    # Column mapping block:
    # This Census 2020 file uses a single geography label column named "Number".
    # If your CSV has separate columns such as "Planning Area" and "Subzone",
    # change geography_col and the planning-area inference logic below.
    geography_col = detect_column(
        list(df.columns),
        ["Number", "Subzone", "Subzone of Residence", "Planning Area/Subzone"],
    )
    total_col = detect_column(
        list(df.columns),
        ["Total_Total", "Total", "Resident Population"],
    )
    male_total_col = sex_total_column(list(df.columns), "Males")
    female_total_col = sex_total_column(list(df.columns), "Females")

    for col in df.columns:
        if col != geography_col:
            df[col] = numeric(df[col])

    rows: list[dict[str, Any]] = []
    current_planning_area: str | None = None

    for _, row in df.iterrows():
        label = str(row[geography_col]).strip()
        label_key = normalize_key(label)
        if not label or label_key == "TOTAL":
            continue

        if re.search(r"\s*-\s*TOTAL$", label, flags=re.IGNORECASE):
            current_planning_area = re.sub(
                r"\s*-\s*Total$", "", label, flags=re.IGNORECASE
            ).strip()
            continue

        if current_planning_area is None:
            print(f"Skipping row without a planning-area context: {label}")
            continue

        total_population = int(row[total_col])
        youth = sum(
            int(row[col])
            for key in AGE_ORDER
            if age_start(key) < 15
            for col in [age_total_column(list(df.columns), key)]
            if col
        )
        working_age = sum(
            int(row[col])
            for key in AGE_ORDER
            if 15 <= age_start(key) <= 64
            for col in [age_total_column(list(df.columns), key)]
            if col
        )
        elderly = sum(
            int(row[col])
            for key in AGE_ORDER
            if age_start(key) >= 65
            for col in [age_total_column(list(df.columns), key)]
            if col
        )

        rows.append(
            {
                "planning_area": current_planning_area,
                "subzone": label,
                "planning_area_key": normalize_key(current_planning_area),
                "subzone_key": normalize_key(label),
                "total_population": total_population,
                "youth_0_14": youth,
                "working_age_15_64": working_age,
                "elderly_65_plus": elderly,
                "elderly_share": round((elderly / total_population * 100), 2)
                if total_population
                else None,
                "male_population": int(row[male_total_col]) if male_total_col else None,
                "female_population": int(row[female_total_col]) if female_total_col else None,
                "age_breakdown": build_age_breakdown(row, list(df.columns)),
            }
        )

    population = pd.DataFrame(rows)
    if population.empty:
        raise ValueError("No subzone population rows were parsed from the CSV.")

    numeric_cols = [
        "total_population",
        "youth_0_14",
        "working_age_15_64",
        "elderly_65_plus",
        "male_population",
        "female_population",
    ]
    grouped = (
        population.groupby(["planning_area_key", "subzone_key"], as_index=False)
        .agg(
            {
                "planning_area": "first",
                "subzone": "first",
                **{col: "sum" for col in numeric_cols if col in population.columns},
                "elderly_share": "first",
                "age_breakdown": "first",
            }
        )
        .reset_index(drop=True)
    )
    print(f"Parsed {len(grouped)} subzone population rows from the CSV.")
    return grouped


def compute_area_km2(feature: dict[str, Any]) -> float | None:
    props = feature.get("properties", {})
    raw_area = props.get("SHAPE.AREA") or props.get("shape_area") or props.get("Shape_Area")
    if raw_area is not None:
        try:
            return float(raw_area) / 1_000_000
        except (TypeError, ValueError):
            pass
    return None


def maybe_compute_missing_area_with_geopandas(
    geojson: dict[str, Any],
) -> list[float | None] | None:
    if all(compute_area_km2(feature) is not None for feature in geojson["features"]):
        return None

    try:
        import geopandas as gpd  # type: ignore
    except ImportError:
        print(
            "GeoPandas is not installed and some features do not include SHAPE.AREA; "
            "area/density will be missing for those features."
        )
        return None

    gdf = gpd.read_file(GEOJSON_PATH)
    gdf = gdf.to_crs(epsg=3414)
    return (gdf.geometry.area / 1_000_000).tolist()


def round_or_none(value: float | None, digits: int = 2) -> float | None:
    if value is None or math.isnan(value):
        return None
    return round(value, digits)


def enrich_geojson(population: pd.DataFrame) -> dict[str, Any]:
    with GEOJSON_PATH.open(encoding="utf-8") as f:
        geojson = json.load(f)

    if not geojson.get("features"):
        raise ValueError("GeoJSON has no features.")

    first_props = geojson["features"][0]["properties"]
    subzone_prop = detect_property(first_props, ["SUBZONE_N", "Subzone", "SUBZONE_NAME"])
    planning_prop = detect_property(
        first_props, ["PLN_AREA_N", "Planning Area", "PLANNING_AREA"]
    )
    region_prop = detect_property(first_props, ["REGION_N", "Region", "REGION"])

    print(
        "GeoJSON join properties detected: "
        f"planning_area={planning_prop}, subzone={subzone_prop}, region={region_prop}"
    )

    pop_lookup = {
        (row["planning_area_key"], row["subzone_key"]): row
        for _, row in population.iterrows()
    }
    matched_geo_keys: set[tuple[str, str]] = set()
    unmatched_features: list[str] = []
    geopandas_areas = maybe_compute_missing_area_with_geopandas(geojson)

    for index, feature in enumerate(geojson["features"]):
        props = feature.setdefault("properties", {})
        planning_area = props.get(planning_prop)
        subzone = props.get(subzone_prop)
        region = props.get(region_prop)
        join_key = (normalize_key(planning_area), normalize_key(subzone))
        row = pop_lookup.get(join_key)

        atlas_id = str(props.get("OBJECTID") or props.get("SUBZONE_C") or index)
        feature["id"] = atlas_id
        props["atlas_id"] = atlas_id
        props["subzone_name"] = subzone
        props["planning_area"] = planning_area
        props["region"] = region

        area_km2 = compute_area_km2(feature)
        if area_km2 is None and geopandas_areas is not None:
            area_km2 = geopandas_areas[index]

        props["area_km2"] = round_or_none(area_km2, 4)

        if row is None:
            unmatched_features.append(f"{planning_area} / {subzone}")
            props.update(
                {
                    "has_data": False,
                    "total_population": None,
                    "density_per_km2": None,
                    "youth_0_14": None,
                    "working_age_15_64": None,
                    "elderly_65_plus": None,
                    "elderly_share": None,
                    "male_population": None,
                    "female_population": None,
                    "age_breakdown": [],
                }
            )
            continue

        matched_geo_keys.add(join_key)
        total_population = int(row["total_population"])
        density = total_population / area_km2 if area_km2 and area_km2 > 0 else None
        props.update(
            {
                "has_data": True,
                "total_population": total_population,
                "density_per_km2": round_or_none(density, 0),
                "youth_0_14": int(row["youth_0_14"]),
                "working_age_15_64": int(row["working_age_15_64"]),
                "elderly_65_plus": int(row["elderly_65_plus"]),
                "elderly_share": round_or_none(row["elderly_share"], 2),
                "male_population": int(row["male_population"])
                if pd.notna(row.get("male_population"))
                else None,
                "female_population": int(row["female_population"])
                if pd.notna(row.get("female_population"))
                else None,
                "age_breakdown": row["age_breakdown"],
            }
        )

    matched = len(matched_geo_keys)
    total_features = len(geojson["features"])
    print(
        f"Join success rate: {matched}/{total_features} "
        f"({matched / total_features * 100:.1f}% of GeoJSON subzones matched)"
    )

    if unmatched_features:
        print("\nUnmatched GeoJSON subzones:")
        for name in unmatched_features:
            print(f"  - {name}")

    census_keys = set(pop_lookup.keys())
    unused_census = sorted(census_keys - matched_geo_keys)
    if unused_census:
        print("\nCensus rows not matched to GeoJSON:")
        for planning_key, subzone_key in unused_census:
            print(f"  - {planning_key} / {subzone_key}")

    return geojson


def main() -> None:
    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(f"Missing GeoJSON: {GEOJSON_PATH}")
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Missing CSV: {CSV_PATH}")

    population = load_population()
    geojson = enrich_geojson(population)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWrote enriched GeoJSON to {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
