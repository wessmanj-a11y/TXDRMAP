const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_DIR = path.join(process.cwd(), 'public', 'data', 'resources');
const COUNTY_GEOJSON = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_MODEL = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const TEXAS_BBOX = '-106.7,25.7,-93.3,36.6';

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

const DATASETS = [
  { key: 'hospitals', output: 'hospitals_tx.geojson', service: 'https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/public_health/FeatureServer/0/query', countField: 'hospitals', capacityField: 'hospitalBeds' },
  { key: 'fireStations', output: 'fire_stations_tx.geojson', service: 'https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/emergency_services/MapServer/4/query', countField: 'fireStations' },
  { key: 'emsStations', output: 'ems_stations_tx.geojson', service: 'https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/emergency_services/MapServer/2/query', countField: 'emsStations' },
  { key: 'policeStations', output: 'police_stations_tx.geojson', service: 'https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/law_enforcement/MapServer/3/query', countField: 'policeDepartments' }
];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchTextOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'TXDRMAP/1.0 resource-ingestion' }, timeout: 45000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchTextOnce(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out for ' + url)));
    req.on('error', reject);
  });
}

async function fetchText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchTextOnce(url);
    } catch (error) {
      lastError = error;
      const retryable = /HTTP 429|HTTP 500|HTTP 502|HTTP 503|HTTP 504|timed out/i.test(error.message);
      if (!retryable || attempt === attempts) break;
      const delay = attempt * 5000;
      console.warn('Retrying after ' + error.message + ' in ' + delay + 'ms');
      await sleep(delay);
    }
  }
  throw lastError;
}

function buildArcgisUrl(serviceUrl) {
  const params = new URLSearchParams({
    f: 'geojson', where: '1=1', outFields: '*', returnGeometry: 'true',
    geometry: TEXAS_BBOX, geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outSR: '4326', resultRecordCount: '100000'
  });
  return serviceUrl + '?' + params.toString();
}

async function fetchGeojson(dataset) {
  const url = buildArcgisUrl(dataset.service);
  const text = await fetchText(url);
  const data = JSON.parse(text);
  if (!data || data.type !== 'FeatureCollection') throw new Error('Unexpected response for ' + dataset.key);
  data.features = (data.features || []).filter(feature => {
    const coords = getPoint(feature);
    return coords && coords.lng >= -106.7 && coords.lng <= -93.3 && coords.lat >= 25.7 && coords.lat <= 36.6;
  });
  return data;
}

async function getDatasetGeojson(dataset) {
  const outputFile = path.join(OUT_DIR, dataset.output);
  try {
    return await fetchGeojson(dataset);
  } catch (error) {
    console.warn('WARNING: Could not fetch ' + dataset.key + ': ' + error.message);
    const cached = readJson(outputFile, null);
    if (cached && cached.type === 'FeatureCollection') {
      console.warn('Using cached ' + dataset.output + ' with ' + (cached.features || []).length + ' features');
      return cached;
    }
    console.warn('No cache found for ' + dataset.key + '; writing empty FeatureCollection so workflow can continue.');
    return EMPTY_FEATURE_COLLECTION;
  }
}

function getPoint(feature) {
  if (!feature || !feature.geometry) return null;
  const g = feature.geometry;
  if (g.type === 'Point') return { lng: g.coordinates[0], lat: g.coordinates[1] };
  return null;
}

function countyName(feature) {
  const p = feature.properties || {};
  return String(p.NAME || p.NAMELSAD || p.name || '').replace(/ County$/i, '').trim();
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > point.lat) !== (yj > point.lat)) && (point.lng < (xj - xi) * (point.lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return geometry.coordinates.some(ring => pointInRing(point, ring));
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(poly => poly.some(ring => pointInRing(point, ring)));
  return false;
}

function findCounty(point, counties) {
  for (const county of counties.features || []) {
    if (pointInPolygon(point, county.geometry)) return countyName(county);
  }
  return null;
}

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) { return fallback; }
}

function emptyProfile(existing) {
  return {
    population: existing.population || 120000,
    hospitals: 0,
    hospitalBeds: 0,
    fireStations: 0,
    emsStations: 0,
    policeDepartments: 0,
    cellTowers: existing.cellTowers || 0,
    ercotZone: existing.ercotZone || 'Unknown'
  };
}

function estimateBeds(feature) {
  const p = feature.properties || {};
  const candidates = [p.BEDS, p.BED_COUNT, p.NUM_BEDS, p.BEDSIZE, p.BED_CAPACITY, p.BEDS_TOTAL];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 120;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const counties = readJson(COUNTY_GEOJSON, null);
  if (!counties) throw new Error('Missing texas_counties.geojson. Run scripts/fetchTexasCountyGeojson.js first.');

  const existingModel = readJson(RESOURCE_MODEL, { counties: {} });
  const model = {};
  Object.keys(existingModel.counties || {}).forEach(name => { model[name] = emptyProfile(existingModel.counties[name]); });
  (counties.features || []).forEach(feature => { const name = countyName(feature); if (name && !model[name]) model[name] = emptyProfile({}); });

  const fetchErrors = [];
  for (const dataset of DATASETS) {
    console.log('Fetching ' + dataset.key + '...');
    const geojson = await getDatasetGeojson(dataset);
    if (!geojson.features.length) fetchErrors.push(dataset.key);
    fs.writeFileSync(path.join(OUT_DIR, dataset.output), JSON.stringify(geojson));
    console.log('Wrote ' + dataset.output + ' with ' + geojson.features.length + ' features');

    geojson.features.forEach(feature => {
      const point = getPoint(feature);
      const county = point ? findCounty(point, counties) : null;
      if (!county) return;
      if (!model[county]) model[county] = emptyProfile({});
      model[county][dataset.countField] = (model[county][dataset.countField] || 0) + 1;
      if (dataset.capacityField === 'hospitalBeds') model[county].hospitalBeds += estimateBeds(feature);
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceNote: 'County resources aggregated from HIFLD Open ArcGIS services using Texas county polygons. If an upstream service is unavailable, cached data is used; if no cache exists, that layer is left empty and the workflow continues.',
    warnings: fetchErrors.length ? ['Empty or unavailable layers: ' + fetchErrors.join(', ')] : [],
    fields: ['population','hospitals','hospitalBeds','fireStations','emsStations','policeDepartments','cellTowers','ercotZone'],
    counties: model
  };
  fs.writeFileSync(RESOURCE_MODEL, JSON.stringify(payload, null, 2));
  console.log('Updated ' + RESOURCE_MODEL + ' with ' + Object.keys(model).length + ' counties');
  if (fetchErrors.length) console.warn('Completed with warnings: ' + fetchErrors.join(', '));
}

main().catch(error => { console.error(error); process.exit(1); });
