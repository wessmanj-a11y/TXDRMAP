const fs = require('fs/promises');
const path = require('path');

const HISTORY_FILE = path.join('history', 'outage-history.json');
const FEMA_FILE = path.join('history', 'fema-county-risk.json');
const OUTPUT_FILE = path.join('history', 'county-baseline.json');

const COUNTY_GEO_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const TEXAS_STATE_FIPS = '48';

function num(value) {
  const n = Number(String(value ?? 0).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json, application/geo+json,*/*',
      'user-agent': 'TXDRMAP Texas Disaster Digital Twin'
    }
  });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ' ' + url);
  return res.json();
}

function keyCounty(name) {
  return String(name || '').replace(/ County$/i, '').trim().toLowerCase();
}

function flattenCoordinates(coords, out = []) {
  if (!Array.isArray(coords)) return out;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    out.push({ lon: coords[0], lat: coords[1] });
    return out;
  }
  for (const item of coords) flattenCoordinates(item, out);
  return out;
}

function countyAreaSqMi(geometry) {
  const points = flattenCoordinates(geometry?.coordinates || []);
  if (!points.length) return 900;
  const lats = points.map(p => p.lat);
  const lons = points.map(p => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const milesLat = Math.max(1, (maxLat - minLat) * 69);
  const avgLat = (minLat + maxLat) / 2;
  const milesLon = Math.max(1, (maxLon - minLon) * 69 * Math.cos((avgLat * Math.PI) / 180));
  return Math.round(milesLat * milesLon * 0.55);
}

const COUNTY_SEEDS = {
  harris: { population: 4835000, households: 1800000, hospitals: 80, hospitalBeds: 14500, fireStations: 240, policeDepartments: 45, emsStations: 90, cellTowers: 2400, businesses: 185000, medianIncome: 70000 },
  dallas: { population: 2610000, households: 1000000, hospitals: 55, hospitalBeds: 10500, fireStations: 170, policeDepartments: 35, emsStations: 70, cellTowers: 1500, businesses: 125000, medianIncome: 72000 },
  tarrant: { population: 2160000, households: 820000, hospitals: 45, hospitalBeds: 8200, fireStations: 150, policeDepartments: 35, emsStations: 60, cellTowers: 1200, businesses: 95000, medianIncome: 78000 },
  bexar: { population: 2070000, households: 760000, hospitals: 45, hospitalBeds: 8000, fireStations: 130, policeDepartments: 30, emsStations: 55, cellTowers: 1050, businesses: 85000, medianIncome: 66000 },
  travis: { population: 1370000, households: 560000, hospitals: 28, hospitalBeds: 5000, fireStations: 95, policeDepartments: 25, emsStations: 40, cellTowers: 850, businesses: 85000, medianIncome: 93000 },
  collin: { population: 1160000, households: 410000, hospitals: 18, hospitalBeds: 3100, fireStations: 85, policeDepartments: 25, emsStations: 35, cellTowers: 620, businesses: 65000, medianIncome: 115000 },
  denton: { population: 1000000, households: 360000, hospitals: 16, hospitalBeds: 2800, fireStations: 75, policeDepartments: 23, emsStations: 32, cellTowers: 580, businesses: 52000, medianIncome: 100000 },
  fort_bend: { aliases: ['fort bend'], population: 910000, households: 290000, hospitals: 14, hospitalBeds: 2300, fireStations: 60, policeDepartments: 20, emsStations: 28, cellTowers: 500, businesses: 42000, medianIncome: 110000 },
  hidalgo: { population: 900000, households: 260000, hospitals: 18, hospitalBeds: 3000, fireStations: 55, policeDepartments: 24, emsStations: 30, cellTowers: 480, businesses: 36000, medianIncome: 49000 },
  el_paso: { aliases: ['el paso'], population: 870000, households: 310000, hospitals: 14, hospitalBeds: 2800, fireStations: 60, policeDepartments: 16, emsStations: 28, cellTowers: 460, businesses: 33000, medianIncome: 56000 },
  montgomery: { population: 720000, households: 260000, hospitals: 12, hospitalBeds: 2100, fireStations: 55, policeDepartments: 18, emsStations: 24, cellTowers: 420, businesses: 31000, medianIncome: 89000 },
  williamson: { population: 700000, households: 250000, hospitals: 10, hospitalBeds: 1800, fireStations: 55, policeDepartments: 18, emsStations: 24, cellTowers: 410, businesses: 35000, medianIncome: 100000 },
  brazoria: { population: 390000, households: 140000, hospitals: 8, hospitalBeds: 1250, fireStations: 40, policeDepartments: 14, emsStations: 18, cellTowers: 260, businesses: 17000, medianIncome: 85000 },
  galveston: { population: 360000, households: 150000, hospitals: 8, hospitalBeds: 1500, fireStations: 42, policeDepartments: 14, emsStations: 18, cellTowers: 250, businesses: 18000, medianIncome: 78000 }
};

function seedForCounty(name) {
  const key = keyCounty(name).replace(/\s+/g, '_');
  if (COUNTY_SEEDS[key]) return COUNTY_SEEDS[key];
  return Object.values(COUNTY_SEEDS).find(seed => (seed.aliases || []).includes(keyCounty(name))) || {};
}

function estimatePopulation(name, latestCounty) {
  const seed = seedForCounty(name);
  if (seed.population) return seed.population;
  const out = num(latestCounty?.customersOut);
  const pct = num(latestCounty?.percentCustomersOut);
  if (out > 0 && pct > 0) {
    const customerBase = out / (pct / 100);
    const estimatedPop = Math.round(customerBase * 2.45);
    if (estimatedPop > 1000 && estimatedPop < 6000000) return estimatedPop;
  }
  return 45000;
}

function buildHistoricalMetrics(history) {
  const stats = new Map();
  for (const snapshot of history) {
    for (const county of snapshot.counties || []) {
      const key = keyCounty(county.county);
      if (!key) continue;
      if (!stats.has(key)) {
        stats.set(key, {
          county: county.county,
          samples: 0,
          totalOutages: 0,
          maxOutages: 0,
          totalPercentOut: 0,
          maxPercentOut: 0,
          totalPredictedRisk: 0,
          totalRestorationDifficulty: 0,
          latest: county
        });
      }
      const s = stats.get(key);
      const out = num(county.customersOut);
      const pct = num(county.percentCustomersOut);
      s.samples += 1;
      s.totalOutages += out;
      s.totalPercentOut += pct;
      s.maxOutages = Math.max(s.maxOutages, out);
      s.maxPercentOut = Math.max(s.maxPercentOut, pct);
      s.totalPredictedRisk += num(county.predictedRisk || county.blendedPredictedRisk);
      s.totalRestorationDifficulty += num(county.restorationDifficulty);
      s.latest = county;
    }
  }
  return stats;
}

function normalizeFema(payload) {
  const map = new Map();
  const rows = payload?.counties || payload?.countyRisk || payload?.rows || payload?.data || [];
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    const name = row.county || row.countyName || row.name;
    if (!name) continue;
    map.set(keyCounty(name), row);
  }
  return map;
}

function riskValue(row, keys, fallback = 0.35) {
  for (const key of keys) {
    const value = num(row?.[key]);
    if (value > 0) return value > 1 ? value / 100 : value;
  }
  return fallback;
}

function buildBaselineForCounty(feature, stats, femaMap) {
  const county = feature.properties.NAME;
  const key = keyCounty(county);
  const seed = seedForCounty(county);
  const latest = stats?.latest || {};
  const fema = femaMap.get(key) || {};
  const population = seed.population || estimatePopulation(county, latest);
  const households = seed.households || Math.max(400, Math.round(population / 2.55));
  const businesses = seed.businesses || Math.max(60, Math.round(population / 22));
  const scale = Math.max(population / 50000, 0.35);
  const landAreaSqMi = countyAreaSqMi(feature.geometry);

  const historicalAvgOutages = stats?.samples ? Math.round(stats.totalOutages / stats.samples) : 0;
  const historicalAvgPercentOut = stats?.samples ? Number((stats.totalPercentOut / stats.samples).toFixed(4)) : 0;
  const averagePredictedRisk = stats?.samples ? Number((stats.totalPredictedRisk / stats.samples).toFixed(2)) : 0;
  const averageRestorationDifficulty = stats?.samples ? Number((stats.totalRestorationDifficulty / stats.samples).toFixed(2)) : 0;

  const femaRiskScore = riskValue(fema, ['femaRiskScore', 'riskScore', 'riskIndexScore', 'nationalRiskIndex'], 0.35);
  const floodRisk = riskValue(fema, ['floodRisk', 'riverineFloodRisk', 'coastalFloodRisk'], seed.floodRisk || 0.35);
  const windRisk = riskValue(fema, ['windRisk', 'hurricaneRisk', 'strongWindRisk', 'femaStrongWindRisk'], seed.windRisk || 0.35);
  const wildfireRisk = riskValue(fema, ['wildfireRisk'], 0.20);

  const fireStations = seed.fireStations || Math.max(1, Math.round(scale * 7));
  const policeDepartments = seed.policeDepartments || Math.max(1, Math.round(scale * 3));
  const hospitals = seed.hospitals || Math.max(0, Math.round(scale * 1.4));
  const hospitalBeds = seed.hospitalBeds || Math.max(0, Math.round(hospitals * 85 + scale * 40));
  const emsStations = seed.emsStations || Math.max(1, Math.round(scale * 3));
  const cellTowers = seed.cellTowers || Math.max(5, Math.round(scale * 32));
  const majorSubstations = Math.max(1, Math.round(scale * 4));

  const powerFragility = Number(Math.min(1, Math.max(0.05,
    0.22 +
    femaRiskScore * 0.25 +
    windRisk * 0.18 +
    floodRisk * 0.12 +
    Math.min(0.2, historicalAvgPercentOut / 10)
  )).toFixed(3));

  return {
    county,
    fips: feature.id || feature.properties.GEO_ID || null,
    population,
    households,
    businesses,
    landAreaSqMi,
    populationDensityPerSqMi: Number((population / Math.max(landAreaSqMi, 1)).toFixed(2)),

    fireStations,
    policeDepartments,
    hospitals,
    hospitalBeds,
    emsStations,
    estimatedFirstResponderStations: fireStations + policeDepartments + emsStations,

    cellTowers,
    majorSubstations,
    powerFragility,

    femaRiskScore: Number(femaRiskScore.toFixed(3)),
    floodRisk: Number(floodRisk.toFixed(3)),
    windRisk: Number(windRisk.toFixed(3)),
    wildfireRisk: Number(wildfireRisk.toFixed(3)),

    historicalAvgOutages,
    historicalMaxOutages: stats?.maxOutages || 0,
    historicalAvgPercentOut,
    historicalMaxPercentOut: stats?.maxPercentOut || 0,
    averagePredictedRisk,
    averageRestorationDifficulty,

    medianIncome: seed.medianIncome || 61000,
    residentialPropertyValue: Math.round(households * 255000),
    commercialPropertyValue: Math.round(businesses * 425000),

    dataQuality: {
      population: seed.population ? 'seeded-major-county' : latest.customersOut ? 'estimated-from-outage-percent' : 'default-estimate',
      infrastructure: seed.hospitals ? 'seeded-major-county' : 'scaled-estimate',
      fema: femaMap.has(key) ? 'fema-file' : 'estimated',
      outageHistorySamples: stats?.samples || 0
    }
  };
}

async function main() {
  const [geo, historyPayload, femaPayload] = await Promise.all([
    fetchJson(COUNTY_GEO_URL),
    readJson(HISTORY_FILE, { snapshots: [] }),
    readJson(FEMA_FILE, {})
  ]);

  const history = Array.isArray(historyPayload.snapshots) ? historyPayload.snapshots : [];
  const historicalStats = buildHistoricalMetrics(history);
  const femaMap = normalizeFema(femaPayload);

  const counties = (geo.features || [])
    .filter(f => f.properties?.STATE === TEXAS_STATE_FIPS)
    .map(feature => buildBaselineForCounty(feature, historicalStats.get(keyCounty(feature.properties.NAME)), femaMap))
    .sort((a, b) => a.county.localeCompare(b.county));

  const output = {
    updated: new Date().toISOString(),
    state: 'Texas',
    countyCount: counties.length,
    methodology: {
      version: 'phase-1-county-digital-twin',
      purpose: 'Baseline county exposure, response capacity, infrastructure fragility, and historical outage profile for disaster scenario simulations.',
      limitations: [
        'Most non-major-county first responder, hospital, telecom, and property values are scaled estimates until HIFLD/FCC/Census datasets are integrated.',
        'County area is approximate from GeoJSON bounding geometry and should be replaced with Census land area when available.',
        'FEMA values are used when present; otherwise risk factors are estimated.'
      ],
      nextDataSources: [
        'US Census ACS county population, households, income, business patterns',
        'HIFLD hospitals, fire stations, EMS, law enforcement, cell towers',
        'FCC antenna/tower datasets',
        'FEMA National Risk Index county metrics',
        'ERCOT/utility infrastructure where available'
      ]
    },
    countyBaseline: counties
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Built county baseline for ${counties.length} Texas counties`);
  console.log(`Saved ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
