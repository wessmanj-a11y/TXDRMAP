const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const OUT_DIR = path.join(process.cwd(), 'public', 'data', 'resources');
const COUNTY_GEOJSON = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_MODEL = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const OUTPUT_GEOJSON = path.join(OUT_DIR, 'fcc_asr_towers_tx.geojson');

const FCC_ASR_URL = process.env.FCC_ASR_URL || 'https://data.fcc.gov/download/pub/uls/complete/r_tower.zip';
const FCC_ASR_LOCAL_FILE = process.env.FCC_ASR_LOCAL_FILE || path.join(process.cwd(), 'data', 'raw', 'r_tower.zip');

function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) { return fallback; } }
function writeJson(filePath, data) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TXDRMAP/1.0', 'Accept': 'application/zip,*/*' }, timeout: 180000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function extractZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + fileNameLength).toString('utf8');
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const compressed = buffer.slice(dataStart, dataEnd);
    let data;
    if (compression === 0) data = compressed;
    else if (compression === 8) data = zlib.inflateRawSync(compressed);
    else data = Buffer.alloc(0);
    entries.push({ name, text: data.toString('utf8') });
    offset = dataEnd;
  }
  return entries;
}

function splitLine(line, delimiter) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) { out.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
    else current += ch;
  }
  out.push(current.trim().replace(/^"|"$/g, ''));
  return out;
}

function detectDelimiter(line) { return (line.match(/\|/g) || []).length > (line.match(/,/g) || []).length ? '|' : ','; }
function numberFrom(value) { const n = Number(String(value || '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : null; }
function dmsToDecimal(deg, min, sec, dir) { const d = numberFrom(deg), m = numberFrom(min) || 0, s = numberFrom(sec) || 0; if (!Number.isFinite(d)) return null; let v = Math.abs(d) + m / 60 + s / 3600; if (String(dir || '').toUpperCase().startsWith('S') || String(dir || '').toUpperCase().startsWith('W') || d < 0) v *= -1; return v; }

function rowsFromText(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines.shift(), delimiter).map(h => h.trim());
  return lines.map(line => { const values = splitLine(line, delimiter); const row = {}; headers.forEach((h, i) => row[h] = values[i]); return row; });
}

function normalizeHeaders(row) { const out = {}; Object.keys(row || {}).forEach(k => out[k.trim().toLowerCase().replace(/[^a-z0-9]/g, '')] = row[k]); return out; }
function get(row, keys) { const n = normalizeHeaders(row); for (const key of keys) if (n[key] !== undefined && n[key] !== '') return n[key]; return null; }

function coordinatesFromRow(row) {
  let lat = numberFrom(get(row, ['latdd','latitude','latitudedecimal','latdec','ddlat']));
  let lng = numberFrom(get(row, ['londd','longdd','longitude','longitudedecimal','londec','longdec','ddlon']));
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  lat = dmsToDecimal(get(row, ['latdeg','latdegrees','latd']), get(row, ['latmin','latminutes','latm']), get(row, ['latsec','latseconds','lats']), get(row, ['latdir','latdirection','latns']));
  lng = dmsToDecimal(get(row, ['londeg','longdeg','longdegrees','lond']), get(row, ['lonmin','longmin','longminutes','lonm']), get(row, ['lonsec','longsec','longseconds','lons']), get(row, ['londir','longdir','longdirection','lonew']));
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function rowToFeature(row, index) {
  const coords = coordinatesFromRow(row);
  if (!coords) return null;
  const lat = coords.lat, lng = coords.lng;
  if (lng < -106.7 || lng > -93.3 || lat < 25.7 || lat > 36.6) return null;
  return { type: 'Feature', id: get(row, ['registrationnumber','regnum','uniqueid']) || index, properties: row, geometry: { type: 'Point', coordinates: [lng, lat] } };
}

async function loadAsrRows() {
  let buffer;
  if (fs.existsSync(FCC_ASR_LOCAL_FILE)) {
    console.log('Reading local FCC ASR source: ' + FCC_ASR_LOCAL_FILE);
    buffer = fs.readFileSync(FCC_ASR_LOCAL_FILE);
  } else {
    console.log('Downloading FCC ASR source: ' + FCC_ASR_URL);
    buffer = await fetchBuffer(FCC_ASR_URL);
  }
  const entries = extractZipEntries(buffer);
  if (!entries.length) return rowsFromText(buffer.toString('utf8'));
  console.log('FCC ASR ZIP entries: ' + entries.map(e => e.name).join(', '));
  const preferred = entries.find(e => /^(CO|RA|EN)\.dat$/i.test(path.basename(e.name))) || entries.find(e => /\.dat$/i.test(e.name)) || entries[0];
  console.log('Parsing FCC ASR entry: ' + preferred.name);
  return rowsFromText(preferred.text);
}

async function fetchFccAsrTexasGeojson() { const rows = await loadAsrRows(); const features = rows.map(rowToFeature).filter(Boolean); console.log('Parsed FCC ASR rows: ' + rows.length + '; Texas features with coordinates: ' + features.length); return { type: 'FeatureCollection', features }; }
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
  texasGeojson.features.forEach(feature => { const point = getPoint(feature); const county = point ? findCounty(point, countiesGeo) : null; if (!county) return; towerCounts[county] = (towerCounts[county] || 0) + 1; });
  Object.keys(model).forEach(county => { const profile = ensureCountyProfile(model[county]); const registeredTowers = towerCounts[county] || 0; profile.registeredTowers = registeredTowers; profile.cellTowers = registeredTowers || profile.cellTowersEstimated; profile.towerDataSource = registeredTowers ? 'FCC_ASR' : 'ESTIMATED'; model[county] = profile; });
  const payload = { generatedAt: new Date().toISOString(), sourceNote: 'Texas county resources enriched with FCC ULS ASR tower records from r_tower.zip. registeredTowers is ASR structure count, not guaranteed carrier cell-site count.', towerSource: FCC_ASR_URL, towerFeatureCount: texasGeojson.features.length, fields: ['population','hospitals','hospitalBeds','fireStations','emsStations','policeDepartments','cellTowersEstimated','registeredTowers','cellTowers','towerDataSource','ercotZone'], counties: model };
  writeJson(RESOURCE_MODEL, payload);
  console.log('Wrote ' + OUTPUT_GEOJSON + ' with ' + texasGeojson.features.length + ' FCC ASR structures');
  console.log('Updated ' + RESOURCE_MODEL + ' with registered tower counts for ' + Object.keys(towerCounts).length + ' counties');
}

main().catch(error => { console.error(error); process.exit(1); });
