# TXDRMAP Migration Plan

## Current findings
- DRMAP has overlapping workflows and maintenance drift.
- TXDRMAP is being rebuilt as modular production architecture.
- Core outage fetch has been rebuilt first.

## Phase 1 complete
- requirements.txt
- fetch-outages.js
- fetch-county-weather-forecast.js scaffold
- apply-county-weather-forecast.js scaffold
- ml_train.py scaffold

## Phase 2 now underway
### Priority:
1. Replace forecast scaffold with full county forecast engine
2. Add historical dataset builder
3. Add ML metadata + scoring engine
4. Add single production workflow
5. Validate outages.json schema compatibility with dashboard

## Architecture direction
### Modular target:
- scripts/fetch-outages.js
- scripts/fetch-county-weather-forecast.js
- scripts/apply-county-weather-forecast.js
- scripts/build-training-data.js
- scripts/train-ml-risk.py
- scripts/apply-ml-risk-v2.py

## Critical rule
No duplicate workflows.
No legacy DRMAP v1 scripts.
No giant monolithic pipeline.

## Goal state
TXDRMAP becomes clean production repo with:
- outages.json
- outage-history.json
- county-weather-forecast.json
- training-data.json
- ml-risk-model.joblib
- ml-risk-metadata.json
