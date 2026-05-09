const fs = require('fs/promises');
const path = require('path');

const BASELINE_FILE = path.join('history', 'county-baseline.json');
const DEFAULT_SCENARIO = path.join('scenarios', 'sample-hurricane.json');
const OUTPUT_FILE = path.join('history', 'scenario-report.json');

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function normalizeCounty(name) {
  return String(name || '').trim().toLowerCase();
}

function hazardTier(countyName, trackSet) {
  return trackSet.has(normalizeCounty(countyName)) ? 1 : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeHazardScore(county, scenario, directHit) {
  const windFactor = num(scenario.maxWindMph) / 120;
  const rainFactor = num(scenario.rainfallInches) / 15;
  const durationFactor = num(scenario.durationHours) / 24;

  let score =
    windFactor * (0.45 + county.windRisk * 0.55) +
    rainFactor * (0.35 + county.floodRisk * 0.65) +
    durationFactor * 0.2;

  if (scenario.type === 'hurricane') score *= 1.25;
  if (scenario.type === 'thunderstorm') score *= 0.9;
  if (scenario.type === 'winterstorm') score *= 1.05;

  if (directHit) score *= 1.8;
  else score *= 0.18;

  return clamp(score, 0, 5);
}

function countyImpact(county, scenario, directHit) {
  const hazardScore = computeHazardScore(county, scenario, directHit);

  const outagePct = clamp(
    hazardScore * county.powerFragility * 42,
    0,
    95
  );

  const estimatedOutages = Math.round(county.households * (outagePct / 100));

  const roadImpactPct = clamp(
    hazardScore * (county.floodRisk * 45 + county.windRisk * 20),
    0,
    100
  );

  const telcoImpactPct = clamp(
    hazardScore * (county.powerFragility * 35 + county.windRisk * 25),
    0,
    100
  );

  const hospitalDemandSurgePct = clamp(
    hazardScore * 28,
    0,
    250
  );

  const firstResponderCalls = Math.round(
    county.population * hazardScore * 0.012
  );

  const injuries = Math.round(
    county.population * hazardScore * 0.0018
  );

  const fatalities = Math.round(
    injuries * 0.012
  );

  const residentialDamage = Math.round(
    county.residentialPropertyValue * (hazardScore / 12)
  );

  const commercialDamage = Math.round(
    county.commercialPropertyValue * (hazardScore / 14)
  );

  const totalEconomicDamage = residentialDamage + commercialDamage;

  const recoveryDays = Math.round(
    clamp(
      2 +
      hazardScore * 4 +
      county.powerFragility * 6 +
      county.averageRestorationDifficulty / 20,
      1,
      60
    )
  );

  return {
    county: county.county,
    directHit,
    hazardScore: Number(hazardScore.toFixed(2)),
    estimatedOutagePercent: Number(outagePct.toFixed(2)),
    estimatedOutages,
    roadImpactPercent: Number(roadImpactPct.toFixed(2)),
    telcoImpactPercent: Number(telcoImpactPct.toFixed(2)),
    hospitalDemandSurgePercent: Number(hospitalDemandSurgePct.toFixed(2)),
    firstResponderCalls,
    estimatedInjuries: injuries,
    estimatedFatalities: fatalities,
    residentialDamage,
    commercialDamage,
    totalEconomicDamage,
    estimatedRecoveryDays: recoveryDays
  };
}

function summarize(results) {
  return results.reduce(
    (acc, county) => {
      acc.totalEstimatedOutages += county.estimatedOutages;
      acc.totalFirstResponderCalls += county.firstResponderCalls;
      acc.totalEstimatedInjuries += county.estimatedInjuries;
      acc.totalEstimatedFatalities += county.estimatedFatalities;
      acc.totalEconomicDamage += county.totalEconomicDamage;
      acc.maxRecoveryDays = Math.max(acc.maxRecoveryDays, county.estimatedRecoveryDays);
      if (county.hospitalDemandSurgePercent > 100) acc.hospitalStressCounties += 1;
      if (county.roadImpactPercent > 50) acc.severeRoadImpactCounties += 1;
      return acc;
    },
    {
      totalEstimatedOutages: 0,
      totalFirstResponderCalls: 0,
      totalEstimatedInjuries: 0,
      totalEstimatedFatalities: 0,
      totalEconomicDamage: 0,
      hospitalStressCounties: 0,
      severeRoadImpactCounties: 0,
      maxRecoveryDays: 0
    }
  );
}

async function main() {
  const scenarioPath = process.argv[2] || DEFAULT_SCENARIO;

  const [baselinePayload, scenario] = await Promise.all([
    readJson(BASELINE_FILE),
    readJson(scenarioPath)
  ]);

  const counties = baselinePayload.countyBaseline || [];
  const trackSet = new Set((scenario.trackCounties || []).map(normalizeCounty));

  const impacted = counties
    .map(county => countyImpact(county, scenario, hazardTier(county.county, trackSet) === 1))
    .filter(county => county.hazardScore >= 0.2)
    .sort((a, b) => b.hazardScore - a.hazardScore);

  const statewideSummary = summarize(impacted);

  const output = {
    generated: new Date().toISOString(),
    scenario,
    statewideSummary,
    topImpactedCounties: impacted.slice(0, 25),
    allCountyImpacts: impacted
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`Scenario complete: ${scenario.name}`);
  console.log(`Estimated outages: ${statewideSummary.totalEstimatedOutages}`);
  console.log(`Estimated economic damage: $${statewideSummary.totalEconomicDamage.toLocaleString()}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
