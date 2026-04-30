# TXDRMAP Migration Plan

## Current findings
- DRMAP has two overlapping workflows (`fetch-outages.yml` and `fetch-outages-v2.yml`), which creates maintenance drift.
- Legacy workflow still references older ML paths.
- TXDRMAP should use ONE clean pipeline only.

## Recommended migration order
1. Copy `scripts/fetch-outages.js`
2. Copy `scripts/fetch-county-weather-forecast.js`
3. Copy `scripts/apply-county-weather-forecast.js`
4. Copy `scripts/train-ml-risk.py`
5. Copy `scripts/apply-ml-risk-v2.py`
6. Add `requirements.txt`
7. Add ONE workflow only

## Critical rule
Do NOT migrate old `apply-ml-risk.py` or duplicate workflows.

## Goal state
TXDRMAP becomes the clean production repo with:
- outages.json
- outage-history.json
- county-weather-forecast.json
- ml-risk-model.joblib
- ml-risk-metadata.json
