# PowerOutage Historical Data

This folder is for historical PowerOutage-style Texas outage archives.

## Recommended layout

```text
 data/poweroutage-history/
   raw/
     TX_Outag17.csv
     TX_Outag18.csv
     TX_Outag19.csv
     TX_Outag20.csv
     TX_Outag21.csv
     TX_Outag22.csv
   normalized/
     tx_poweroutage_2017_normalized.csv
     tx_poweroutage_2018_normalized.csv
     ...
```

## Important

Do not commit the fully extracted 450MB historical archive unless absolutely necessary.

Preferred workflow:

1. Store the raw historical CSV files zipped or upload one year at a time.
2. Run `scripts/normalize-poweroutage-history.js`.
3. Commit only the compact normalized outputs or later-derived baseline files.

The next phase after normalization is to generate county historical baseline features such as p50, p90, p95, average outage percent, outage volatility, and seasonal norms.
