#!/usr/bin/env python3
"""
Build static GeoJSON data for SG Population Atlas.

Outputs:
  public/data/sg-subzone-enriched.geojson
  public/data/sg-electoral-2025-enriched.geojson
  public/data/sg-subzone-population.geojson  (legacy frontend fallback)

OneMap is used only during preprocessing for optional MRT/bus point datasets.
The frontend never calls OneMap.
"""

from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path
from typing import Any

import pandas as pd
import requests

try:
    import geopandas as gpd
    from shapely.geometry import Point
except ImportError:  # pragma: no cover
    gpd = None
    Point = None

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
CACHE_DIR = ROOT / "data" / "cache"
PUBLIC_DATA_DIR = ROOT / "public" / "data"

SUBZONE_GEOJSON = RAW_DIR / "master-plan-2019-subzone.geojson"
AGE_SEX_CSV = RAW_DIR / "resident-population-age-sex-2020.csv"
ETHNIC_SEX_CSV = RAW_DIR / "resident-population-ethnic-sex-2020.csv"
LAND_USE_GEOJSON = RAW_DIR / "master-plan-2019-land-use.geojson"
HAWKER_GEOJSON = RAW_DIR / "hawker-centres.geojson"
ELECTORAL_GEOJSON = RAW_DIR / "electoral-boundary-2025.geojson"
MRT_STATIONS_GEOJSON = RAW_DIR / "mrt-stations.geojson"
BUS_STOPS_GEOJSON = RAW_DIR / "bus-stops.geojson"
MRT_CACHE_GEOJSON = CACHE_DIR / "onemap-mrt-stations.geojson"
BUS_CACHE_GEOJSON = CACHE_DIR / "onemap-bus-stops.geojson"
TRANSPORT_ACCESS_CACHE = CACHE_DIR / "onemap-transport-access.json"

OUTPUT_SUBZONE = PUBLIC_DATA_DIR / "sg-subzone-enriched.geojson"
OUTPUT_ELECTORAL = PUBLIC_DATA_DIR / "sg-electoral-2025-enriched.geojson"
OUTPUT_LEGACY = PUBLIC_DATA_DIR / "sg-subzone-population.geojson"

WGS84 = "EPSG:4326"
SVY21 = "EPSG:3414"
SINGAPORE_EXTENTS = "1.16,103.59,1.48,104.08"
BUS_ACCESS_DISTANCE_M = 500
MRT_LRT_ACCESS_DISTANCE_M = 800
MAX_ONEMAP_RADIUS_M = 5000

# COLUMN_MAPPING:
# The supplied Census 2020 files use one geography column named "Number" and
# planning-area grouping rows ending in "- Total". If your CSV has explicit
# geography columns, adjust these candidates and parse_grouped_census().
COLUMN_MAPPING = {
    "geography": ["Number", "Subzone", "Subzone of Residence", "Planning Area/Subzone"],
    "age_total": ["Total_Total", "Total", "Resident Population"],
    "ethnic_total": ["Total_Total", "Total", "Resident Population"],
    "chinese": ["Chinese_Total", "Chinese"],
    "malay": ["Malays_Total", "Malay_Total", "Malay"],
    "indian": ["Indians_Total", "Indian_Total", "Indian"],
    "others": ["Others_Total", "Other_Total", "Others", "Other"],
}

GEOJSON_MAPPING = {
    "subzone": ["SUBZONE_N", "Subzone", "SUBZONE_NAME"],
    "planning_area": ["PLN_AREA_N", "Planning Area", "PLANNING_AREA"],
    "region": ["REGION_N", "Region", "REGION"],
    "area": ["SHAPE.AREA", "Shape_Area", "shape_area"],
    "hawker_name": ["NAME", "ADDRESSBUILDINGNAME", "Name"],
}

# LAND_USE_COLUMN_MAPPING:
# URA land-use files commonly use LU_DESC. Update this if your file uses a
# different description field.
LAND_USE_COLUMN_MAPPING = {
    "description": ["LU_DESC", "LAND_USE", "LU_DESC_TEXT", "LANDUSE", "LANDUSE_DESC"]
}

ELECTORAL_COLUMN_MAPPING = {
    "name": ["ED_DESC", "ELECTORAL_DIVISION", "ELECTORAL_NAME", "NAME", "ED_NAME", "DIVISION_N"],
    "type": ["ED_TYPE", "ELECTORAL_TYPE", "TYPE", "DIVISION_TYPE", "GRC_SMC"],
}

LAND_USE_BUCKETS = {
    "residential_land_share": {
        "RESIDENTIAL",
        "RESIDENTIAL WITH COMMERCIAL AT 1ST STOREY",
        "WHITE SITE",
    },
    "commercial_land_share": {
        "COMMERCIAL",
        "HOTEL",
        "BUSINESS PARK",
        "COMMERCIAL & RESIDENTIAL",
        "SPORTS & RECREATION",
    },
    "industrial_land_share": {
        "BUSINESS 1",
        "BUSINESS 2",
        "BUSINESS PARK",
        "INDUSTRIAL",
        "PORT / AIRPORT",
    },
    "park_open_space_share": {
        "PARK",
        "OPEN SPACE",
        "BEACH AREA",
        "RESERVE SITE",
        "WATERBODY",
    },
    "transport_utilities_land_share": {
        "ROAD",
        "TRANSPORT FACILITIES",
        "MASS RAPID TRANSIT",
        "UTILITY",
        "DRAINAGE",
    },
    "education_institution_land_share": {
        "EDUCATIONAL INSTITUTION",
        "CIVIC & COMMUNITY INSTITUTION",
        "HEALTH & MEDICAL CARE",
        "PLACE OF WORSHIP",
    },
}
LAND_USE_FIELDS = list(LAND_USE_BUCKETS.keys()) + ["other_land_share"]

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

POINT_LAT_KEYS = ["LATITUDE", "Latitude", "lat", "Lat", "Y", "y"]
POINT_LON_KEYS = ["LONGITUDE", "LONGTITUDE", "Longitude", "lon", "Lon", "Lng", "X", "x"]


def normalize_name(value: Any) -> str:
    text = "" if value is None else str(value)
    return re.sub(r"\s+", " ", text.upper().strip())


normalize_key = normalize_name


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in {None, 0}:
        return None
    try:
        return float(numerator) / float(denominator)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def calculate_share(numerator: float | None, denominator: float | None, digits: int = 2) -> float | None:
    ratio = safe_divide(numerator, denominator)
    return None if ratio is None else round(ratio * 100, digits)


