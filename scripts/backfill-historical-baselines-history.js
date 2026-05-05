const fs = require('fs/promises');

const HISTORY_FILE = 'history/outage-history.json';
const BASELINES_FILE = 'history/historical-county-baselines.json';

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function keyCounty(name) {
  return String(name || '').replace(/ County$/i, '').trim().toLowerCase();
}

function round(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function safeRatio(numerator, denominator) {
  const den = num(denominator);
  if (den <= 0) return 0;
  return round(num(numerator) / den, 4);
}

function anomalyScore(percentOut, monthlyP95, annualP95, annualP99) {
  const pct = num(percentOut);
  const p95 = Math.max(num(monthlyP95), num(annualP95));
  const p99 = num(annualP99);

  if (pct <= 0) return 0;
  if (p99 > 0 && pct >= p99) return 100;
  if (p95 > 0 && pct >= p95) return Math.min(95, Math.round(75 + ((pct - p95) / Math.max(p95, 0.0001)) * 10));
  if (p95 > 0) return Math.round(Math.min(74, (pct / p95) * 74));
  return Math.min(60, Math.round(Math.sqrt(pct) * 20));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function enrichCounty(row, baselines, snapshotMonth) {
  const baseline = baselines.counties?.[keyCounty(row.county)];

  if (!baseline) {
    row.historicalAvgPercentOut = 0;
    row.historicalP95PercentOut = 0;
    row.historicalP99PercentOut = 0;
    row.historicalMonthlyAvgPercentOut = 0;
    row.historicalMonthlyP95PercentOut = 0;
    row.historicalOutageVolatilityScore = 0;
    row.outageVsHistoricalAvg = 0;
    row.outageVsHistoricalP95 = 0;
    row.outageVsHistoricalMonthlyP95 = 0;
    row.historicalAnomalyScore = 0;
    return false;
  }

  const monthKey = String(snapshotMonth).padStart(2, '0');
  const monthly = baseline.monthly?.[monthKey] || {};
  const percentOut = num(row.percentCustomersOut);

  const avg = num(baseline.avgPercentOut);
  const p95 = num(baseline.p95PercentOut);
  const p99 = num(baseline.p99PercentOut);
  const monthlyAvg = num(monthly.avgPercentOut);
  const monthlyP95 = num(monthly.p95PercentOut);

  row.historicalAvgPercentOut = avg;
  row.historicalP95PercentOut = p95;
  row.historicalP99PercentOut = p99;
  row.historicalMonthlyAvgPercentOut = monthlyAvg;
  row.historicalMonthlyP95PercentOut = monthlyP95;
  row.historicalOutageVolatilityScore = num(baseline.outageVolatilityScore);
  row.outageVsHistoricalAvg = safeRatio(percentOut, avg);
  row.outageVsHistoricalP95 = safeRatio(percentOut, p95);
  row.outageVsHistoricalMonthlyP95 = safeRatio(percentOut, monthlyP95 || p95);
  row.historicalAnomalyScore = anomalyScore(percentOut, monthlyP95, p95, p99);

  return true;
}

async function main() {
  const history = await readJson(HISTORY_FILE, { snapshots: [] });
  const baselines = await readJson(BASELINES_FILE, null);

  if (!Array.isArray(history.snapshots)) {
    console.error('history/outage-history.json does not contain snapshots');
    process.exit(1);
  }

  if (!baselines || !baselines.counties) {
    console.error('history/historical-county-baselines.json missing or invalid');
    process.exit(1);
  }

  let totalCountyRows = 0;
  let matchedCountyRows = 0;
  let snapshotsTouched = 0;

  for (const snapshot of history.snapshots) {
    const timestamp = snapshot.timestamp || snapshot.updated || new Date().toISOString();
    const month = new Date(timestamp).getUTCMonth() + 1;
    let touchedThisSnapshot = false;

    for (const county of snapshot.counties || []) {
      totalCountyRows += 1;
      const matched = enrichCounty(county, baselines, month);
      if (matched) matchedCountyRows += 1;
      touchedThisSnapshot = true;
    }

    if (touchedThisSnapshot) snapshotsTouched += 1;
  }

  history.updated = new Date().toISOString();
  history.historicalBaselineBackfill = {
    ok: true,
    updated: new Date().toISOString(),
    snapshotsTouched,
    totalCountyRows,
    matchedCountyRows,
    sourceUpdated: baselines.updated,
    sourceRows: baselines.totalRows,
    sourceCountyCount: baselines.countyCount,
    fields: [
      'historicalAvgPercentOut',
      'historicalP95PercentOut',
      'historicalP99PercentOut',
      'historicalMonthlyAvgPercentOut',
      'historicalMonthlyP95PercentOut',
      'historicalOutageVolatilityScore',
      'outageVsHistoricalAvg',
      'outageVsHistoricalP95',
      'outageVsHistoricalMonthlyP95',
      'historicalAnomalyScore'
    ]
  };

  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

  console.log(`Backfilled historical baselines across ${snapshotsTouched} snapshots`);
  console.log(`Matched ${matchedCountyRows}/${totalCountyRows} county rows`);
}

main().catch(error => {
  console.error('Historical baseline history backfill failed:', error);
  process.exitCode = 1;
});
