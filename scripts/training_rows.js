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

function hasSevereOperationalSignal(county) {
  return (
    num(county.tornadoWarningCount) > 0 ||
    num(county.severeThunderstormWarningCount) > 0 ||
    num(county.highWindWarningCount) > 0 ||
    num(county.winterStormWarningCount) > 0 ||
    num(county.forecastStormRisk) >= 30 ||
    num(county.spcRisk) >= 3 ||
    num(county.roadClosureRisk) >= 30 ||
    num(county.gridStressScore) >= 6
  );
}

function minimumMaterialIncrease(currentOut) {
  if (currentOut >= 2000) return 1000;
  if (currentOut >= 500) return 300;
  if (currentOut >= 100) return 100;
  return 50;
}

function classifyOperationalWorsening(county, futureCounty) {
  const currentOut = num(county.customersOut);
  const futureOut = num(futureCounty.customersOut);
  const currentPct = num(county.percentCustomersOut);
  const futurePct = num(futureCounty.percentCustomersOut);
  const increase = futureOut - currentOut;
  const relativeIncrease = currentOut > 0 ? increase / currentOut : futureOut > 0 ? 1 : 0;
  const percentPointIncrease = futurePct - currentPct;
  const materialIncrease = minimumMaterialIncrease(currentOut);
  const severeSignal = hasSevereOperationalSignal(county);

  if (increase <= 0) {
    return {
      worsened: 0,
      worseningSeverity: 0,
      worseningReason: 'stable-or-improving',
      outageIncrease: increase,
      relativeIncrease,
      percentPointIncrease
    };
  }

  if (futureOut < 50 && increase < 50) {
    return {
      worsened: 0,
      worseningSeverity: 0,
      worseningReason: 'too-small-to-be-operational',
      outageIncrease: increase,
      relativeIncrease,
      percentPointIncrease
    };
  }

  const criticalEscalation =
    increase >= 2000 ||
    percentPointIncrease >= 0.5 ||
    (currentOut >= 500 && relativeIncrease >= 1.0 && increase >= 500);

  if (criticalEscalation) {
    return {
      worsened: 1,
      worseningSeverity: 3,
      worseningReason: 'critical-operational-escalation',
      outageIncrease: increase,
      relativeIncrease,
      percentPointIncrease
    };
  }

  const significantOutageEscalation =
    increase >= materialIncrease &&
    relativeIncrease >= 0.25 &&
    (percentPointIncrease >= 0.02 || increase >= 500);

  if (significantOutageEscalation) {
    return {
      worsened: 1,
      worseningSeverity: 2,
      worseningReason: 'material-outage-escalation',
      outageIncrease: increase,
      relativeIncrease,
      percentPointIncrease
    };
  }

  const stressAssistedEscalation =
    severeSignal &&
    increase >= Math.max(50, Math.round(materialIncrease / 2)) &&
    relativeIncrease >= 0.15;

  if (stressAssistedEscalation) {
    return {
      worsened: 1,
      worseningSeverity: 2,
      worseningReason: 'weather-road-grid-assisted-escalation',
      outageIncrease: increase,
      relativeIncrease,
      percentPointIncrease
    };
  }

  const minorWorsening = increase > 0;

  return {
    worsened: 0,
    worseningSeverity: minorWorsening ? 1 : 0,
    worseningReason: 'minor-non-actionable-increase',
    outageIncrease: increase,
    relativeIncrease,
    percentPointIncrease
  };
}

function rowForCounty(snapshot, future, county) {
  const futureCounty = (future.counties || []).find(
    item => String(item.county).toLowerCase() === String(county.county).toLowerCase()
  );
  if (!futureCounty) return null;

  const currentOut = num(county.customersOut);
  const futureOut = num(futureCounty.customersOut);
  const label = classifyOperationalWorsening(county, futureCounty);

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
    gridStressScore: num(county.gridStressScore),
    gridReservePct: num(county.gridReservePct),
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
    futurePercentCustomersOut: num(futureCounty.percentCustomersOut),
    outageIncrease3h: label.outageIncrease,
    outageRelativeIncrease3h: Number(label.relativeIncrease.toFixed(4)),
    percentPointIncrease3h: Number(label.percentPointIncrease.toFixed(4)),
    worseningSeverity: label.worseningSeverity,
    worseningReason: label.worseningReason,
    worsened: label.worsened
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

  const labelSummary = rows.reduce((summary, row) => {
    const key = row.worseningReason || 'unknown';
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});

  await fs.mkdir('history', { recursive: true });
  await fs.writeFile(TRAINING_FILE, JSON.stringify({
    updated: new Date().toISOString(),
    lookaheadHours: LOOKAHEAD_HOURS,
    labelDefinition: {
      target: 'worsened',
      meaning: 'Operationally meaningful county outage escalation within the lookahead window',
      positiveClass: 'worseningSeverity >= 2',
      rules: [
        'Critical if increase >= 2000 customers, percent-out rises >= 0.5 points, or large county doubles with >= 500 added customers',
        'Material if increase exceeds county-size adjusted minimum, relative increase >= 25%, and percent-out rises >= 0.02 points or increase >= 500',
        'Stress-assisted if severe weather/road/grid signal exists, increase exceeds half material threshold, and relative increase >= 15%',
        'Minor increases are tracked but not labeled positive'
      ]
    },
    labelSummary,
    rows
  }, null, 2));

  console.log('Built ' + rows.length + ' training rows');
  console.log('Label summary:', labelSummary);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
