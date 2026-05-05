const fs = require('fs/promises');

const HISTORY_FILE = 'history/outage-history.json';
const TRAINING_FILE = 'history/training-data.json';
const LOOKAHEAD_HOURS = 3;
const LOOKAHEAD_MS = LOOKAHEAD_HOURS * 60 * 60 * 1000;

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function findFutureSnapshot(history, startMs) {
  return history
    .filter(snapshot => {
      const t = new Date(snapshot.timestamp).getTime();
      return Number.isFinite(t) && t >= startMs + LOOKAHEAD_MS;
    })
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
}

function rowForCounty(snapshot, future, county) {
  const futureCounty = (future.counties || []).find(
    item => String(item.county).toLowerCase() === String(county.county).toLowerCase()
  );
  if (!futureCounty) return null;

  const currentOut = num(county.customersOut);
  const futureOut = num(futureCounty.customersOut);
  const increase = futureOut - currentOut;
  const worsened = increase >= 500 || (currentOut > 0 && futureOut >= currentOut * 1.5);

  return {
    timestamp: snapshot.timestamp,
    futureTimestamp: future.timestamp,
    lookaheadHours: LOOKAHEAD_HOURS,
    county: county.county,
    customersOut: currentOut,
    percentCustomersOut: num(county.percentCustomersOut),
    incidents: num(county.incidents),
    maxSingleOutage: num(county.maxSingleOutage),
    weatherAlerts: num(county.weatherAlerts),
    weatherRisk: num(county.weatherRisk),
    alertWarningCount: num(county.alertWarningCount),
    alertWatchCount: num(county.alertWatchCount),
    alertAdvisoryCount: num(county.alertAdvisoryCount),
    tornadoWarningCount: num(county.tornadoWarningCount),
    tornadoWatchCount: num(county.tornadoWatchCount),
    severeThunderstormWarningCount: num(county.severeThunderstormWarningCount),
    severeThunderstormWatchCount: num(county.severeThunderstormWatchCount),
    flashFloodWarningCount: num(county.flashFloodWarningCount),
    floodWarningCount: num(county.floodWarningCount),
    winterStormWarningCount: num(county.winterStormWarningCount),
    highWindWarningCount: num(county.highWindWarningCount),
    maxAlertSeverityScore: num(county.maxAlertSeverityScore),
    maxAlertUrgencyScore: num(county.maxAlertUrgencyScore),
    maxAlertCertaintyScore: num(county.maxAlertCertaintyScore),
    spcRisk: num(county.spcRisk),
    forecastWindMax6h: num(county.forecastWindMax6h),
    forecastWindMax12h: num(county.forecastWindMax12h),
    forecastPrecipChanceMax12h: num(county.forecastPrecipChanceMax12h),
    forecastStormRisk: num(county.forecastStormRisk),
    roadClosures: num(county.roadClosures),
    roadClosureRisk: num(county.roadClosureRisk),
    femaRiskScore: num(county.femaRiskScore),
    baselineCountyFragility: num(county.baselineCountyFragility),
    femaExpectedAnnualLoss: num(county.femaExpectedAnnualLoss),
    femaSocialVulnerability: num(county.femaSocialVulnerability),
    femaCommunityResilience: num(county.femaCommunityResilience),
    femaStrongWindRisk: num(county.femaStrongWindRisk),
    femaTornadoRisk: num(county.femaTornadoRisk),
    historicalAvgPercentOut: num(county.historicalAvgPercentOut),
    historicalP95PercentOut: num(county.historicalP95PercentOut),
    historicalP99PercentOut: num(county.historicalP99PercentOut),
    historicalMonthlyAvgPercentOut: num(county.historicalMonthlyAvgPercentOut),
    historicalMonthlyP95PercentOut: num(county.historicalMonthlyP95PercentOut),
    historicalOutageVolatilityScore: num(county.historicalOutageVolatilityScore),
    outageVsHistoricalAvg: num(county.outageVsHistoricalAvg),
    outageVsHistoricalP95: num(county.outageVsHistoricalP95),
    outageVsHistoricalP99: num(county.outageVsHistoricalP99),
    outageVsHistoricalMonthlyP95: num(county.outageVsHistoricalMonthlyP95),
    percentOutMinusHistoricalAvg: num(county.percentOutMinusHistoricalAvg),
    percentOutMinusHistoricalMonthlyP95: num(county.percentOutMinusHistoricalMonthlyP95),
    historicalPercentileRank: num(county.historicalPercentileRank),
    volatilityAdjustedAnomaly: num(county.volatilityAdjustedAnomaly),
    historicalAnomalyScore: num(county.historicalAnomalyScore),
    trend6h: num(county.trend6h),
    trend12h: num(county.trend12h),
    trend24h: num(county.trend24h),
    trendVelocity: num(county.trendVelocity),
    sevenDayPeak: num(county.sevenDayPeak),
    decayedSevenDayPeak: num(county.decayedSevenDayPeak),
    futureCustomersOut: futureOut,
    outageIncrease3h: increase,
    worsened: worsened ? 1 : 0
  };
}

async function main() {
  const payload = await readJson(HISTORY_FILE, { snapshots: [] });
  const history = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const rows = [];

  for (const snapshot of history) {
    const t = new Date(snapshot.timestamp).getTime();
    if (!Number.isFinite(t)) continue;

    const future = findFutureSnapshot(history, t);
    if (!future) continue;

    for (const county of snapshot.counties || []) {
      const row = rowForCounty(snapshot, future, county);
      if (row) rows.push(row);
    }
  }

  await fs.mkdir('history', { recursive: true });
  await fs.writeFile(TRAINING_FILE, JSON.stringify({
    updated: new Date().toISOString(),
    lookaheadHours: LOOKAHEAD_HOURS,
    rows
  }, null, 2));

  console.log('Built ' + rows.length + ' training rows');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
