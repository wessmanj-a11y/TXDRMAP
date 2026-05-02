const fs = require('fs/promises');

const FEMA_NRI_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';
const OUT_FILE = 'history/fema-county-risk.json';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > -9998 ? n : 0;
}

function keyCounty(name) {
  return String(name || '').replace(/ County$/i, '').trim().toLowerCase();
}

function firstNumber(attrs, names) {
  for (const name of names) {
    if (attrs[name] !== undefined && attrs[name] !== null) return num(attrs[name]);
  }
  return 0;
}

function firstString(attrs, names, fallback = '') {
  for (const name of names) {
    if (attrs[name] !== undefined && attrs[name] !== null && String(attrs[name]).trim()) return String(attrs[name]).trim();
  }
  return fallback;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(num(value))));
}

function computeBaselineFragility(row) {
  const communityResilienceInverse = 100 - row.femaCommunityResilience;
  return clamp(
    row.femaStrongWindRisk * 0.25 +
    row.femaTornadoRisk * 0.20 +
    row.femaLightningRisk * 0.15 +
    row.femaIceStormRisk * 0.10 +
    row.femaWildfireRisk * 0.10 +
    row.femaExpectedAnnualLoss * 0.10 +
    row.femaSocialVulnerability * 0.05 +
    communityResilienceInverse * 0.05
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,*/*',
      'user-agent': 'TXDRMAP FEMA NRI ingestion'
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchFemaRows() {
  const params = new URLSearchParams({
    where: "STATEABBRV='TX'",
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
    resultRecordCount: '2000'
  });

  const payload = await fetchJson(`${FEMA_NRI_URL}?${params.toString()}`);
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.features || [];
}

function normalizeFeature(feature) {
  const a = feature.attributes || feature.properties || {};
  const county = firstString(a, ['COUNTY', 'COUNTYNAME', 'County', 'county']);

  const row = {
    county,
    key: keyCounty(county),
    state: firstString(a, ['STATEABBRV', 'STATE', 'State'], 'TX'),
    countyFips: firstString(a, ['STCOFIPS', 'COUNTYFIPS', 'FIPS', 'GEOID']),
    femaRiskScore: firstNumber(a, ['RISK_SCORE', 'RISK_SCOR', 'RISK_SCR', 'RISK_NPCTL']),
    femaExpectedAnnualLoss: firstNumber(a, ['EAL_SCORE', 'EAL_SCOR', 'EAL_SCR', 'EAL_NPCTL']),
    femaSocialVulnerability: firstNumber(a, ['SOVI_SCORE', 'SOVI_SCOR', 'SOVI_SCR', 'SOVI_NPCTL']),
    femaCommunityResilience: firstNumber(a, ['RESL_SCORE', 'RESL_SCOR', 'RESL_SCR', 'RESL_NPCTL']),
    femaStrongWindRisk: firstNumber(a, ['SWND_RISKS', 'SWND_RISKV', 'SWND_EALS', 'SWND_EALR_NPCTL']),
    femaTornadoRisk: firstNumber(a, ['TRND_RISKS', 'TRND_RISKV', 'TRND_EALS', 'TRND_EALR_NPCTL']),
    femaHurricaneRisk: firstNumber(a, ['HRCN_RISKS', 'HRCN_RISKV', 'HRCN_EALS', 'HRCN_EALR_NPCTL']),
    femaLightningRisk: firstNumber(a, ['LTNG_RISKS', 'LTNG_RISKV', 'LTNG_EALS', 'LTNG_EALR_NPCTL']),
    femaIceStormRisk: firstNumber(a, ['ISTM_RISKS', 'ISTM_RISKV', 'ISTM_EALS', 'ISTM_EALR_NPCTL']),
    femaWildfireRisk: firstNumber(a, ['WFIR_RISKS', 'WFIR_RISKV', 'WFIR_EALS', 'WFIR_EALR_NPCTL']),
    femaRiverineFloodRisk: firstNumber(a, ['RFLD_RISKS', 'RFLD_RISKV', 'RFLD_EALS', 'RFLD_EALR_NPCTL']),
    femaCoastalFloodRisk: firstNumber(a, ['CFLD_RISKS', 'CFLD_RISKV', 'CFLD_EALS', 'CFLD_EALR_NPCTL'])
  };

  row.baselineCountyFragility = computeBaselineFragility(row);
  return row;
}

async function main() {
  const features = await fetchFemaRows();
  const counties = {};

  for (const feature of features) {
    const row = normalizeFeature(feature);
    if (!row.key) continue;
    counties[row.key] = row;
  }

  const payload = {
    updated: new Date().toISOString(),
    source: FEMA_NRI_URL,
    sourceName: 'FEMA National Risk Index Counties via ArcGIS Feature Service',
    count: Object.keys(counties).length,
    fields: [
      'femaRiskScore',
      'femaExpectedAnnualLoss',
      'femaSocialVulnerability',
      'femaCommunityResilience',
      'femaStrongWindRisk',
      'femaTornadoRisk',
      'femaHurricaneRisk',
      'femaLightningRisk',
      'femaIceStormRisk',
      'femaWildfireRisk',
      'femaRiverineFloodRisk',
      'femaCoastalFloodRisk',
      'baselineCountyFragility'
    ],
    counties
  };

  await fs.mkdir('history', { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Saved FEMA NRI risk for ${payload.count} Texas counties`);
}

main().catch(error => {
  console.error('FEMA risk ingestion failed:', error);
  process.exitCode = 1;
});
