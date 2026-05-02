const fs = require('fs/promises');

const OUTAGES_FILE = 'outages.json';
const FEMA_FILE = 'history/fema-county-risk.json';

function keyCounty(name) {
  return String(name || '').replace(/ County$/i, '').trim().toLowerCase();
}

async function readJson(path) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const outages = await readJson(OUTAGES_FILE);
  const fema = await readJson(FEMA_FILE);

  if (!outages || !Array.isArray(outages.outages)) {
    console.error('outages.json missing outage rows');
    process.exit(1);
  }

  if (!fema || !fema.counties) {
    console.error('fema-county-risk.json missing county data');
    process.exit(1);
  }

  let matched = 0;

  for (const row of outages.outages) {
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
      continue;
    }

    matched += 1;
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
  }

  outages.femaRisk = {
    ok: true,
    updated: new Date().toISOString(),
    matchedCounties: matched,
    sourceUpdated: fema.updated,
    sourceName: fema.sourceName
  };

  await fs.writeFile(OUTAGES_FILE, JSON.stringify(outages, null, 2));
  console.log(`Applied FEMA risk to ${matched}/${outages.outages.length} outage rows`);
}

main();
