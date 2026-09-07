const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(process.cwd(), 'history');
const OUT_FILE = path.join(OUT_DIR, 'spc-outlook.json');
const SPC_URL = 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson';

const CATEGORY_SCORES = {
  TSTM: 10,
  MRGL: 25,
  SLGT: 45,
  ENH: 65,
  MDT: 85,
  HIGH: 100
};

const TEXAS_BBOX = {
  minLon: -106.7,
  maxLon: -93.3,
  minLat: 25.5,
  maxLat: 36.6
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeCounty(name) {
  return String(name || '')
    .replace(/county/gi, '')
    .replace(/parish/gi, '')
    .replace(/\./g, '')
    .trim()
    .toLowerCase();
}

function pointInTexas([lon, lat]) {
  return lon >= TEXAS_BBOX.minLon && lon <= TEXAS_BBOX.maxLon && lat >= TEXAS_BBOX.minLat && lat <= TEXAS_BBOX.maxLat;
}

function polygonTouchesTexas(geometry) {
  if (!geometry || !geometry.coordinates) return false;

  const scanCoords = (coords) => {
    for (const item of coords) {
      if (typeof item[0] === 'number' && typeof item[1] === 'number') {
        if (pointInTexas(item)) return true;
      } else if (Array.isArray(item)) {
        if (scanCoords(item)) return true;
      }
    }
    return false;
  };

  return scanCoords(geometry.coordinates);
}

function countyNamesFromFeature(feature) {
  const props = feature.properties || {};
  const candidates = [
    props.NAME,
    props.name,
    props.COUNTY,
    props.county,
    props.AREA,
    props.area,
    props.LOCATION,
    props.location,
    props.DESC,
    props.description
  ].filter(Boolean);

  const names = new Set();

  for (const candidate of candidates) {
    const text = String(candidate);
    const matches = text.match(/[A-Za-z\-\s]+ County/g);
    if (matches) {
      for (const match of matches) {
        names.add(normalizeCounty(match));
      }
    } else {
      const cleaned = normalizeCounty(text);
      if (cleaned) names.add(cleaned);
    }
  }

  return [...names].filter(Boolean);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TXDRMAP/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`SPC fetch failed: ${response.status}`);
  }

  return response.json();
}

async function main() {
  ensureDir(OUT_DIR);

  const geojson = await fetchJson(SPC_URL);
  const countyMap = {};

  for (const feature of geojson.features || []) {
    const category = feature.properties?.LABEL || feature.properties?.label || feature.properties?.DN;
    const score = CATEGORY_SCORES[category] || 0;

    if (!score) continue;
    if (!polygonTouchesTexas(feature.geometry)) continue;

    const counties = countyNamesFromFeature(feature);

    for (const county of counties) {
      if (!county) continue;

      if (!countyMap[county] || score > countyMap[county].spcRisk) {
        countyMap[county] = {
          spcRisk: score,
          spcCategory: category
        };
      }
    }
  }

  const payload = {
    updated: new Date().toISOString(),
    source: SPC_URL,
    scope: 'SPC Day 1 Convective Outlook',
    countyCount: Object.keys(countyMap).length,
    counties: countyMap
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));

  console.log(`Saved SPC outlook for ${payload.countyCount} Texas counties`);
}

main().catch((error) => {
  console.error('SPC ingestion failed:', error.message);
  process.exit(1);
});
