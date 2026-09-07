# TXDRMAP Scenario Engine Data Roadmap

This roadmap defines the next four enterprise-grade scenario layers.

## 1. Real county boundary polygons

Goal: replace centroid-only approximations with county polygon overlays.

Recommended sources:
- U.S. Census TIGER/Line county GeoJSON or shapefile converted to GeoJSON
- Texas GIS county boundary datasets

Repo target:
- `public/data/geo/texas_counties.geojson`

Implementation:
- Load GeoJSON in Scenario Mode
- Match county `NAME` or `NAMELSAD` to scenario county names
- Shade polygons by selected impact metric
- Keep centroid markers as labels / fallback only

## 2. ERCOT subgrid vulnerability overlays

Goal: add power-region risk intelligence.

Recommended sources:
- ERCOT load zone / weather zone maps
- ERCOT public grid condition feeds
- EIA power plant and transmission/substation data where available

Repo targets:
- `public/data/ercot/ercot_zones.geojson`
- `public/data/ercot/ercot_zone_vulnerability.json`

Implementation:
- Overlay ERCOT zones below county polygons
- Join counties to ERCOT zone
- Calculate zone-level stress from county outage demand
- Show grid vulnerability score and affected load zone

## 3. FEMA / HIFLD hospital, fire, police datasets

Goal: replace modeled public-safety capacity with public infrastructure data.

Recommended sources:
- FEMA / HIFLD hospitals
- FEMA / HIFLD fire stations
- FEMA / HIFLD law enforcement locations
- FEMA / HIFLD EMS where available
- Texas DSHS hospital and EMS data where available

Repo targets:
- `public/data/resources/hospitals_tx.geojson`
- `public/data/resources/fire_stations_tx.geojson`
- `public/data/resources/police_stations_tx.geojson`
- `public/data/texas_county_resources.json`

Implementation:
- Aggregate resource points by county polygon
- Count hospitals, fire stations, police stations, EMS stations
- Estimate capacity by county
- Feed the existing county impact resolver

## 4. Economic loss engine

Goal: calculate residential, commercial, insurance, and recovery-cost estimates.

Recommended sources:
- U.S. Census ACS housing units and population
- Census County Business Patterns for commercial/business counts
- FEMA National Risk Index for building value and expected annual loss
- NOAA disaster event history for calibration

Repo targets:
- `src/lib/scenario/economicLossEngine.js`
- `public/data/economic/texas_county_economic_baseline.json`

Loss categories:
- Residential structure loss
- Commercial disruption loss
- Insurance exposure estimate
- Recovery labor/material/logistics cost

Implementation:
- Use hazard, wind, flood/rain, outage duration, and county economic baseline
- Generate total loss and category-level loss
- Display loss breakdown in Scenario Mode

## Recommended build order

1. Add lightweight county boundary loader and polygon heatmap support.
2. Add economic loss engine using current county baseline fields.
3. Add HIFLD/FEMA ingestion scripts and normalized resource rollups.
4. Add ERCOT overlay and grid vulnerability scoring.

This keeps the user experience improving quickly while deeper datasets are added behind the scenes.
