const fs = require('fs');
const path = require('path');

const GEO_PATH = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_baseline.json');
const LEGACY_COUNTY_DATA_PATH = path.join(process.cwd(), 'texas_county_data.json');

const ERCOT_ZONE_RULES = [
  { zone: 'North', counties: ['Dallas','Tarrant','Collin','Denton','Grayson','Wise','Parker','Rockwall','Ellis','Johnson'] },
  { zone: 'Coast', counties: ['Harris','Galveston','Brazoria','Fort Bend','Montgomery','Jefferson','Orange','Nueces'] },
  { zone: 'South', counties: ['Bexar','Hidalgo','Cameron','Webb','Maverick'] },
  { zone: 'West', counties: ['El Paso','Midland','Ector','Lubbock','Potter','Randall'] },
  { zone: 'Central', counties: ['Travis','Williamson','Hays','Bell','McLennan'] }
];

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return fallback; }
}

function countyName(feature) {
  const p = feature.properties || {};
  return String(p.NAME || p.NAMELSAD || '').replace(/ County$/i, '').trim();
}

function normalizeCountyName(name) {
  return String(name || '').replace(/ County$/i, '').replace(/\s+/g, '').trim().toLowerCase();
}

function estimateCellTowers(population) {
  if (population >= 4000000) return 9000;
  if (population >= 1500000) return 4200;
  if (population >= 800000) return 2200;
  if (population >= 300000) return 950;
  if (population >= 100000) return 350;
  if (population >= 50000) return 180;
  if (population >= 20000) return 75;
  return 25;
}

function assignErcotZone(county) {
  for (const rule of ERCOT_ZONE_RULES) {
    if (rule.counties.includes(county)) return rule.zone;
  }
  return 'Unknown';
}

function derivePopulationFromLegacy(record) {
  if (!record) return null;

  const directCandidates = [
    record.population,
    record.Population,
    record.pop,
    record.countyPopulation
  ];

  for (const value of directCandidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }

  const customerCandidates = [
    record.customers,
    record.totalCustomers,
    record.utilityCustomers,
    record.customerCount
  ];

  for (const customers of customerCandidates) {
    const num = Number(customers);
    if (Number.isFinite(num) && num > 0) {
      return Math.round(num * 2.6);
    }
  }

  return null;
}

function buildLegacyPopulationMap() {
  const legacy = readJson(LEGACY_COUNTY_DATA_PATH, {});
  const map = {};

  Object.keys(legacy || {}).forEach(county => {
    const normalized = normalizeCountyName(county);
    const population = derivePopulationFromLegacy(legacy[county]);
    if (population) map[normalized] = population;
  });

  return map;
}

async function main() {
  const geo = readJson(GEO_PATH, null);
  if (!geo) throw new Error('Missing texas_counties.geojson');

  const resources = readJson(RESOURCE_PATH, { counties: {} });
  const legacyPopulationMap = buildLegacyPopulationMap();

  const counties = {};

  (geo.features || []).forEach(feature => {
    const county = countyName(feature);
    if (!county) return;

    const normalized = normalizeCountyName(county);
    const resource = (resources.counties || {})[county] || {};

    const existingPopulation = Number(resource.population);
    const legacyPopulation = legacyPopulationMap[normalized];

    const population =
      (Number.isFinite(existingPopulation) && existingPopulation > 0 && existingPopulation !== 120000)
        ? existingPopulation
        : (legacyPopulation || 120000);

    counties[county] = {
      population,
      hospitals: resource.hospitals || 0,
      hospitalBeds: resource.hospitalBeds || 0,
      fireStations: resource.fireStations || 0,
      emsStations: resource.emsStations || 0,
      policeDepartments: resource.policeDepartments || 0,
      cellTowers: resource.cellTowers || estimateCellTowers(population),
      ercotZone: resource.ercotZone && resource.ercotZone !== 'Unknown'
        ? resource.ercotZone
        : assignErcotZone(county)
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceNote: 'Texas county baseline enriched primarily from existing TXDRMAP county data, HIFLD resource layers, estimated cell towers, and ERCOT regional assignment. Population prioritizes legacy internal county data before fallback assumptions.',
    fields: ['population','hospitals','hospitalBeds','fireStations','emsStations','policeDepartments','cellTowers','ercotZone'],
    counties
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  fs.writeFileSync(RESOURCE_PATH, JSON.stringify(payload, null, 2));

  console.log('Built Texas county baseline for ' + Object.keys(counties).length + ' counties');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
