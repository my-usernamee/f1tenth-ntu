# SG Population Atlas

SG Population Atlas is a polished, map-first Singapore population density visualizer built with Next.js, React, Tailwind CSS, MapLibre GL JS, and Recharts.

It enriches Master Plan 2019 subzone boundaries with Census 2020 resident population data, then serves the final GeoJSON statically from `public/data`.

## Project Structure

```text
sg-pop-density/
├── data/raw/
│   ├── resident-population-census-2020.csv
│   └── master-plan-2019-subzone.geojson
├── public/data/
│   └── sg-subzone-population.geojson
├── scripts/
│   └── process_population.py
├── src/
│   ├── app/
│   │   ├── page.jsx
│   │   └── globals.css
│   ├── components/
│   │   ├── MapView.jsx
│   │   ├── Sidebar.jsx
│   │   ├── Legend.jsx
│   │   ├── MetricToggle.jsx
│   │   └── TopBar.jsx
│   └── lib/
│       ├── colorScale.js
│       └── formatters.js
```

## Install

```bash
npm install
```

## Raw Data

Place the datasets here:

```text
data/raw/resident-population-census-2020.csv
data/raw/master-plan-2019-subzone.geojson
```

The current workspace already includes copies from:

```text
/Users/hari/Downloads/ResidentPopulationbyPlanningAreaSubzoneofResidenceAgeGroupandSexCensusofPopulation2020.csv
/Users/hari/Downloads/MasterPlan2019SubzoneBoundaryNoSeaGEOJSON.geojson
```

## Python Setup

```bash
pip install pandas geopandas
```

GeoPandas is optional for the included Master Plan file because it already contains `SHAPE.AREA`. If another boundary file lacks area properties, the script can use GeoPandas to calculate area in EPSG:3414.

## Preprocess Data

```bash
python scripts/process_population.py
```

The script:

- inspects CSV headers before mapping columns
- normalizes join keys with uppercase, trimming, and repeated-space removal
- joins by planning area and subzone
- calculates population totals, area, density, youth, working-age, elderly, and elderly-share metrics
- prints join success rate
- prints unmatched GeoJSON subzones and unused Census rows
- writes `public/data/sg-subzone-population.geojson`

If your CSV column names differ, adjust the commented column mapping block in `scripts/process_population.py`.

## Run Locally

```bash
npm run dev
```

Open the local URL shown by Next.js, usually:

```text
http://localhost:3000
```

## Deploy To Vercel

1. Push this project to GitHub.
2. Import the repository in Vercel.
3. Set the project root to `sg-pop-density` if this folder lives inside a larger repo.
4. Use the default Next.js build command:

```bash
npm run build
```

5. Ensure `public/data/sg-subzone-population.geojson` is committed or generated before deployment.

## Notes

- No backend is required for v1.
- The map uses MapLibre GL JS with CARTO dark raster tiles, so no Mapbox token is needed.
- Missing population data renders grey and appears as “No data” in tooltips and the sidebar.
