const fs = require('fs');
const path = require('path');

const GEO_PATH = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');
const RESOURCE_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'data', 'texas_county_baseline.json');

const TEXAS_COUNTY_POPULATION_FALLBACK = {
  Harris: 4835697, Dallas: 2606858, Tarrant: 2154576, Bexar: 2059865, Travis: 1329588,
  Collin: 1194145, Denton: 1014212, FortBend: 916778, Hidalgo: 888367, ElPaso: 868763,
  Montgomery: 711354, Williamson: 697191, Cameron: 431275, Brazoria: 389314, Bell: 388386,
  Galveston: 366949, Nueces: 353178, McLennan: 269708, Webb: 269124, Hays: 269225,
  Jefferson: 253704, Smith: 244730, Brazos: 242014, Ellis: 230953, Johnson: 197723,
  Comal: 190980, Parker: 184840, Guadalupe: 184033, Midland: 176832, Ector: 169384,
  Grayson: 149552, Kaufman: 172366, Randall: 143854, Taylor: 149712, Wichita: 130675,
  TomGreen: 121619, Rockwall: 130983, Lubbock: 323610, Potter: 116547, Gregg: 124239,
  Victoria: 92740, Orange: 84987, Bastrop: 106432, Coryell: 89900, Liberty: 99980,
  Hunt: 108282, Harrison: 69641, Nacogdoches: 64902, Angelina: 86395, Hood: 68722,
  Henderson: 85621, Kerr: 53955, Burnet: 56017, VanZandt: 65581, Anderson: 57863,
  Wise: 76211, Navarro: 55865, ValVerde: 47668, Uvalde: 24384, Medina: 54565,
  Kendall: 51783, Wilson: 56895, Atascosa: 51667, Bee: 31537, JimWells: 38440,
  Kleberg: 31040, SanPatricio: 68633, Aransas: 24068, Matagorda: 36646, Wharton: 41909,
  Austin: 31133, Washington: 36795, Fayette: 25255, Colorado: 20928, Lavaca: 20426,
  DeWitt: 19952, Gonzales: 20251, Caldwell: 48276, Lee: 18366, Milam: 25183,
  Robertson: 17074, Leon: 18042, Madison: 14310, Walker: 79429, SanJacinto: 29504,
  Polk: 53870, Trinity: 13783, Houston: 22985, Cherokee: 52246, Rusk: 54374,
  Panola: 22136, Shelby: 23814, Sabine: 10062, SanAugustine: 7886, Jasper: 32574,
  Newton: 12189, Tyler: 20250, Hardin: 58756, Chambers: 51784, Waller: 64027,
  Grimes: 30106, Burleson: 18613, Limestone: 22464, Freestone: 19589, Hill: 36773,
  Bosque: 18953, Somervell: 9704, Erath: 45980, Comanche: 14013, Brown: 38011,
  Mills: 4595, Hamilton: 8580, Lampasas: 22650, SanSaba: 5730, Llano: 22203,
  Mason: 3943, Gillespie: 27847, Blanco: 13397, LlanoCounty: 22203, Real: 2765,
  Bandera: 24519, Edwards: 1422, Kinney: 3135, Maverick: 57940, Zavala: 9534,
  Frio: 18091, LaSalle: 6809, Dimmit: 8155, McMullen: 600, LiveOak: 11537,
  Karnes: 14824, Goliad: 7022, Refugio: 6741, Calhoun: 19950, Jackson: 14839,
  JimHogg: 4838, Brooks: 7093, Kenedy: 352, Starr: 65761, Zapata: 14075,
  Willacy: 20059, Duval: 9652, ZapataCounty: 14075, Moore: 21768, Hansford: 5128,
  Ochiltree: 9723, Lipscomb: 2893, Hemphill: 3382, Roberts: 827, Hutchinson: 20446,
  Carson: 5970, Gray: 21333, Wheeler: 5017, Donley: 3325, Collingsworth: 2652,
  Childress: 6610, Hall: 2810, Briscoe: 1397, Swisher: 7391, Castro: 7515,
  Parmer: 9534, DeafSmith: 18583, Oldham: 1861, Hartley: 5459, Dallam: 7175,
  Sherman: 2809, Cimarron: 2150, Armstrong: 1848, PotterCounty: 116547, RandallCounty: 143854,
  Bailey: 6972, Lamb: 12901, Hale: 32347, Floyd: 5639, Motley: 1063,
  Cottle: 1380, Foard: 1095, Hardeman: 3549, Wilbarger: 12542, Baylor: 3409,
  Archer: 9057, Clay: 10461, Montague: 20287, Cooke: 43160, Jack: 8754,
  Young: 17900, Throckmorton: 1530, Haskell: 5416, Knox: 3406, King: 265,
  Dickens: 1768, Crosby: 5157, LubbockCounty: 323610, Hockley: 21109, Cochran: 2547,
  Yoakum: 7335, Terry: 12008, Lynn: 5603, Garza: 5816, Kent: 753,
  Stonewall: 1245, Jones: 19898, Shackelford: 3105, Stephens: 9365, PaloPinto: 28725,
  HoodCounty: 68722, ParkerCounty: 184840, Eastland: 18010, Callahan: 13645, TaylorCounty: 149712,
  Nolan: 14312, Fisher: 3672, Scurry: 16921, Borden: 631, Dawson: 12413,
  Gaines: 22278, Andrews: 18610, Martin: 5237, Howard: 34860, Mitchell: 8649,
  Coke: 3234, Runnels: 9532, Coleman: 7808, McCulloch: 7667, Concho: 3830,
  Irion: 1550, Sterling: 1372, Glasscock: 1213, Reagan: 3326, Upton: 3339,
  Crane: 4675, Ward: 11644, Winkler: 7805, Loving: 64, Reeves: 14901,
  Pecos: 15379, Terrell: 726, Crockett: 3098, Schleicher: 2447, Sutton: 3372,
  Kimble: 4304, Menard: 1942, McCullochCounty: 7667, TomGreenCounty: 121619, ConchoCounty: 3830,
  Presidio: 6131, Brewster: 9584, JeffDavis: 1975, Culberson: 2193, Hudspeth: 3287,
  SuttonCounty: 3372, ValVerdeCounty: 47668, ElPasoCounty: 868763
};

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
  { zone: 'Coast', counties: ['Harris','Galveston','Brazoria','Fort Bend','Montgomery','Jefferson','Orange','Nueces','Chambers'] },
  { zone: 'South', counties: ['Bexar','Hidalgo','Cameron','Webb','Maverick','Starr','Zapata','Willacy'] },
  { zone: 'West', counties: ['El Paso','Midland','Ector','Lubbock','Potter','Randall','Reeves','Pecos'] },
  { zone: 'Central', counties: ['Travis','Williamson','Hays','Bell','McLennan','Bastrop','Blanco','Caldwell','Burnet','Comal','Guadalupe'] }
];

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { return fallback; } }
function countyName(feature) { const p = feature.properties || {}; return String(p.NAME || p.NAMELSAD || '').replace(/ County$/i, '').trim(); }
function normalizeCountyName(name) { return String(name || '').replace(/ County$/i, '').replace(/\s+/g, '').replace(/[^A-Za-z]/g, '').trim(); }
function numberFrom(value) { const num = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(num) && num > 0 ? num : null; }

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

