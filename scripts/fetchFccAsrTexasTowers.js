const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const OUT_DIR = path.join(process.cwd(), 'public', 'data', 'resources');
const COUNTY_GEOJSON = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_MODEL = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const OUTPUT_GEOJSON = path.join(OUT_DIR, 'fcc_asr_towers_tx.geojson');

const FCC_ASR_URL = process.env.FCC_ASR_URL || 'https://wireless2.fcc.gov/UlsApp/AsrSearch/downloads/ASR_Registration.zip';
const FCC_ASR_LOCAL_FILE = process.env.FCC_ASR_LOCAL_FILE || path.join(process.cwd(), 'data', 'raw', 'ASR_Registration.csv');

function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) { return fallback; } }
function writeJson(filePath, data) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 TXDRMAP/1.0', 'Accept': 'application/zip,text/csv,*/*' }, timeout: 120000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
    else current += ch;
  }
  out.push(current.trim().replace(/^"|"$/g, ''));
  return out;
}

function csvToRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines.shift() || '').map(h => h.trim());
  return lines.map(line => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = values[i]);
    return row;
  });
}

function numberFrom(value) { const n = Number(String(value || '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; }
function pick(row, names) { for (const name of names) if (row[name] !== undefined && row[name] !== '') return row[name]; return null; }

function rowToFeature(row, index) {
  const lat = numberFrom(pick(row, ['LAT_DD', 'LATITUDE', 'Latitude', 'lat_dec', 'LAT_DEC', 'Latitude Decimal']));
  const lng = numberFrom(pick(row, ['LON_DD', 'LONG_DD', 'LONGITUDE', 'Longitude', 'lon_dec', 'LON_DEC', 'Longitude Decimal']));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lng < -106.7 || lng > -93.3 || lat < 25.7 || lat > 36.6) return null;
  return { type: 'Feature', id: pick(row, ['REG_NUM','REGISTRATION_NUMBER','registration_number','Registration Number']) || index, properties: row, geometry: { type: 'Point', coordinates: [lng, lat] } };
}

function bufferToText(buffer) {
  try { return zlib.unzipSync(buffer).toString('utf8'); }
  catch (error) { return buffer.toString('utf8'); }
}

async function loadAsrText() {
  if (fs.existsSync(FCC_ASR_LOCAL_FILE)) {
    console.log('Reading local FCC ASR file: ' + FCC_ASR_LOCAL_FILE);
    return bufferToText(fs.readFileSync(FCC_ASR_LOCAL_FILE));
  }
  try {
    console.log('Downloading FCC ASR source: ' + FCC_ASR_URL);
    return bufferToText(await fetchBuffer(FCC_ASR_URL));
  } catch (error) {
    console.warn('WARNING: FCC ASR download unavailable: ' + error.message);
    console.warn('Add a downloaded ASR CSV at data/raw/ASR_Registration.csv or set FCC_ASR_LOCAL_FILE to use real ASR data. Continuing with existing estimates.');
    return null;
  }
}

async function fetchFccAsrTexasGeojson() {
  const text = await loadAsrText();
  if (!text) return { type: 'FeatureCollection', features: [] };
  const rows = csvToRows(text);
  const features = rows.map(rowToFeature).filter(Boolean);
  return { type: 'FeatureCollection', features };
}

function getPoint(feature) { if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return null; return { lng: Number(feature.geometry.coordinates[0]), lat: Number(feature.geometry.coordinates[1]) }; }
function countyName(feature) { const p = feature.properties || {}; return String(p.NAME || p.NAMELSAD || p.name || '').replace(/ County$/i, '').trim(); }
function pointInRing(point, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1]; const xj = ring[j][0], yj = ring[j][1]; const intersect = ((yi > point.lat) !== (yj > point.lat)) && (point.lng < (xj - xi) * (point.lat - yi) / ((yj - yi) || 1e-12) + xi); if (intersect) inside = !inside; } return inside; }
function pointInPolygon(point, geometry) { if (!geometry) return false; if (geometry.type === 'Polygon') return geometry.coordinates.some(ring => pointInRing(point, ring)); if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(poly => poly.some(ring => pointInRing(point, ring))); return false; }
function findCounty(point, counties) { for (const county of counties.features || []) if (pointInPolygon(point, county.geometry)) return countyName(county); return null; }
function ensureCountyProfile(profile) { return { population: profile.population || 120000, hospitals: profile.hospitals || 0, hospitalBeds: profile.hospitalBeds || 0, fireStations: profile.fireStations || 0, emsStations: profile.emsStations || 0, policeDepartments: profile.policeDepartments || 0, cellTowersEstimated: profile.cellTowersEstimated || profile.cellTowers || 0, registeredTowers: profile.registeredTowers || 0, cellTowers: profile.cellTowers || 0, towerDataSource: profile.towerDataSource || 'ESTIMATED', ercotZone: profile.ercotZone || 'Unknown' }; }

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const countiesGeo = readJson(COUNTY_GEOJSON, null);
  if (!countiesGeo) throw new Error('Missing texas_counties.geojson. Run scripts/fetchTexasCountyGeojson.js first.');

  const resourceModel = readJson(RESOURCE_MODEL, { counties: {} });
  const model = resourceModel.counties || {};
  const towerCounts = {};
  const texasGeojson = await fetchFccAsrTexasGeojson();
  writeJson(OUTPUT_GEOJSON, texasGeojson);

  texasGeojson.features.forEach(feature => {
    const point = getPoint(feature);
    const county = point ? findCounty(point, countiesGeo) : null;
    if (!county) return;
    towerCounts[county] = (towerCounts[county] || 0) + 1;
  });

  Object.keys(model).forEach(county => {
    const profile = ensureCountyProfile(model[county]);
    const registeredTowers = towerCounts[county] || 0;
    profile.registeredTowers = registeredTowers;
    profile.cellTowers = registeredTowers || profile.cellTowersEstimated;
    profile.towerDataSource = registeredTowers ? 'FCC_ASR' : 'ESTIMATED';
    model[county] = profile;
  });

  const payload = { generatedAt: new Date().toISOString(), sourceNote: 'Texas county resources enriched with FCC Antenna Structure Registration records when available. FCC may block automated downloads with HTTP 403; in that case, provide a local ASR CSV with FCC_ASR_LOCAL_FILE. registeredTowers is ASR structure count, not guaranteed carrier cell-site count.', towerSource: fs.existsSync(FCC_ASR_LOCAL_FILE) ? FCC_ASR_LOCAL_FILE : FCC_ASR_URL, towerFeatureCount: texasGeojson.features.length, fields: ['population','hospitals','hospitalBeds','fireStations','emsStations','policeDepartments','cellTowersEstimated','registeredTowers','cellTowers','towerDataSource','ercotZone'], counties: model };
  writeJson(RESOURCE_MODEL, payload);
  console.log('Wrote ' + OUTPUT_GEOJSON + ' with ' + texasGeojson.features.length + ' FCC ASR structures');
  console.log('Updated ' + RESOURCE_MODEL + ' with registered tower counts for ' + Object.keys(towerCounts).length + ' counties');
}

main().catch(error => { console.error(error); process.exit(1); });
