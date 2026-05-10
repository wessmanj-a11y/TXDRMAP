# TXDRMAP Next Build Steps

## Current milestone

Scenario Mode now supports real county polygon loading, polygon heatmap rendering, fallback centroid markers, storm path modeling, operational resource stress scoring, and a more professional UI.

## Recommended next step: ERCOT subgrid vulnerability overlays

### Goal
Show power-grid vulnerability beneath county impact layers so Scenario Mode can answer:

- Which ERCOT zone is affected?
- Which county impacts roll up into the highest grid stress?
- Where should restoration or staging priority be highest?

### Files to add next

- `public/data/ercot/ercot_zone_vulnerability.json`
- `public/js/ercot-grid-overlay.js`
- optional later: `public/data/ercot/ercot_zones.geojson`

### First implementation
Use county-to-ERCOT-zone rollups first, then replace with real ERCOT polygons later.

The first version should calculate:

- zone outage stress
- zone county count impacted
- zone max hazard
- zone average outage
- zone restoration priority

## Following steps

1. ERCOT vulnerability overlay
2. FEMA / HIFLD resource ingestion scripts
3. Economic loss UI integration
4. Scenario export report
5. Real polygon data optimization and label polish