percent = calculate_share


def number_or_none(value: Any, digits: int | None = None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(numeric) or math.isinf(numeric):
        return None
    return round(numeric, digits) if digits is not None else numeric


def numeric_value(value: Any) -> int:
    if value is None:
        return 0
    text = str(value).replace(",", "").strip()
    if text in {"", "-", "na", "NA", "nan", "Nan"}:
        return 0
    return int(float(text))


def sanitize_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: sanitize_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_json(item) for item in value]
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def detect_column(columns: list[str], candidates: list[str], required: bool = True) -> str | None:
    lower_lookup = {str(column).lower(): column for column in columns}
    for candidate in candidates:
        if candidate.lower() in lower_lookup:
            return lower_lookup[candidate.lower()]

    normalized_lookup = {re.sub(r"[^a-z0-9]", "", str(column).lower()): column for column in columns}
    for candidate in candidates:
        key = re.sub(r"[^a-z0-9]", "", candidate.lower())
        if key in normalized_lookup:
            return normalized_lookup[key]

    if required:
        raise ValueError(f"Could not detect required column. Tried: {candidates}")
    return None


def detect_property(properties: dict[str, Any], candidates: list[str], required: bool = True) -> str | None:
    return detect_column(list(properties.keys()), candidates, required=required)


def age_label(age_key: str) -> str:
    return age_key.replace("_", "-").replace("andOver", "+")


def age_start(age_key: str) -> int:
    match = re.match(r"(\d+)", age_key)
    return int(match.group(1)) if match else 0


def age_total_column(columns: list[str], age_key: str) -> str | None:
    return detect_column(columns, [f"Total_{age_key}"], required=False)


def sex_total_column(columns: list[str], sex: str, age_key: str | None = None) -> str | None:
    suffix = "Total" if age_key is None else age_key
    return detect_column(columns, [f"{sex}_{suffix}"], required=False)


def empty_feature_collection() -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": []}


def load_dotenv_local() -> None:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_onemap_token() -> str | None:
    for name in ["ONEMAP_TOKEN", "ONEMAP_API_TOKEN", "ONEMAP_ACCESS_TOKEN", "ONEMAP_API_KEY"]:
        value = os.getenv(name)
        if value:
            print(f"OneMap token found via {name}.")
            return value
    print("OneMap token missing; transport access fields will be null.")
    return None


def print_loaded(path: Path) -> None:
    if path.exists():
        print(f"Loaded file: {path.relative_to(ROOT)}")
    else:
        print(f"Missing file: {path.relative_to(ROOT)}")


def parse_grouped_census(path: Path, label: str) -> tuple[pd.DataFrame, list[str]]:
    print_loaded(path)
    df = pd.read_csv(path, encoding="utf-8-sig")
    columns = list(df.columns)
    print(f"\n{label} CSV columns detected:")
    print(", ".join(columns))

    geography_col = detect_column(columns, COLUMN_MAPPING["geography"])
    rows: list[dict[str, Any]] = []
    current_planning_area: str | None = None

    for _, row in df.iterrows():
        geography = str(row[geography_col]).strip()
        geography_key = normalize_name(geography)
        if not geography or geography_key == "TOTAL":
            continue

        if re.search(r"\s*-\s*TOTAL$", geography, flags=re.IGNORECASE):
            current_planning_area = re.sub(r"\s*-\s*Total$", "", geography, flags=re.IGNORECASE).strip()
            continue

        if current_planning_area is None:
            print(f"Skipping {label} row without planning-area context: {geography}")
            continue

        values = row.to_dict()
        values.update(
            {
                "planning_area": current_planning_area,
                "subzone": geography,
                "planning_area_key": normalize_name(current_planning_area),
                "subzone_key": normalize_name(geography),
            }
        )
        rows.append(values)

    parsed = pd.DataFrame(rows)
    print(f"Parsed {len(parsed)} {label} subzone rows.")
    return parsed, columns


def build_age_breakdown(row: pd.Series, columns: list[str]) -> list[dict[str, int | str]]:
    breakdown: list[dict[str, int | str]] = []
    for key in AGE_ORDER:
        total_col = age_total_column(columns, key)
        male_col = sex_total_column(columns, "Males", key)
        female_col = sex_total_column(columns, "Females", key)
        breakdown.append(
            {
                "age": age_label(key),
                "total": numeric_value(row.get(total_col)) if total_col else 0,
                "male": numeric_value(row.get(male_col)) if male_col else 0,
                "female": numeric_value(row.get(female_col)) if female_col else 0,
            }
        )
    return breakdown


def load_age_population() -> pd.DataFrame:
    df, columns = parse_grouped_census(AGE_SEX_CSV, "Age/sex")
    total_col = detect_column(columns, COLUMN_MAPPING["age_total"])
    male_total_col = sex_total_column(columns, "Males")
    female_total_col = sex_total_column(columns, "Females")

    rows = []
    for _, row in df.iterrows():
        total = numeric_value(row.get(total_col))
        youth = sum(
            numeric_value(row.get(col))
            for key in AGE_ORDER
            if age_start(key) < 15
            for col in [age_total_column(columns, key)]
            if col
        )
        working = sum(
            numeric_value(row.get(col))
            for key in AGE_ORDER
            if 15 <= age_start(key) <= 64
            for col in [age_total_column(columns, key)]
            if col
        )
        elderly = sum(
            numeric_value(row.get(col))
            for key in AGE_ORDER
            if age_start(key) >= 65
            for col in [age_total_column(columns, key)]
            if col
        )
        rows.append(
            {
                "planning_area": row["planning_area"],
                "subzone": row["subzone"],
                "planning_area_key": row["planning_area_key"],
                "subzone_key": row["subzone_key"],
                "total_population": total,
                "youth_0_14": youth,
                "youth_share": calculate_share(youth, total),
                "working_age_15_64": working,
                "working_age_share": calculate_share(working, total),
                "elderly_65_plus": elderly,
                "elderly_share": calculate_share(elderly, total),
                "male_population": numeric_value(row.get(male_total_col)) if male_total_col else None,
                "female_population": numeric_value(row.get(female_total_col)) if female_total_col else None,
                "age_breakdown": build_age_breakdown(row, columns),
            }
        )
    return pd.DataFrame(rows)


