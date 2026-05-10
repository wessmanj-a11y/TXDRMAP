const fs = require('fs');
const path = require('path');
const https = require('https');

const GEO_PATH = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_baseline.json');

const CENSUS_URL = 'https://api.census.gov/data/2024/pep/population?get=NAME,POP&for=county:*&in=state:48';

const ERCOT_ZONE_RULES = [
  { zone: 'North', counties: ['Dallas','Tarrant','Collin','Denton','Grayson','Wise','Parker','Rockwall','Ellis','Johnson'] },
  { zone: 'Coast', counties: ['Harris','Galveston','Brazoria','Fort Bend','Montgomery','Jefferson','Orange','Nueces'] },
  { zone: 'South', counties: ['Bexar','Hidalgo','Cameron','Webb','Maverick'] },
  { zone: 'West', counties: ['El Paso','Midland','Ector','Lubbock','Potter','Randall'] },
  { zone: 'Central', counties: ['Travis','Williamson','Hays','Bell','McLennan'] }
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TXDRMAP/1.0 baseline-builder' } }, res => {
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return fallback; }
}

function countyName(feature) {
  const p = feature.properties || {};
  return String(p.NAME || p.NAMELSAD || '').replace(/ County$/i, '').trim();
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

async function fetchPopulationMap() {
  const raw = await fetchText(CENSUS_URL);
  const rows = JSON.parse(raw);
  const map = {};
  rows.slice(1).forEach(row => {
    const fullName = String(row[0] || '');
    const county = fullName.replace(/ County, Texas$/i, '').trim();
    map[county] = Number(row[1]) || 120000;
  });
  return map;
}

async function main() {
  const geo = readJson(GEO_PATH, null);
  if (!geo) throw new Error('Missing texas_counties.geojson');

  const resources = readJson(RESOURCE_PATH, { counties: {} });
  const populations = await fetchPopulationMap();

  const counties = {};

  (geo.features || []).forEach(feature => {
    const county = countyName(feature);
    if (!county) return;

    const population = populations[county] || 120000;
    const resource = (resources.counties || {})[county] || {};

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
    sourceNote: 'Texas county baseline enriched with Census population, HIFLD resource layers, estimated cell towers, and ERCOT regional assignment.',
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