function assignErcotZone(county) { for (const rule of ERCOT_ZONE_RULES) if (rule.counties.includes(county)) return rule.zone; return 'Unknown'; }

function derivePopulation(record) {
  if (!record || typeof record !== 'object') return null;
  const directFields = ['population','Population','POPULATION','pop','POP','countyPopulation','totalPopulation','estimatedPopulation','populationEstimate','residents','people'];
  for (const field of directFields) { const num = numberFrom(record[field]); if (num) return Math.round(num); }
  const customerFields = ['customers','totalCustomers','utilityCustomers','customerCount','customersTracked','totalMeters','meters','accounts'];
  for (const field of customerFields) { const num = numberFrom(record[field]); if (num) return Math.round(num * 2.6); }
  return null;
}

function deriveCountyName(record) { if (!record || typeof record !== 'object') return null; return record.county || record.County || record.COUNTY || record.countyName || record.name || record.NAME || null; }

function ingestPopulationObject(obj, map) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(item => { const county = deriveCountyName(item); const population = derivePopulation(item); if (county && population) map[normalizeCountyName(county)] = population; }); return; }
  [obj.counties, obj.Counties, obj.data, obj.records, obj.features].filter(Boolean).forEach(container => ingestPopulationObject(container, map));
  Object.keys(obj).forEach(key => { const value = obj[key]; if (!value || typeof value !== 'object') return; const population = derivePopulation(value); if (population) map[normalizeCountyName(key)] = population; });
}

function buildPopulationMap() {
  const map = {};
  Object.keys(TEXAS_COUNTY_POPULATION_FALLBACK).forEach(county => { map[normalizeCountyName(county)] = TEXAS_COUNTY_POPULATION_FALLBACK[county]; });
  POPULATION_SOURCE_PATHS.forEach(filePath => { if (!fs.existsSync(filePath)) return; console.log('Reading population source: ' + filePath); ingestPopulationObject(readJson(filePath, null), map); });
  console.log('Loaded population entries: ' + Object.keys(map).length);
  return map;
}

async function main() {
  const geo = readJson(GEO_PATH, null);
  if (!geo) throw new Error('Missing texas_counties.geojson');
  const resources = readJson(RESOURCE_PATH, { counties: {} });
  const populationMap = buildPopulationMap();
  const counties = {};
  let fallbackCount = 0;

  (geo.features || []).forEach(feature => {
    const county = countyName(feature);
    if (!county) return;
    const normalized = normalizeCountyName(county);
    const resource = (resources.counties || {})[county] || {};
    const resourcePopulation = numberFrom(resource.population);
    const sourcePopulation = populationMap[normalized];
    const population = sourcePopulation || (resourcePopulation && resourcePopulation !== 120000 ? resourcePopulation : null) || 120000;
    if (population === 120000 && !sourcePopulation) fallbackCount += 1;
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
    sourceNote: 'Texas county baseline enriched from committed county population fallback, optional TXDRMAP population sources, HIFLD resource layers, estimated cell towers, and ERCOT regional assignment. No external population API is called.',
    populationFallbackCount: fallbackCount,
    populationSources: POPULATION_SOURCE_PATHS,
    fields: ['population','hospitals','hospitalBeds','fireStations','emsStations','policeDepartments','cellTowers','ercotZone'],
    counties
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  fs.writeFileSync(RESOURCE_PATH, JSON.stringify(payload, null, 2));
  console.log('Built Texas county baseline for ' + Object.keys(counties).length + ' counties. Remaining fallback population counties: ' + fallbackCount);
}

main().catch(error => { console.error(error); process.exit(1); });
