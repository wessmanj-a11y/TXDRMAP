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

function historicalPercentileRank(percentOut, avg, p95, p99) {
  const pct = num(percentOut);
  const a = num(avg);
  const high = num(p95);
  const extreme = num(p99);

  if (pct <= 0) return 0;
  if (extreme > 0 && pct >= extreme) return 99;
  if (high > 0 && pct >= high) return Math.min(98, round(95 + ((pct - high) / Math.max(extreme - high, 0.0001)) * 4, 2));
  if (high > 0) return Math.min(94, round((pct / high) * 95, 2));
  if (a > 0) return Math.min(80, round((pct / a) * 50, 2));
  return Math.min(75, round(Math.sqrt(pct) * 25, 2));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function applyZeroHistoricalFields(row) {
  row.historicalAvgPercentOut = 0;
  row.historicalP95PercentOut = 0;
  row.historicalP99PercentOut = 0;
  row.historicalMonthlyAvgPercentOut = 0;
  row.historicalMonthlyP95PercentOut = 0;
  row.historicalOutageVolatilityScore = 0;
  row.outageVsHistoricalAvg = 0;
  row.outageVsHistoricalP95 = 0;
  row.outageVsHistoricalP99 = 0;
  row.outageVsHistoricalMonthlyP95 = 0;
  row.percentOutMinusHistoricalAvg = 0;
  row.percentOutMinusHistoricalMonthlyP95 = 0;
  row.historicalPercentileRank = 0;
  row.volatilityAdjustedAnomaly = 0;
  row.historicalAnomalyScore = 0;
}

function enrichCounty(row, baselines, snapshotMonth) {
  const baseline = baselines.counties?.[keyCounty(row.county)];

  if (!baseline) {
    applyZeroHistoricalFields(row);
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
  const volatility = Math.max(num(baseline.outageVolatilityScore), 0.1);
  const effectiveMonthlyP95 = monthlyP95 || p95;

  row.historicalAvgPercentOut = avg;
  row.historicalP95PercentOut = p95;
  row.historicalP99PercentOut = p99;
  row.historicalMonthlyAvgPercentOut = monthlyAvg;
  row.historicalMonthlyP95PercentOut = monthlyP95;
  row.historicalOutageVolatilityScore = volatility;
  row.outageVsHistoricalAvg = safeRatio(percentOut, avg);
  row.outageVsHistoricalP95 = safeRatio(percentOut, p95);
  row.outageVsHistoricalP99 = safeRatio(percentOut, p99);
  row.outageVsHistoricalMonthlyP95 = safeRatio(percentOut, effectiveMonthlyP95);
  row.percentOutMinusHistoricalAvg = round(percentOut - avg, 6);
  row.percentOutMinusHistoricalMonthlyP95 = round(percentOut - effectiveMonthlyP95, 6);
  row.historicalPercentileRank = historicalPercentileRank(percentOut, avg, p95, p99);
  row.volatilityAdjustedAnomaly = round((percentOut - avg) / volatility, 6);
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
      'outageVsHistoricalP99',
      'outageVsHistoricalMonthlyP95',
      'percentOutMinusHistoricalAvg',
      'percentOutMinusHistoricalMonthlyP95',
      'historicalPercentileRank',
      'volatilityAdjustedAnomaly',
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