def load_ethnic_population() -> pd.DataFrame:
    df, columns = parse_grouped_census(ETHNIC_SEX_CSV, "Ethnic group/sex")
    total_col = detect_column(columns, COLUMN_MAPPING["ethnic_total"])
    chinese_col = detect_column(columns, COLUMN_MAPPING["chinese"])
    malay_col = detect_column(columns, COLUMN_MAPPING["malay"])
    indian_col = detect_column(columns, COLUMN_MAPPING["indian"])
    others_col = detect_column(columns, COLUMN_MAPPING["others"])

    rows = []
    for _, row in df.iterrows():
        total = numeric_value(row.get(total_col))
        chinese = numeric_value(row.get(chinese_col))
        malay = numeric_value(row.get(malay_col))
        indian = numeric_value(row.get(indian_col))
        others = numeric_value(row.get(others_col))
        shares_decimal = [(value / total) if total else 0 for value in [chinese, malay, indian, others]]
        diversity = 1 - sum(value * value for value in shares_decimal) if total else None
        rows.append(
            {
                "planning_area_key": row["planning_area_key"],
                "subzone_key": row["subzone_key"],
                "chinese_population": chinese,
                "malay_population": malay,
                "indian_population": indian,
                "others_population": others,
                "chinese_share": calculate_share(chinese, total),
                "malay_share": calculate_share(malay, total),
                "indian_share": calculate_share(indian, total),
                "others_share": calculate_share(others, total),
                "ethnic_diversity_index": round(diversity, 4) if diversity is not None else None,
            }
        )
    return pd.DataFrame(rows)


def print_join_report(name: str, total_features: int, matched: int, unmatched: list[str]) -> None:
    rate = matched / total_features * 100 if total_features else 0
    print(f"{name} join success rate: {matched}/{total_features} ({rate:.1f}%)")
    if unmatched:
        print(f"Unmatched {name} subzones:")
        for item in unmatched:
            print(f"  - {item}")


def read_geojson(path: Path) -> dict[str, Any]:
    print_loaded(path)
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_geodata(path: Path):
    if gpd is None:
        raise RuntimeError("GeoPandas is required. Install with: pip install pandas geopandas shapely requests")
    print_loaded(path)
    data = gpd.read_file(path)
    if data.crs is None:
        data = data.set_crs(WGS84, allow_override=True)
    return data.to_crs(WGS84)


def classify_land_use(value: Any) -> str:
    normalized = normalize_name(value)
    if any(term in normalized for term in ["RESIDENTIAL"]):
        return "residential_land_share"
    if any(term in normalized for term in ["BUSINESS 1", "BUSINESS 2", "BUSINESS PARK", "INDUSTRIAL", "PORT", "AIRPORT"]):
        return "industrial_land_share"
    if any(term in normalized for term in ["PARK", "OPEN SPACE", "BEACH", "RESERVE SITE", "WATERBODY", "SPORTS", "RECREATION"]):
        return "park_open_space_share"
    if any(term in normalized for term in ["ROAD", "TRANSPORT", "MASS RAPID TRANSIT", "RAIL", "UTILITY", "DRAINAGE"]):
        return "transport_utilities_land_share"
    if any(term in normalized for term in ["EDUCATIONAL", "CIVIC", "COMMUNITY", "HEALTH", "MEDICAL", "PLACE OF WORSHIP"]):
        return "education_institution_land_share"
    if any(term in normalized for term in ["COMMERCIAL", "HOTEL", "WHITE"]):
        return "commercial_land_share"
    return "other_land_share"


def calculate_land_use_shares(polygons_gdf, id_col: str = "atlas_join_key") -> dict[str, dict[str, float | None]]:
    fallback = {key: {field: None for field in LAND_USE_FIELDS} for key in polygons_gdf[id_col].tolist()}
    if not LAND_USE_GEOJSON.exists():
        print("Land-use GeoJSON missing; land-use shares will be null.")
        return fallback
    if gpd is None:
        print("GeoPandas missing; land-use shares will be null.")
        return fallback

    print("\nCalculating land-use shares with polygon intersections...")
    landuse = load_geodata(LAND_USE_GEOJSON)
    print("Land-use columns detected:")
    print(", ".join(map(str, landuse.columns)))
    description_col = detect_property(landuse.iloc[0].to_dict(), LAND_USE_COLUMN_MAPPING["description"])
    print(f"Total land-use polygons loaded: {len(landuse)}")
    unique_values = sorted(str(value) for value in landuse[description_col].dropna().unique())
    print(f"Unique {description_col} values: {unique_values[:80]}")
    landuse = landuse[[description_col, "geometry"]].copy()
    landuse["land_bucket"] = landuse[description_col].map(classify_land_use)
    landuse = landuse.to_crs(SVY21)
    polygons = polygons_gdf.to_crs(SVY21)
    spatial_index = landuse.sindex
    result: dict[str, dict[str, float | None]] = {}

    for index, polygon in polygons.iterrows():
        geom = polygon.geometry
        total_area = float(geom.area) if geom is not None else 0
        bucket_areas = {field: 0.0 for field in LAND_USE_FIELDS}
        if total_area <= 0:
            result[polygon[id_col]] = {field: None for field in LAND_USE_FIELDS}
            continue

        candidate_indexes = spatial_index.query(geom, predicate="intersects")
        for land_index in candidate_indexes:
            land_row = landuse.iloc[land_index]
            try:
                area = geom.intersection(land_row.geometry).area
            except Exception:
                area = 0
            if area > 0:
                bucket_areas[land_row["land_bucket"]] += area

        used_area = sum(bucket_areas.values())
        result[polygon[id_col]] = (
            {field: round(bucket_areas[field] / used_area * 100, 2) for field in LAND_USE_FIELDS}
            if used_area > 0
            else {field: None for field in LAND_USE_FIELDS}
        )
        if (index + 1) % 80 == 0:
            print(f"  Land-use progress: {index + 1}/{len(polygons)}")

    populated = sum(
        1 for values in result.values()
        if any(values.get(field) is not None for field in LAND_USE_FIELDS)
    )
    label = "Electoral divisions" if id_col == "electoral_id" else "Subzones"
    print(f"{label} with land-use shares: {populated}/{len(polygons)}")
    return result


