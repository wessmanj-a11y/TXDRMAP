const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_DIR = path.join(process.cwd(), 'public', 'data', 'resources');
const COUNTY_GEOJSON = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_MODEL = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const OUTPUT_GEOJSON = path.join(OUT_DIR, 'fcc_asr_towers_tx.geojson');

// Override this in GitHub Actions or locally if FCC changes its public ArcGIS layer URL.
const FCC_ASR_QUERY_URL = process.env.FCC_ASR_QUERY_URL || 'https://services.arcgis.com/9j9M5LwN1j5k5Q7r/arcgis/rest/services/ASR_Public/FeatureServer/0/query';
const TEXAS_BBOX = '-106.7,25.7,-93.3,36.6';

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { return fallback; }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchTextOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'TXDRMAP/1.0 fcc-asr-ingestion' }, timeout: 60000 }, res => {
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
    try { return await fetchTextOnce(url); }
    catch (error) {
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

function buildArcgisUrl(offset) {
  const params = new URLSearchParams({
    f: 'json',
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    geometry: TEXAS_BBOX,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    resultRecordCount: '2000',
    resultOffset: String(offset || 0)
  });
  return FCC_ASR_QUERY_URL + '?' + params.toString();
}

function esriFeatureToGeojsonFeature(feature, index) {
  const attrs = feature.attributes || {};
  const geom = feature.geometry || {};
  const x = Number(geom.x);
  const y = Number(geom.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    type: 'Feature',
    id: attrs.OBJECTID || attrs.objectid || attrs.registration_number || index,
    properties: attrs,
    geometry: { type: 'Point', coordinates: [x, y] }
  };
}

async function fetchFccAsrTexasGeojson() {
  let allFeatures = [];
  let offset = 0;
  let page = 0;
  while (true) {
    const text = await fetchText(buildArcgisUrl(offset));
    const data = JSON.parse(text);
    if (data.error) throw new Error('FCC ASR ArcGIS error: ' + JSON.stringify(data.error));
    const features = (data.features || []).map(esriFeatureToGeojsonFeature).filter(Boolean);
    allFeatures = allFeatures.concat(features);
    page += 1;
    console.log('Fetched FCC ASR page ' + page + ' with ' + features.length + ' features');
    if (!data.exceededTransferLimit || !features.length || page > 120) break;
    offset += features.length;
  }
  return { type: 'FeatureCollection', features: allFeatures };
}

function getPoint(feature) {
  if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return null;
  return { lng: Number(feature.geometry.coordinates[0]), lat: Number(feature.geometry.coordinates[1]) };
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

function ensureCountyProfile(profile) {
  return {
    population: profile.population || 120000,
    hospitals: profile.hospitals || 0,
    hospitalBeds: profile.hospitalBeds || 0,
    fireStations: profile.fireStations || 0,
    emsStations: profile.emsStations || 0,
    policeDepartments: profile.policeDepartments || 0,
    cellTowersEstimated: profile.cellTowersEstimated || profile.cellTowers || 0,
    registeredTowers: profile.registeredTowers || 0,
    cellTowers: profile.cellTowers || 0,
    towerDataSource: profile.towerDataSource || 'ESTIMATED',
    ercotZone: profile.ercotZone || 'Unknown'
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const countiesGeo = readJson(COUNTY_GEOJSON, null);
  if (!countiesGeo) throw new Error('Missing texas_counties.geojson. Run scripts/fetchTexasCountyGeojson.js first.');

  const resourceModel = readJson(RESOURCE_MODEL, { counties: {} });
  const model = resourceModel.counties || {};
  const towerCounts = {};

  const geojson = await fetchFccAsrTexasGeojson();
  const texasFeatures = geojson.features.filter(feature => {
    const point = getPoint(feature);
    return point && point.lng >= -106.7 && point.lng <= -93.3 && point.lat >= 25.7 && point.lat <= 36.6;
  });
  const texasGeojson = { type: 'FeatureCollection', features: texasFeatures };
  writeJson(OUTPUT_GEOJSON, texasGeojson);

  texasFeatures.forEach(feature => {
    const point = getPoint(feature);
    const county = point ? findCounty(point, countiesGeo) : null;
    if (!county) return;
    towerCounts[county] = (towerCounts[county] || 0) + 1;
  });

  Object.keys(model).forEach(county => {
    const profile = ensureCountyProfile(model[county]);
    const registeredTowers = towerCounts[county] || 0;
    profile.cellTowersEstimated = profile.cellTowersEstimated || profile.cellTowers || 0;
    profile.registeredTowers = registeredTowers;
    profile.cellTowers = registeredTowers || profile.cellTowersEstimated;
    profile.towerDataSource = registeredTowers ? 'FCC_ASR' : 'ESTIMATED';
    model[county] = profile;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceNote: 'Texas county resources enriched with FCC Antenna Structure Registration records. registeredTowers is ASR structure count, not guaranteed carrier cell-site count. cellTowers falls back to cellTowersEstimated when ASR count is unavailable.',
    towerSource: FCC_ASR_QUERY_URL,
    towerFeatureCount: texasFeatures.length,
    fields: ['population','hospitals','hospitalBeds','fireStations','emsStations','policeDepartments','cellTowersEstimated','registeredTowers','cellTowers','towerDataSource','ercotZone'],
    counties: model
  };

  writeJson(RESOURCE_MODEL, payload);
  console.log('Wrote ' + OUTPUT_GEOJSON + ' with ' + texasFeatures.length + ' FCC ASR structures');
  console.log('Updated ' + RESOURCE_MODEL + ' with registered tower counts for ' + Object.keys(towerCounts).length + ' counties');
}

main().catch(error => { console.error(error); process.exit(1); });
