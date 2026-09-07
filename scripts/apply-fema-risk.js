const fs = require('fs/promises');

const OUTAGES_FILE = 'outages.json';
const HISTORY_FILE = 'history/outage-history.json';
const FEMA_FILE = 'history/fema-county-risk.json';

function keyCounty(name) {
  return String(name || '').replace(/ County$/i, '').trim().toLowerCase();
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function riskBand(score) {
  if (score >= 75) return 'High';
  if (score >= 50) return 'Elevated';
  if (score >= 25) return 'Watch';
  return 'Low';
}

async function readJson(path) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function attachFema(row, fema) {
  const countyRisk = fema.counties[keyCounty(row.county)];

  if (!countyRisk) {
    row.femaRiskScore = 0;
    row.femaExpectedAnnualLoss = 0;
    row.femaSocialVulnerability = 0;
    row.femaCommunityResilience = 0;
    row.femaStrongWindRisk = 0;
    row.femaTornadoRisk = 0;
    row.femaLightningRisk = 0;
    row.femaIceStormRisk = 0;
    row.femaWildfireRisk = 0;
    row.baselineCountyFragility = 0;
    row.femaFragilityBoost = 0;
    return false;
  }

  row.femaRiskScore = countyRisk.femaRiskScore;
  row.femaExpectedAnnualLoss = countyRisk.femaExpectedAnnualLoss;
  row.femaSocialVulnerability = countyRisk.femaSocialVulnerability;
  row.femaCommunityResilience = countyRisk.femaCommunityResilience;
  row.femaStrongWindRisk = countyRisk.femaStrongWindRisk;
  row.femaTornadoRisk = countyRisk.femaTornadoRisk;
  row.femaLightningRisk = countyRisk.femaLightningRisk;
  row.femaIceStormRisk = countyRisk.femaIceStormRisk;
  row.femaWildfireRisk = countyRisk.femaWildfireRisk;
  row.baselineCountyFragility = countyRisk.baselineCountyFragility;

  const outageStress = Math.min(35, num(row.currentSeverity) + Math.min(15, num(row.trend6h) > 0 ? Math.sqrt(num(row.trend6h)) : 0));
  const weatherStress = Math.min(65,
    num(row.weatherRisk) * 0.25 +
    num(row.forecastStormRisk) * 0.55 +
    num(row.spcRisk) * 0.20 +
    num(row.alertWarningCount) * 8
  );
  const totalStress = Math.min(100, outageStress + weatherStress);
  const fragilityBoost = Math.round(Math.min(8, num(row.baselineCountyFragility) * totalStress * 0.001));

  row.femaFragilityBoost = fragilityBoost;

  if (fragilityBoost > 0) {
    const baseRisk = num(row.predictedRisk);
    row.predictedRisk = Math.round(Math.min(100, baseRisk + fragilityBoost));
    row.blendedPredictedRisk = row.predictedRisk;
    row.predictedRiskBand = riskBand(row.predictedRisk);

    const explanation = String(row.predictionExplanation || '');
    if (!explanation.includes('FEMA')) {
      row.predictionExplanation = explanation
        ? `${explanation} + FEMA fragility boost ${fragilityBoost}`
        : `FEMA fragility boost ${fragilityBoost}`;
    }
  }

  return true;
}

function applyToRows(rows, fema) {
  let matched = 0;
  for (const row of rows || []) {
    if (attachFema(row, fema)) matched += 1;
  }
  return matched;
}

async function main() {
  const outages = await readJson(OUTAGES_FILE);
  const history = await readJson(HISTORY_FILE);
  const fema = await readJson(FEMA_FILE);

  if (!outages || !Array.isArray(outages.outages)) {
    console.error('outages.json missing outage rows');
    process.exit(1);
  }

  if (!fema || !fema.counties) {
    console.error('fema-county-risk.json missing county data');
    process.exit(1);
  }

  const matched = applyToRows(outages.outages, fema);

  if (history && Array.isArray(history.snapshots) && history.snapshots.length) {
    const latest = history.snapshots[history.snapshots.length - 1];
    applyToRows(latest.counties || [], fema);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  }

  outages.femaRisk = {
    ok: true,
    updated: new Date().toISOString(),
    matchedCounties: matched,
    sourceUpdated: fema.updated,
    sourceName: fema.sourceName,
    mode: 'conditional-risk-modifier',
    maxBoostPoints: 8
  };

  await fs.writeFile(OUTAGES_FILE, JSON.stringify(outages, null, 2));
  console.log(`Applied FEMA risk to ${matched}/${outages.outages.length} outage rows`);
}

main();
