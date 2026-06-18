# SG Population Atlas

SG Population Atlas is a map-first Singapore civic-data visualizer built with Next.js, React, Tailwind CSS, MapLibre GL JS, and Recharts.

The app loads static GeoJSON from `public/data` only. Preprocessing enriches URA Master Plan 2019 subzones with Census 2020 population, ethnic group, land-use, hawker-centre, optional OneMap transport, and optional GE2025 GRC/SMC boundary estimates.

## Required Datasets

Place these files in `data/raw/`:

```text
data/raw/master-plan-2019-subzone.geojson
data/raw/resident-population-age-sex-2020.csv
data/raw/resident-population-ethnic-sex-2020.csv
data/raw/master-plan-2019-land-use.geojson
data/raw/hawker-centres.geojson
data/raw/electoral-boundary-2025.geojson
```

The app still runs if `electoral-boundary-2025.geojson` is missing, but GRC/SMC mode will show an empty-state message until that file is added and preprocessing is rerun.

## Optional Transport Files

```text
data/raw/mrt-stations.geojson
data/raw/bus-stops.geojson
```

If these are absent, the script can try OneMap during preprocessing. If neither local files nor OneMap data are available, MRT/bus fields are written as `null` and the UI shows “No transport data.”

## Install

```bash
npm install
```

## Python Setup

```bash
pip install pandas geopandas shapely requests
```

GeoPandas and Shapely are needed for point-in-polygon amenity counts, land-use overlay, and GRC/SMC area-weighted aggregation.

## OneMap Transport Fetch

OneMap is not called by the frontend. To fetch MRT/LRT and bus-stop point data during preprocessing, set a token:

```bash
export ONEMAP_TOKEN="your-token"
```

The script uses OneMap theme retrieval and caches successful responses to:

```text
data/cache/onemap-mrt-stations.geojson
data/cache/onemap-bus-stops.geojson
```

If OneMap theme query names differ, override them:

```bash
export ONEMAP_MRT_THEME="mrt_stations"
export ONEMAP_BUS_THEME="bus_stops"
```

Local `data/raw/mrt-stations.geojson` and `data/raw/bus-stops.geojson` take priority over cache and OneMap.

## Preprocess Data

```bash
python scripts/process_population.py
```

The script:

- prints loaded files, detected CSV columns, and detected GeoJSON properties
- normalizes join keys with uppercase, trimming, and repeated-space collapse
- joins age/sex and ethnic group/sex Census data by planning area + subzone
- calculates population density, age shares, ethnic group shares, and ethnic diversity index
- calculates land-use composition with polygon intersections
- counts hawker centres inside each subzone/GRC polygon
- counts MRT stations and bus stops inside each polygon when OneMap/local transport data exists
- estimates GRC/SMC metrics by area-weighted overlay of 2020 census subzones onto 2025 electoral boundaries
- writes missing values as `null`
- exports:

```text
public/data/sg-subzone-enriched.geojson
public/data/sg-electoral-2025-enriched.geojson
public/data/sg-subzone-population.geojson
```

`sg-subzone-population.geojson` is kept as a compatibility copy.

## Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Frontend Features

- Subzone and GRC/SMC mode dropdown
- Metric category and metric dropdowns
- Dynamic choropleth legend with “No data”
- Hidden inspection panel until an area is selected
- Subzone inspector with population, age structure, sex split, ethnic group profile, land-use, and amenities
- GRC/SMC inspector with estimated metrics and an area-weighted overlay disclaimer
- Floating compare mode with two slots and compact comparison drawer
- Thicker boundaries, stronger hover/selected outlines, planning area labels, high-zoom subzone labels, prominent GRC/SMC labels, and subtle landmark labels

## Deploy To Vercel

1. Push the repository to GitHub.
2. Import it in Vercel.
3. If this app is inside a larger repo, set the Vercel project root to `sg-pop-density`.
4. Build with:

```bash
npm run build
```

5. Commit the generated files in `public/data` or run preprocessing before deployment.

## Notes

- No backend is required for v1.
- The map uses MapLibre GL JS with CARTO dark raster tiles, so no Mapbox token is needed.
- GRC/SMC values are approximate because URA subzones and electoral boundaries are different systems.
- “Ethnic group” follows official census wording.
- Missing values render as “No data”.