def point_from_properties(properties: dict[str, Any]) -> tuple[float, float] | None:
    lat = None
    lon = None
    for key in POINT_LAT_KEYS:
        if key in properties:
            lat = number_or_none(properties[key])
            break
    for key in POINT_LON_KEYS:
        if key in properties:
            lon = number_or_none(properties[key])
            break
    if lat is None or lon is None:
        return None
    if abs(lon) < 10 and abs(lat) > 10:
        lon, lat = lat, lon
    if 90 < abs(lat) or 180 < abs(lon):
        return None
    return lon, lat


def features_from_onemap_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict):
        records = []
        for key in ["SrchResults", "SearchResults", "results", "data", "value"]:
            value = payload.get(key)
            if isinstance(value, list):
                records = value
                break
    else:
        records = []

    features = []
    for record in records:
        if not isinstance(record, dict):
            continue
        point = point_from_properties(record)
        if point is None:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": record,
                "geometry": {"type": "Point", "coordinates": [point[0], point[1]]},
            }
        )
    return features


def fetch_onemap_theme_points(theme_name: str, cache_path: Path) -> Path | None:
    token = os.getenv("ONEMAP_TOKEN") or os.getenv("ONEMAP_API_TOKEN")
    if not token:
        return None

    endpoint = os.getenv(
        "ONEMAP_THEME_URL",
        "https://www.onemap.gov.sg/api/public/themesvc/retrieveTheme",
    )
    headers = {"Authorization": f"Bearer {token}"}
    params = {"queryName": theme_name, "extents": SINGAPORE_EXTENTS}
    print(f"Fetching OneMap theme '{theme_name}' into {cache_path.relative_to(ROOT)}...")
    try:
        response = requests.get(endpoint, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        features = features_from_onemap_payload(response.json())
        if not features:
            print(f"  OneMap theme '{theme_name}' returned no point features.")
            return None
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with cache_path.open("w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False)
        print(f"  Cached {len(features)} OneMap '{theme_name}' points.")
        return cache_path
    except Exception as error:
        print(f"  OneMap fetch failed for '{theme_name}': {error}")
        return None


def resolve_transport_source(local_path: Path, cache_path: Path, theme_env: str, default_theme: str, label: str) -> Path | None:
    if local_path.exists():
        print(f"Optional {label} dataset found: {local_path.relative_to(ROOT)}")
        return local_path
    if cache_path.exists():
        print(f"Cached OneMap {label} dataset found: {cache_path.relative_to(ROOT)}")
        return cache_path
    theme_name = os.getenv(theme_env, default_theme)
    fetched = fetch_onemap_theme_points(theme_name, cache_path)
    if fetched:
        return fetched
    print(f"Warning: optional {label} dataset unavailable; {label} fields will be null.")
    return None


def spatial_count_points_in_polygons(polygons_gdf, points_path: Path | None, id_col: str, output_field: str) -> dict[str, dict[str, int | None]]:
    fallback = {key: {output_field: None} for key in polygons_gdf[id_col].tolist()}
    if points_path is None:
        return fallback
    if gpd is None:
        return fallback

    try:
        points = load_geodata(points_path)
    except Exception as error:
        print(f"Failed to load point dataset {points_path}: {error}")
        return fallback

    if points.empty:
        return fallback
    polygons = polygons_gdf[[id_col, "geometry"]].to_crs(SVY21).copy()
    points = points.to_crs(SVY21)
    joined = gpd.sjoin(points[["geometry"]], polygons, how="left", predicate="within")
    counts = joined.dropna(subset=[id_col]).groupby(id_col).size().to_dict()
    return {key: {output_field: int(counts.get(key, 0))} for key in polygons_gdf[id_col].tolist()}


def load_transport_cache() -> dict[str, Any]:
    if not TRANSPORT_ACCESS_CACHE.exists():
        return {}
    try:
        with TRANSPORT_ACCESS_CACHE.open(encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict):
            print("Using cached OneMap transport access...")
            return payload
    except Exception as error:
        print(f"Warning: could not read OneMap transport cache: {error}")
    return {}


def save_transport_cache(cache: dict[str, Any]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with TRANSPORT_ACCESS_CACHE.open("w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def iter_geometry_coords(geometry):
    if geometry is None:
        return
    if hasattr(geometry, "geoms"):
        for child in geometry.geoms:
            yield from iter_geometry_coords(child)
        return
    if hasattr(geometry, "coords"):
        for coord in geometry.coords:
            yield coord
        return
    if hasattr(geometry, "exterior"):
        yield from iter_geometry_coords(geometry.exterior)
        for interior in getattr(geometry, "interiors", []):
            yield from iter_geometry_coords(interior)


def farthest_boundary_distance(centroid, polygon) -> float:
    distances = [centroid.distance(Point(x, y)) for x, y, *_ in iter_geometry_coords(polygon.boundary)]
    return max(distances) if distances else 0.0


def parse_onemap_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ["results", "SearchResults", "SrchResults", "data", "value"]:
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def transport_point_svy21(record: dict[str, Any]):
    x = number_or_none(record.get("X") or record.get("x"))
    y = number_or_none(record.get("Y") or record.get("y"))
    if x is not None and y is not None and abs(x) > 180 and abs(y) > 90:
        return Point(x, y)

    point = point_from_properties(record)
    if point is None:
        return None
    lon, lat = point
    try:
        return gpd.GeoSeries([Point(lon, lat)], crs=WGS84).to_crs(SVY21).iloc[0]
    except Exception:
        return None


def onemap_nearby_transport(lat: float, lon: float, radius: int, transport_type: str, token: str) -> list[dict[str, Any]]:
    base_url = os.getenv("ONEMAP_NEARBY_TRANSPORT_URL", "https://www.onemap.gov.sg")
    if transport_type == "bus":
        endpoint = f"{base_url.rstrip('/')}/api/public/nearbysvc/getNearestBusStops"
    else:
        endpoint = f"{base_url.rstrip('/')}/api/public/nearbysvc/getNearestMrtStops"
    headers = {"Authorization": token, "accept": "application/json"}
    param_sets = [
        {"latitude": lat, "longitude": lon, "radius_in_meters": radius},
    ]
    timeout = number_or_none(os.getenv("ONEMAP_TRANSPORT_TIMEOUT_SECONDS")) or 6
    last_error = None
    for params in param_sets:
        try:
            response = requests.get(endpoint, headers=headers, params=params, timeout=timeout)
            response.raise_for_status()
            return parse_onemap_records(response.json())
        except Exception as error:
            last_error = error
    raise RuntimeError(last_error)


def calculate_onemap_boundary_transport(polygons_gdf, id_col: str, geography_type: str) -> dict[str, dict[str, int | None]]:
    fields = {
        "bus_stops_within_500m_boundary": None,
        "mrt_lrt_stations_within_800m_boundary": None,
        "bus_stops_inside": None,
        "mrt_stations_inside": None,
    }
    fallback = {key: fields.copy() for key in polygons_gdf[id_col].tolist()}
    if gpd is None or Point is None:
        return fallback

    token = get_onemap_token()
    if not token:
        return fallback

    print("Fetching OneMap transport access...")
    cache = load_transport_cache()
    cache_changed = False
    polygons = polygons_gdf[[id_col, "geometry"]].to_crs(SVY21).copy()
    centroids_wgs84 = polygons.set_geometry(polygons.geometry.centroid).to_crs(WGS84).geometry
    configs = [
        {
            "field": "bus_stops_within_500m_boundary",
            "alias": "bus_stops_inside",
            "access_m": BUS_ACCESS_DISTANCE_M,
            "transport_types": ["bus"],
            "label": "bus",
        },
        {
            "field": "mrt_lrt_stations_within_800m_boundary",
            "alias": "mrt_stations_inside",
            "access_m": MRT_LRT_ACCESS_DISTANCE_M,
            "transport_types": ["mrt"],
            "label": "mrt_lrt",
        },
    ]
    result = {key: fields.copy() for key in polygons[id_col].tolist()}
    populated = {config["field"]: 0 for config in configs}
    consecutive_failures = 0
    consecutive_empty = 0

    for position, (index, polygon) in enumerate(polygons.iterrows(), start=1):
        if consecutive_failures >= 8 or consecutive_empty >= 20:
            print("Warning: repeated empty/failed OneMap transport responses; skipping remaining transport calls for this layer.")
            break
        polygon_id = polygon[id_col]
        geom = polygon.geometry
        if geom is None or geom.is_empty:
            continue
        centroid = geom.centroid
        centroid_wgs84 = centroids_wgs84.loc[index]
        for config in configs:
            radius = int(min(math.ceil(farthest_boundary_distance(centroid, geom) + config["access_m"]), MAX_ONEMAP_RADIUS_M))
            cache_key = "|".join([
                geography_type,
                str(polygon_id),
                config["label"],
                str(config["access_m"]),
                str(radius),
            ])
            if cache_key in cache:
                count = cache[cache_key]
            else:
                count = None
                for transport_type in config["transport_types"]:
                    try:
                        records = onemap_nearby_transport(
                            centroid_wgs84.y,
                            centroid_wgs84.x,
                            radius,
                            transport_type,
                            token,
                        )
                        points = [transport_point_svy21(record) for record in records]
                        count = sum(
                            1 for point in points
                            if point is not None and point.distance(geom) <= config["access_m"]
                        )
                        if count or records:
                            break
                    except Exception as error:
                        print(f"Warning: OneMap {config['label']} failed for {polygon_id}: {error}")
                        consecutive_failures += 1
                        if consecutive_failures >= 8:
                            break
                if count is not None:
                    consecutive_failures = 0
                    consecutive_empty = consecutive_empty + 1 if count == 0 else 0
                    cache[cache_key] = count
                    cache_changed = True
            result[polygon_id][config["field"]] = count
            result[polygon_id][config["alias"]] = count
            if count is not None:
                populated[config["field"]] += 1
        if position % 25 == 0:
            print(f"  OneMap transport progress: {position}/{len(polygons)} {geography_type} polygons")

    if cache_changed:
        save_transport_cache(cache)
    total = len(polygons)
    print(f"Bus data populated: {populated['bus_stops_within_500m_boundary']}/{total}")
    print(f"MRT/LRT data populated: {populated['mrt_lrt_stations_within_800m_boundary']}/{total}")
    return result


def calculate_hawker_counts(polygons_gdf, id_col: str, population_lookup: dict[str, float | None]) -> dict[str, dict[str, float | int | None]]:
    counts = spatial_count_points_in_polygons(polygons_gdf, HAWKER_GEOJSON if HAWKER_GEOJSON.exists() else None, id_col, "hawker_centres_inside")
    result = {}
    for key, values in counts.items():
        count = values.get("hawker_centres_inside")
        population = population_lookup.get(key)
        per_100k = None if count is None else safe_divide(count * 100_000, population)
        result[key] = {
            "hawker_centres_inside": count,
            "hawker_per_100k_residents": number_or_none(per_100k, 2),
        }
    return result


def normalize_score(value: float | None, max_value: float, invert: bool = False) -> float | None:
    if value is None:
        return None
    ratio = max(0, min(float(value) / max_value, 1))
    return 1 - ratio if invert else ratio


def weighted_score(parts: list[tuple[float | None, float]]) -> float | None:
    available = [(value, weight) for value, weight in parts if value is not None]
    if not available:
        return None
    weighted = sum(value * weight for value, weight in available)
    total_weight = sum(weight for _, weight in available)
    return round(weighted / total_weight * 100, 1)


def calculate_transport_score(props: dict[str, Any]) -> float | None:
    # Boundary-distance transport score. Missing components are skipped and
    # available weights are rescaled.
    bus_count = props.get("bus_stops_within_500m_boundary")
    mrt_count = props.get("mrt_lrt_stations_within_800m_boundary")
    return weighted_score(
        [
            (normalize_score(bus_count, 20), 55),
            (normalize_score(mrt_count, 3), 45),
        ]
    )


def calculate_amenity_score(props: dict[str, Any]) -> float | None:
    # Explainable 0-100 score: hawker presence, hawkers per resident, and
    # transport point counts inside the boundary. Missing transport data is
    # skipped, so hawker-only scoring still works.
    return weighted_score(
        [
            (normalize_score(props.get("hawker_centres_inside"), 4), 30),
            (normalize_score(props.get("hawker_per_100k_residents"), 20), 20),
            (normalize_score(props.get("bus_stops_within_500m_boundary"), 20), 25),
            (normalize_score(props.get("mrt_lrt_stations_within_800m_boundary"), 3), 25),
        ]
    )


def calculate_access_gap_score(props: dict[str, Any], max_density: float) -> float | None:
    # High gap = dense + older + weak amenity access. Density is normalized by
    # the densest selected geography; elderly share is capped at 35%.
    density_component = normalize_score(props.get("density_per_km2"), max_density)
    elderly_component = normalize_score(props.get("elderly_share"), 35)
    amenity = props.get("amenity_score")
    amenity_gap_component = None if amenity is None else 1 - max(0, min(amenity / 100, 1))
    return weighted_score(
        [
            (density_component, 40),
            (elderly_component, 30),
            (amenity_gap_component, 30),
        ]
    )


def read_subzones() -> tuple[dict[str, Any], str, str, str]:
    geojson = read_geojson(SUBZONE_GEOJSON)
    first_props = geojson["features"][0]["properties"]
    subzone_prop = detect_property(first_props, GEOJSON_MAPPING["subzone"])
    planning_prop = detect_property(first_props, GEOJSON_MAPPING["planning_area"])
    region_prop = detect_property(first_props, GEOJSON_MAPPING["region"])
    print(
        "\nSubzone GeoJSON properties detected: "
        f"subzone={subzone_prop}, planning_area={planning_prop}, region={region_prop}"
    )
    return geojson, subzone_prop, planning_prop, region_prop


def prepare_subzone_gdf(geojson: dict[str, Any], subzone_prop: str, planning_prop: str):
    subzones_gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs=WGS84)
    subzones_gdf["atlas_join_key"] = subzones_gdf.apply(
        lambda row: f"{normalize_name(row[planning_prop])} / {normalize_name(row[subzone_prop])}",
        axis=1,
    )
    return subzones_gdf


def enrich_subzone_geojson() -> tuple[dict[str, Any], Any | None, dict[str, float | None]]:
    geojson, subzone_prop, planning_prop, region_prop = read_subzones()
    age = load_age_population()
    ethnic = load_ethnic_population()
    age_lookup = {(row["planning_area_key"], row["subzone_key"]): row.to_dict() for _, row in age.iterrows()}
    ethnic_lookup = {(row["planning_area_key"], row["subzone_key"]): row.to_dict() for _, row in ethnic.iterrows()}

    subzones_gdf = None
    land_use_lookup = {}
    hawker_lookup = {}
    transport_lookup = {}
    if gpd is not None:
        subzones_gdf = prepare_subzone_gdf(geojson, subzone_prop, planning_prop)
        land_use_lookup = calculate_land_use_shares(subzones_gdf, "atlas_join_key")
        placeholder_population = {key: None for key in subzones_gdf["atlas_join_key"].tolist()}
        transport_lookup = calculate_onemap_boundary_transport(subzones_gdf, "atlas_join_key", "subzone")
        hawker_lookup = calculate_hawker_counts(subzones_gdf, "atlas_join_key", placeholder_population)
    else:
        print("GeoPandas missing; spatial land-use and amenity metrics will be null.")

    age_matched = 0
    ethnic_matched = 0
    age_unmatched = []
    ethnic_unmatched = []
    max_density = 0.0
    population_by_join_key: dict[str, float | None] = {}

    for index, feature in enumerate(geojson["features"]):
        props = feature.setdefault("properties", {})
        planning_area = props.get(planning_prop)
        subzone = props.get(subzone_prop)
        region = props.get(region_prop)
        key = (normalize_name(planning_area), normalize_name(subzone))
        join_key = f"{key[0]} / {key[1]}"

        atlas_id = f"subzone-{props.get('OBJECTID') or props.get('SUBZONE_C') or index}"
        feature["id"] = atlas_id
        props.update(
            {
                "atlas_id": atlas_id,
                "subzone": subzone,
                "subzone_name": subzone,
                "planning_area": planning_area,
                "region": region,
                "geography_mode": "subzone",
                "has_data": False,
            }
        )

        raw_area = props.get("SHAPE.AREA") or props.get("Shape_Area") or props.get("shape_area")
        area_km2 = number_or_none(float(raw_area) / 1_000_000, 4) if raw_area else None
        props["area_km2"] = area_km2

        age_row = age_lookup.get(key)
        if age_row:
            age_matched += 1
            props["has_data"] = True
            for field in [
                "total_population",
                "youth_0_14",
                "youth_share",
                "working_age_15_64",
                "working_age_share",
                "elderly_65_plus",
                "elderly_share",
                "male_population",
                "female_population",
                "age_breakdown",
            ]:
                props[field] = age_row.get(field)
            density = safe_divide(props.get("total_population"), area_km2)
            props["density_per_km2"] = number_or_none(density, 0)
            if props["density_per_km2"]:
                max_density = max(max_density, float(props["density_per_km2"]))
        else:
            age_unmatched.append(join_key)
            for field in [
                "total_population",
                "density_per_km2",
                "youth_0_14",
                "youth_share",
                "working_age_15_64",
                "working_age_share",
                "elderly_65_plus",
                "elderly_share",
                "male_population",
                "female_population",
            ]:
                props[field] = None
            props["age_breakdown"] = []

        ethnic_row = ethnic_lookup.get(key)
        if ethnic_row:
            ethnic_matched += 1
            for field in [
                "chinese_population",
                "malay_population",
                "indian_population",
                "others_population",
                "chinese_share",
                "malay_share",
                "indian_share",
                "others_share",
                "ethnic_diversity_index",
            ]:
                props[field] = ethnic_row.get(field)
        else:
            ethnic_unmatched.append(join_key)
            for field in [
                "chinese_population",
                "malay_population",
                "indian_population",
                "others_population",
                "chinese_share",
                "malay_share",
                "indian_share",
                "others_share",
                "ethnic_diversity_index",
            ]:
                props[field] = None

        for field, value in land_use_lookup.get(join_key, {}).items():
            props[field] = value
        for field in LAND_USE_FIELDS:
            props.setdefault(field, None)

        for lookup in [hawker_lookup, transport_lookup]:
            for field, value in lookup.get(join_key, {}).items():
                props[field] = value
        props.setdefault("hawker_centres_inside", None)
        props.setdefault("hawker_per_100k_residents", None)
        props.setdefault("bus_stops_within_500m_boundary", None)
        props.setdefault("mrt_lrt_stations_within_800m_boundary", None)
        props.setdefault("mrt_stations_inside", None)
        props.setdefault("bus_stops_inside", None)

        population_by_join_key[join_key] = props.get("total_population")

    # Hawker per-capita needs population, so calculate after age data is joined.
    if subzones_gdf is not None and HAWKER_GEOJSON.exists():
        hawker_lookup = calculate_hawker_counts(subzones_gdf, "atlas_join_key", population_by_join_key)
        for feature in geojson["features"]:
            props = feature["properties"]
            join_key = f"{normalize_name(props.get('planning_area'))} / {normalize_name(props.get('subzone_name'))}"
            for field, value in hawker_lookup.get(join_key, {}).items():
                props[field] = value

    for feature in geojson["features"]:
        props = feature["properties"]
        props["transport_score"] = calculate_transport_score(props)
        props["amenity_score"] = calculate_amenity_score(props)
    for feature in geojson["features"]:
        props = feature["properties"]
        props["access_gap_score"] = calculate_access_gap_score(props, max_density)

    total = len(geojson["features"])
    print_join_report("Age/sex population", total, age_matched, age_unmatched)
    print_join_report("Ethnic group/sex population", total, ethnic_matched, ethnic_unmatched)
    if gpd is not None:
        subzones_gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs=WGS84)
        subzones_gdf["atlas_join_key"] = subzones_gdf.apply(
            lambda row: f"{normalize_name(row['planning_area'])} / {normalize_name(row['subzone_name'])}",
            axis=1,
        )
    return geojson, subzones_gdf, population_by_join_key


def area_weighted_aggregate(subzones_gdf, electoral_gdf) -> dict[str, dict[str, Any]]:
    if subzones_gdf is None or gpd is None:
        return {}
    print("\nAggregating subzones into electoral divisions by area-weighted overlay...")
    subzones = subzones_gdf.to_crs(SVY21).copy()
    electoral = electoral_gdf.to_crs(SVY21).copy()
    subzones["subzone_area"] = subzones.geometry.area
    overlays = gpd.overlay(
        electoral[["electoral_id", "geometry"]],
        subzones[[
            "atlas_join_key",
            "subzone_area",
            "total_population",
            "density_per_km2",
            "youth_0_14",
            "working_age_15_64",
            "elderly_65_plus",
            "chinese_population",
            "malay_population",
            "indian_population",
            "others_population",
            *LAND_USE_FIELDS,
            "geometry",
        ]],
        how="intersection",
        keep_geom_type=False,
    )
    if overlays.empty:
        return {}
    overlays["overlap_area"] = overlays.geometry.area
    overlays["overlap_ratio"] = overlays.apply(
        lambda row: safe_divide(row["overlap_area"], row["subzone_area"]) or 0,
        axis=1,
    )

    result: dict[str, dict[str, Any]] = {}
    for electoral_id, group in overlays.groupby("electoral_id"):
        total_population = float((group["total_population"].fillna(0) * group["overlap_ratio"]).sum())
        youth = float((group["youth_0_14"].fillna(0) * group["overlap_ratio"]).sum())
        working = float((group["working_age_15_64"].fillna(0) * group["overlap_ratio"]).sum())
        elderly = float((group["elderly_65_plus"].fillna(0) * group["overlap_ratio"]).sum())
        chinese = float((group["chinese_population"].fillna(0) * group["overlap_ratio"]).sum())
        malay = float((group["malay_population"].fillna(0) * group["overlap_ratio"]).sum())
        indian = float((group["indian_population"].fillna(0) * group["overlap_ratio"]).sum())
        others = float((group["others_population"].fillna(0) * group["overlap_ratio"]).sum())
        area_km2 = float(electoral.loc[electoral["electoral_id"] == electoral_id].geometry.iloc[0].area / 1_000_000)
        shares_decimal = [(value / total_population) if total_population else 0 for value in [chinese, malay, indian, others]]
        diversity = 1 - sum(value * value for value in shares_decimal) if total_population else None
        land_values = {}
        for field in LAND_USE_FIELDS:
            valid = group[[field, "overlap_area"]].dropna()
            land_values[field] = (
                round(float((valid[field] * valid["overlap_area"]).sum() / valid["overlap_area"].sum()), 2)
                if not valid.empty and valid["overlap_area"].sum() > 0
                else None
            )
        result[electoral_id] = {
            "total_population": round(total_population),
            "total_population_estimated": round(total_population),
            "area_km2": round(area_km2, 4),
            "density_per_km2": number_or_none(safe_divide(total_population, area_km2), 0),
            "density_per_km2_estimated": number_or_none(safe_divide(total_population, area_km2), 0),
            "youth_0_14": round(youth),
            "working_age_15_64": round(working),
            "elderly_65_plus": round(elderly),
            "youth_share": calculate_share(youth, total_population),
            "youth_share_estimated": calculate_share(youth, total_population),
            "working_age_share": calculate_share(working, total_population),
            "working_age_share_estimated": calculate_share(working, total_population),
            "elderly_share": calculate_share(elderly, total_population),
            "elderly_share_estimated": calculate_share(elderly, total_population),
            "chinese_population": round(chinese),
            "malay_population": round(malay),
            "indian_population": round(indian),
            "others_population": round(others),
            "chinese_share": calculate_share(chinese, total_population),
            "chinese_share_estimated": calculate_share(chinese, total_population),
            "malay_share": calculate_share(malay, total_population),
            "malay_share_estimated": calculate_share(malay, total_population),
            "indian_share": calculate_share(indian, total_population),
            "indian_share_estimated": calculate_share(indian, total_population),
            "others_share": calculate_share(others, total_population),
            "others_share_estimated": calculate_share(others, total_population),
            "ethnic_diversity_index": round(diversity, 4) if diversity is not None else None,
            "ethnic_diversity_index_estimated": round(diversity, 4) if diversity is not None else None,
            "residential_land_share": land_values.get("residential_land_share"),
            "residential_land_share_estimated": land_values.get("residential_land_share"),
            "park_open_space_share": land_values.get("park_open_space_share"),
            "park_open_space_share_estimated": land_values.get("park_open_space_share"),
            **land_values,
        }
    return result


def build_electoral_geojson(subzones_gdf) -> dict[str, Any]:
    if not ELECTORAL_GEOJSON.exists():
        print("\nWarning: electoral-boundary-2025.geojson missing; writing empty GRC/SMC output.")
        return empty_feature_collection()
    if gpd is None:
        print("GeoPandas missing; writing empty GRC/SMC output.")
        return empty_feature_collection()

    electoral_json = read_geojson(ELECTORAL_GEOJSON)
    electoral_gdf = gpd.GeoDataFrame.from_features(electoral_json["features"], crs=WGS84)
    first = electoral_gdf.iloc[0].to_dict()
    print("\nElectoral boundary columns detected:")
    print(", ".join(map(str, electoral_gdf.columns)))
    name_col = detect_property(first, ELECTORAL_COLUMN_MAPPING["name"], required=False)
    full_name_col = detect_property(first, ["ED_DESC_FU", "FULL_NAME", "ELECTORAL_FULL_NAME"], required=False)
    type_col = detect_property(first, ELECTORAL_COLUMN_MAPPING["type"], required=False)
    if not name_col:
        non_geom_cols = [column for column in electoral_gdf.columns if column != "geometry"]
        name_col = non_geom_cols[0] if non_geom_cols else None
    electoral_gdf["electoral_name"] = (
        electoral_gdf[full_name_col].map(str)
        if full_name_col
        else electoral_gdf[name_col].map(str) if name_col else "Electoral division"
    )
    electoral_gdf["electoral_type"] = (
        electoral_gdf[type_col].map(str)
        if type_col
        else electoral_gdf["electoral_name"].map(lambda name: "SMC" if "SMC" in name.upper() else "GRC")
    )
    electoral_gdf["electoral_id"] = electoral_gdf.index.map(lambda index: f"electoral-{index}")

    aggregates = area_weighted_aggregate(subzones_gdf, electoral_gdf)
    population_lookup = {key: values.get("total_population") for key, values in aggregates.items()}
    electoral_land_lookup = calculate_land_use_shares(electoral_gdf, "electoral_id")
    hawker_lookup = calculate_hawker_counts(electoral_gdf, "electoral_id", population_lookup)
    transport_lookup = calculate_onemap_boundary_transport(electoral_gdf, "electoral_id", "electoral")

    max_density = max((values.get("density_per_km2") or 0 for values in aggregates.values()), default=0)
    features = []
    for _, row in electoral_gdf.to_crs(WGS84).iterrows():
        electoral_id = row["electoral_id"]
        props = {key: sanitize_json(value) for key, value in row.drop(labels=["geometry"]).to_dict().items()}
        props.update(
            {
                "atlas_id": electoral_id,
                "geography_mode": "electoral",
                "has_data": electoral_id in aggregates,
                "is_estimated": True,
            }
        )
        props.update(aggregates.get(electoral_id, {}))
        for field, value in electoral_land_lookup.get(electoral_id, {}).items():
            props[field] = value
            if field in {"residential_land_share", "park_open_space_share"}:
                props[f"{field}_estimated"] = value
        for lookup in [hawker_lookup, transport_lookup]:
            for field, value in lookup.get(electoral_id, {}).items():
                props[field] = value
        props.setdefault("hawker_centres_inside", None)
        props.setdefault("hawker_per_100k_residents", None)
        props.setdefault("bus_stops_within_500m_boundary", None)
        props.setdefault("mrt_lrt_stations_within_800m_boundary", None)
        props.setdefault("mrt_stations_inside", None)
        props.setdefault("bus_stops_inside", None)
        props["transport_score"] = calculate_transport_score(props)
        props["amenity_score"] = calculate_amenity_score(props)
        props["access_gap_score"] = calculate_access_gap_score(props, max_density)
        props["access_gap_score_estimated"] = props["access_gap_score"]
        feature = {
            "type": "Feature",
            "id": electoral_id,
            "properties": props,
            "geometry": json.loads(gpd.GeoSeries([row.geometry], crs=WGS84).to_json())["features"][0]["geometry"],
        }
        features.append(feature)
    return {"type": "FeatureCollection", "features": features}


def count_features_with(features: list[dict[str, Any]], field: str) -> int:
    return sum(
        1 for feature in features
        if feature.get("properties", {}).get(field) is not None
    )


def count_features_with_any(features: list[dict[str, Any]], fields: list[str]) -> int:
    return sum(
        1 for feature in features
        if any(feature.get("properties", {}).get(field) is not None for field in fields)
    )


def print_validation_summary(subzone_geojson: dict[str, Any], electoral_geojson: dict[str, Any]) -> None:
    subzone_features = subzone_geojson.get("features", [])
    electoral_features = electoral_geojson.get("features", [])
    print("\nValidation summary:")
    print(f"Subzone features written: {len(subzone_features)}")
    print(f"Electoral features written: {len(electoral_features)}")
    print(f"Subzones with population data: {count_features_with(subzone_features, 'total_population')}/{len(subzone_features)}")
    print(f"Subzones with land-use data: {count_features_with_any(subzone_features, LAND_USE_FIELDS)}/{len(subzone_features)}")
    print(f"Subzones with bus data: {count_features_with(subzone_features, 'bus_stops_within_500m_boundary')}/{len(subzone_features)}")
    print(f"Subzones with MRT/LRT data: {count_features_with(subzone_features, 'mrt_lrt_stations_within_800m_boundary')}/{len(subzone_features)}")
    print(f"Electoral divisions with data: {count_features_with(electoral_features, 'total_population')}/{len(electoral_features)}")
    print(f"Electoral divisions with land-use data: {count_features_with_any(electoral_features, LAND_USE_FIELDS)}/{len(electoral_features)}")
    print(f"Electoral divisions with bus data: {count_features_with(electoral_features, 'bus_stops_within_500m_boundary')}/{len(electoral_features)}")
    print(f"Electoral divisions with MRT/LRT data: {count_features_with(electoral_features, 'mrt_lrt_stations_within_800m_boundary')}/{len(electoral_features)}")


def main() -> None:
    load_dotenv_local()
    required = [SUBZONE_GEOJSON, AGE_SEX_CSV, ETHNIC_SEX_CSV, LAND_USE_GEOJSON, HAWKER_GEOJSON]
    missing = [path for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required files:\n" + "\n".join(str(path) for path in missing))

    subzone_geojson, subzones_gdf, _ = enrich_subzone_geojson()
    electoral_geojson = build_electoral_geojson(subzones_gdf)

    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    outputs = [
        (OUTPUT_SUBZONE, sanitize_json(subzone_geojson)),
        (OUTPUT_LEGACY, sanitize_json(subzone_geojson)),
        (OUTPUT_ELECTORAL, sanitize_json(electoral_geojson)),
    ]
    for output_path, payload in outputs:
        with output_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        print(f"Wrote {output_path.relative_to(ROOT)}")
    print_validation_summary(outputs[0][1], outputs[2][1])


if __name__ == "__main__":
    main()
