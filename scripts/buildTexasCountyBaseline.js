const fs = require('fs');
const path = require('path');

const GEO_PATH = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_baseline.json');

const POPULATION_SOURCE_PATHS = [
  process.env.TXDR_POPULATION_SOURCE,
  path.join(process.cwd(), 'public', 'data', 'texas_county_population.json'),
  path.join(process.cwd(), 'public', 'data', 'county_population.json'),
  path.join(process.cwd(), 'public', 'data', 'texas_counties_population.json'),
  path.join(process.cwd(), 'public', 'data', 'texas_county_data.json'),
  path.join(process.cwd(), 'texas_county_data.json'),
  path.join(process.cwd(), 'public', 'texas_county_data.json')
].filter(Boolean);

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

function numberFrom(value) {
  const num = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function derivePopulation(record) {
  if (!record || typeof record !== 'object') return null;
  const directFields = ['population','Population','POPULATION','pop','POP','countyPopulation','totalPopulation','estimatedPopulation','populationEstimate','residents','people'];
  for (const field of directFields) {
    const num = numberFrom(record[field]);
    if (num) return Math.round(num);
  }
  const customerFields = ['customers','totalCustomers','utilityCustomers','customerCount','customersTracked','totalMeters','meters','accounts'];
  for (const field of customerFields) {
    const num = numberFrom(record[field]);
    if (num) return Math.round(num * 2.6);
  }
  return null;
}

function deriveCountyName(record) {
  if (!record || typeof record !== 'object') return null;
  return record.county || record.County || record.COUNTY || record.countyName || record.name || record.NAME || null;
}

function ingestPopulationObject(obj, map) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => {
      const county = deriveCountyName(item);
      const population = derivePopulation(item);
      if (county && population) map[normalizeCountyName(county)] = population;
    });
    return;
  }

  const containers = [obj.counties, obj.Counties, obj.data, obj.records, obj.features].filter(Boolean);
  if (containers.length) containers.forEach(container => ingestPopulationObject(container, map));

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (!value || typeof value !== 'object') return;
    const population = derivePopulation(value);
    if (population) map[normalizeCountyName(key)] = population;
  });
}

function buildPopulationMap() {
  const map = {};
  POPULATION_SOURCE_PATHS.forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    console.log('Reading population source: ' + filePath);
    const data = readJson(filePath, null);
    ingestPopulationObject(data, map);
  });
  console.log('Loaded existing population entries: ' + Object.keys(map).length);
  return map;
}

async function main() {
  const geo = readJson(GEO_PATH, null);
  if (!geo) throw new Error('Missing texas_counties.geojson');

  const resources = readJson(RESOURCE_PATH, { counties: {} });
  const populationMap = buildPopulationMap();
  const counties = {};

  (geo.features || []).forEach(feature => {
    const county = countyName(feature);
    if (!county) return;

    const normalized = normalizeCountyName(county);
    const resource = (resources.counties || {})[county] || {};
    const resourcePopulation = numberFrom(resource.population);
    const sourcePopulation = populationMap[normalized];

    const population =
      sourcePopulation ||
      (resourcePopulation && resourcePopulation !== 120000 ? resourcePopulation : null) ||
      120000;

    counties[county] = {
      population,
      hospitals: resource.hospitals || 0,
      hospitalBeds: resource.hospitalBeds || 0,
      fireStations: resource.fireStations || 0,
      emsStations: resource.emsStations || 0,
      policeDepartments: resource.policeDepartments || 0,
      cellTowers: resource.cellTowers || estimateCellTowers(population),
      ercotZone: resource.ercotZone && resource.ercotZone !== 'Unknown' ? resource.ercotZone : assignErcotZone(county)
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceNote: 'Texas county baseline enriched from existing committed TXDRMAP population sources, HIFLD resource layers, estimated cell towers, and ERCOT regional assignment. No external population API is called.',
    populationSources: POPULATION_SOURCE_PATHS,
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
