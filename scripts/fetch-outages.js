const fs = require("fs/promises");

const OUT = "outages.json";
const HISTORY_OUT = "history/outage-history.json";

const TDIS_URL = "https://services1.arcgis.com/fXHQyq63u0UsTeSM/arcgis/rest/services/Power_Outage_Data/FeatureServer/0/query";
const COUNTIES_URL = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";
const NWS_URL = "https://api.weather.gov/alerts/active?area=TX";
const HHS_URL = "https://data.cdc.gov/resource/mpgq-jmmr.json?$limit=12&jurisdiction=TX&$order=weekendingdate DESC";
const CENSUS_TX_COUNTY_URL = "https://api.census.gov/data/2024/acs/acs5?get=NAME,B01003_001E,B25010_001E&for=county:*&in=state:48";

function num(v) {
  const n = Number(String(v ?? 0).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json,*/*", "user-agent": "TXDRMAP Texas Resilience Dashboard" } });
  if (!res.ok) throw new Error(res.status + " " + res.statusText + " " + url);
  return res.json();
}

async function safeFetchJson(url, fallback) {
  try { return await fetchJson(url); } catch { return fallback; }
}

function keyCounty(name) {
  return String(name || "").replace(/ County$/i, "").trim().toLowerCase();
}

async function fetchCountyPopulation() {
  const rows = await fetchJson(CENSUS_TX_COUNTY_URL);
  const [header, ...data] = rows;
  const nameIdx = header.indexOf("NAME");
  const popIdx = header.indexOf("B01003_001E");
  const hhIdx = header.indexOf("B25010_001E");
  const byCounty = new Map();

  for (const row of data) {
    const county = String(row[nameIdx] || "").replace(/ County, Texas$/i, "");
    const population = num(row[popIdx]);
    const householdSize = parseFloat(row[hhIdx]) || 2.6;
    const estimatedCustomers = householdSize > 0 ? Math.round(population / householdSize) : Math.round(population * 0.4);
    byCounty.set(keyCounty(county), { population, householdSize, estimatedCustomers });
  }
  return byCounty;
}

function pointInRing(point, ring) {
  const [lat, lon] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    const intersect = ((yi > lat) !== (yj > lat)) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function countyForPoint(lat, lon, counties) {
  for (const f of counties.features || []) {
    if (f.properties.STATE !== "48") continue;
    const geom = f.geometry;
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      const ring = poly[0].map(([lng, lat]) => [lat, lng]);
      if (pointInRing([lat, lon], ring)) return f.properties.NAME;
    }
  }
  return null;
}

async function fetchAllTDIS() {
  const all = [];
  let offset = 0;
  const pageSize = 2000;
  while (true) {
    const url = TDIS_URL + "?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=" + pageSize + "&resultOffset=" + offset;
    const json = await fetchJson(url);
    const features = json.features || [];
    all.push(...features);
    if (features.length < pageSize) break;
    offset += pageSize;
    if (offset > 80000) break;
  }
  return all;
}

function getCustomersOut(p) {
  return num(p.CustomersOut ?? p.customersOut ?? p.CUSTOMERSOUT ?? p.CustomerCount ?? p.customersAffected ?? 0);
}

function severityScore(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "extreme") return 4;
  if (s === "severe") return 3;
  if (s === "moderate") return 2;
  if (s === "minor") return 1;
  return 0;
}

function urgencyScore(urgency) {
  const u = String(urgency || "").toLowerCase();
  if (u === "immediate") return 4;
  if (u === "expected") return 3;
  if (u === "future") return 2;
  if (u === "past") return 1;
  return 0;
}

function certaintyScore(certainty) {
  const c = String(certainty || "").toLowerCase();
  if (c === "observed") return 4;
  if (c === "likely") return 3;
  if (c === "possible") return 2;
  if (c === "unlikely") return 1;
  return 0;
}

function minutesUntil(value) {
  const t = new Date(value || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.round((t - Date.now()) / 60000);
}

function alertTypeFlags(event) {
  const e = String(event || "").toLowerCase();
  return {
    tornadoWarning: e.includes("tornado warning") ? 1 : 0,
    tornadoWatch: e.includes("tornado watch") ? 1 : 0,
    severeThunderstormWarning: e.includes("severe thunderstorm warning") ? 1 : 0,
    severeThunderstormWatch: e.includes("severe thunderstorm watch") ? 1 : 0,
    flashFloodWarning: e.includes("flash flood warning") ? 1 : 0,
    floodWarning: e.includes("flood warning") && !e.includes("flash flood") ? 1 : 0,
    winterStormWarning: e.includes("winter storm warning") || e.includes("ice storm warning") ? 1 : 0,
    highWindWarning: e.includes("high wind warning") || e.includes("extreme wind warning") ? 1 : 0,
    warning: e.includes("warning") ? 1 : 0,
    watch: e.includes("watch") ? 1 : 0,
    advisory: e.includes("advisory") ? 1 : 0
  };
}

function weatherWeight(alert) {
  const p = alert.properties || {};
  const severity = String(p.severity || "").toLowerCase();
  const event = String(p.event || "").toLowerCase();
  const urgency = String(p.urgency || "").toLowerCase();
  const certainty = String(p.certainty || "").toLowerCase();
  let score = 0;
  if (severity === "extreme") score += 18;
  else if (severity === "severe") score += 12;
  else if (severity === "moderate") score += 6;
  else if (severity === "minor") score += 2;
  if (urgency === "immediate") score += 10;
  else if (urgency === "expected") score += 6;
  if (certainty === "observed") score += 8;
  else if (certainty === "likely") score += 5;
  if (event.includes("ice storm") || event.includes("winter storm")) score += 26;
  else if (event.includes("high wind") || event.includes("extreme wind")) score += 24;
  else if (event.includes("tornado warning")) score += 30;
  else if (event.includes("severe thunderstorm warning")) score += 24;
  else if (event.includes("flash flood warning")) score += 14;
  else if (event.includes("severe thunderstorm watch")) score += 10;
  else if (event.includes("tornado watch")) score += 10;
  else if (event.includes("flood")) score += 6;
  else if (event.includes("storm")) score += 8;
  return Math.min(60, score);
}

function applyWeather(outages, alerts) {
  for (const alert of alerts) {
    const p = alert.properties || {};
    const area = String(p.areaDesc || "").toLowerCase();
    const weight = weatherWeight(alert);
    const flags = alertTypeFlags(p.event);
    const sevScore = severityScore(p.severity);
    const urgScore = urgencyScore(p.urgency);
    const certScore = certaintyScore(p.certainty);
    const expiresIn = minutesUntil(p.expires);

    for (const row of outages) {
      if (!area.includes(row.county.toLowerCase())) continue;

      row.weatherAlerts += 1;
      row.weatherRisk += weight;
      row.alertWarningCount += flags.warning;
      row.alertWatchCount += flags.watch;
      row.alertAdvisoryCount += flags.advisory;
      row.tornadoWarningCount += flags.tornadoWarning;
      row.tornadoWatchCount += flags.tornadoWatch;
      row.severeThunderstormWarningCount += flags.severeThunderstormWarning;
      row.severeThunderstormWatchCount += flags.severeThunderstormWatch;
      row.flashFloodWarningCount += flags.flashFloodWarning;
      row.floodWarningCount += flags.floodWarning;
      row.winterStormWarningCount += flags.winterStormWarning;
      row.highWindWarningCount += flags.highWindWarning;
      row.maxAlertSeverityScore = Math.max(row.maxAlertSeverityScore, sevScore);
      row.maxAlertUrgencyScore = Math.max(row.maxAlertUrgencyScore, urgScore);
      row.maxAlertCertaintyScore = Math.max(row.maxAlertCertaintyScore, certScore);
      if (expiresIn !== null && expiresIn >= 0) {
        row.soonestAlertExpirationMinutes = row.soonestAlertExpirationMinutes === null
          ? expiresIn
          : Math.min(row.soonestAlertExpirationMinutes, expiresIn);
      }
      row.weatherEvents.push({
        event: p.event || "Weather alert",
        severity: p.severity || "Unknown",
        urgency: p.urgency || "Unknown",
        certainty: p.certainty || "Unknown",
        headline: p.headline || "",
        effective: p.effective || null,
        expires: p.expires || null,
        weight
      });
    }
  }
}

function computeCurrentSeverity(row) {
  const percentOut = num(row.percentCustomersOut);
  let outageMagnitude = 0;
  if (percentOut >= 15) outageMagnitude = 40;
  else if (percentOut >= 10) outageMagnitude = 35;
  else if (percentOut >= 5) outageMagnitude = 28;
  else if (percentOut >= 2) outageMagnitude = 20;
  else if (percentOut >= 1) outageMagnitude = 14;
  else if (percentOut >= 0.5) outageMagnitude = 9;
  else if (percentOut >= 0.1) outageMagnitude = 4;
  else if (percentOut > 0) outageMagnitude = 1;
  const incidentScore = Math.min(20, row.incidents * 1.5);
  const largeClusterScore = Math.min(15, Math.log10(1 + row.maxSingleOutage) * 4);
  const weatherNowModifier = Math.min(10, row.weatherRisk * 0.1);
  return Math.round(Math.min(100, outageMagnitude + incidentScore + largeClusterScore + weatherNowModifier));
}

function computePredictedRisk(row, historyRow) {
  const weatherPressure = Math.min(35, row.weatherRisk * 0.25);
  const activeWarningPressure = Math.min(25,
    row.tornadoWarningCount * 12 +
    row.severeThunderstormWarningCount * 9 +
    row.highWindWarningCount * 10 +
    row.winterStormWarningCount * 10 +
    row.flashFloodWarningCount * 4 +
    row.maxAlertSeverityScore * 2 +
    row.maxAlertUrgencyScore * 2
  );
  const currentFragility = row.customersOut > 0 ? Math.min(20, Math.log10(1 + row.customersOut) * 5) : 0;
  const incidentFragility = row.incidents > 0 ? Math.min(10, row.incidents * 0.75) : 0;
  const trendPressure = historyRow && historyRow.change24h > 0 ? Math.min(10, Math.log10(1 + historyRow.change24h) * 3) : 0;
  return Math.round(Math.min(100, weatherPressure + activeWarningPressure + currentFragility + incidentFragility + trendPressure));
}

function computeRestorationDifficulty(row) {
  const outageLoad = Math.min(35, Math.log10(1 + row.customersOut) * 8);
  const incidentLoad = Math.min(15, row.incidents * 0.75);
  const weatherAccess = Math.min(15, row.weatherRisk * 0.12);
  return Math.round(Math.min(100, outageLoad + incidentLoad + weatherAccess));
}

function riskBand(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Elevated";
  if (score >= 25) return "Watch";
  return "Low";
}

async function readHistory() {
  try {
    const raw = await fs.readFile(HISTORY_OUT, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
  } catch { return []; }
}

async function writeHistory(snapshots) {
  await fs.mkdir("history", { recursive: true });
  await fs.writeFile(HISTORY_OUT, JSON.stringify({ updated: new Date().toISOString(), snapshots }, null, 2));
}

function buildHistorySummary(currentCountyRows, previousSnapshots) {
  const now = Date.now();
  const recent = previousSnapshots.filter(s => {
    const t = new Date(s.timestamp).getTime();
    return Number.isFinite(t) && now - t <= 7 * 24 * 60 * 60 * 1000;
  });
  function olderThan(ms) {
    return [...recent].filter(s => now - new Date(s.timestamp).getTime() >= ms).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  }
  const snap6 = olderThan(6 * 60 * 60 * 1000);
  const snap12 = olderThan(12 * 60 * 60 * 1000);
  const snap24 = olderThan(24 * 60 * 60 * 1000);
  const mapFrom = s => new Map((s?.counties || []).map(c => [c.county, c.customersOut || 0]));
  const by6 = mapFrom(snap6), by12 = mapFrom(snap12), by24 = mapFrom(snap24);
  const out = {};
  for (const row of currentCountyRows) {
    const trend6h = row.customersOut - (by6.get(row.county) || 0);
    const trend12h = row.customersOut - (by12.get(row.county) || 0);
    const trend24h = row.customersOut - (by24.get(row.county) || 0);
    const sevenDayPeak = Math.max(row.customersOut, ...recent.flatMap(s => (s.counties || []).filter(c => c.county === row.county).map(c => c.customersOut || 0)));
    out[row.county] = { county: row.county, change6h: trend6h, change12h: trend12h, change24h: trend24h, trendVelocity: trend6h - trend24h / 4, sevenDayPeak };
  }
  return out;
}

function baseCountyRow(county, pop) {
  return {
    state: "TX",
    county,
    utility: "TDIS Aggregate",
    population: pop.population || null,
    householdSize: pop.householdSize || null,
    estimatedCustomers: pop.estimatedCustomers || null,
    percentCustomersOut: 0,
    customersOut: 0,
    incidents: 0,
    maxSingleOutage: 0,
    weatherAlerts: 0,
    weatherRisk: 0,
    weatherEvents: [],
    alertWarningCount: 0,
    alertWatchCount: 0,
    alertAdvisoryCount: 0,
    tornadoWarningCount: 0,
    tornadoWatchCount: 0,
    severeThunderstormWarningCount: 0,
    severeThunderstormWatchCount: 0,
    flashFloodWarningCount: 0,
    floodWarningCount: 0,
    winterStormWarningCount: 0,
    highWindWarningCount: 0,
    maxAlertSeverityScore: 0,
    maxAlertUrgencyScore: 0,
    maxAlertCertaintyScore: 0,
    soonestAlertExpirationMinutes: null,
    roadClosures: 0,
    roadClosureRisk: 0,
    roadEvents: [],
    restorationDifficulty: 0,
    updated: new Date().toISOString(),
    source: "TDIS Power_Outage_Data + NWS"
  };
}

function snapshotCounty(row) {
  return {
    county: row.county,
    customersOut: row.customersOut,
    percentCustomersOut: row.percentCustomersOut,
    incidents: row.incidents,
    maxSingleOutage: row.maxSingleOutage,
    currentSeverity: row.currentSeverity,
    predictedRisk: row.predictedRisk,
    restorationDifficulty: row.restorationDifficulty,
    weatherAlerts: row.weatherAlerts,
    weatherRisk: row.weatherRisk,
    alertWarningCount: row.alertWarningCount || 0,
    alertWatchCount: row.alertWatchCount || 0,
    alertAdvisoryCount: row.alertAdvisoryCount || 0,
    tornadoWarningCount: row.tornadoWarningCount || 0,
    tornadoWatchCount: row.tornadoWatchCount || 0,
    severeThunderstormWarningCount: row.severeThunderstormWarningCount || 0,
    severeThunderstormWatchCount: row.severeThunderstormWatchCount || 0,
    flashFloodWarningCount: row.flashFloodWarningCount || 0,
    floodWarningCount: row.floodWarningCount || 0,
    winterStormWarningCount: row.winterStormWarningCount || 0,
    highWindWarningCount: row.highWindWarningCount || 0,
    maxAlertSeverityScore: row.maxAlertSeverityScore || 0,
    maxAlertUrgencyScore: row.maxAlertUrgencyScore || 0,
    maxAlertCertaintyScore: row.maxAlertCertaintyScore || 0,
    soonestAlertExpirationMinutes: row.soonestAlertExpirationMinutes,
    roadClosures: row.roadClosures || 0,
    roadClosureRisk: row.roadClosureRisk || 0,
    trend6h: row.trend6h || 0,
    trend12h: row.trend12h || 0,
    trend24h: row.trend24h || 0,
    trendVelocity: row.trendVelocity || 0,
    sevenDayPeak: row.sevenDayPeak || 0
  };
}

async function main() {
  const [counties, points, nws, hhsRows, countyPopulation] = await Promise.all([
    fetchJson(COUNTIES_URL),
    fetchAllTDIS(),
    safeFetchJson(NWS_URL, { features: [] }),
    safeFetchJson(HHS_URL, []),
    fetchCountyPopulation().catch(() => new Map())
  ]);

  const byCounty = new Map();
  const outagePoints = [];
  for (const f of points) {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates;
    if (!coords) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const customers = getCustomersOut(p);
    if (customers <= 0) continue;
    const county = countyForPoint(lat, lon, counties);
    if (!county) continue;
    const point = { county, customersOut: customers, outageCause: p.OutageCause || p.Cause || "Unknown", estimatedRestoration: p.EstimatedRestoration || p.ETR || null, lat, lon };
    outagePoints.push(point);
    if (!byCounty.has(county)) {
      const pop = countyPopulation.get(keyCounty(county)) || {};
      byCounty.set(county, baseCountyRow(county, pop));
    }
    const row = byCounty.get(county);
    row.customersOut += customers;
    row.incidents += 1;
    row.maxSingleOutage = Math.max(row.maxSingleOutage, customers);
  }

  const outages = [...byCounty.values()];
  const nwsAlerts = nws.features || [];
  applyWeather(outages, nwsAlerts);

  const previousSnapshots = await readHistory();
  const historyByCounty = buildHistorySummary(outages, previousSnapshots);
  for (const row of outages) {
    row.percentCustomersOut = row.estimatedCustomers > 0 ? Number(((row.customersOut / row.estimatedCustomers) * 100).toFixed(3)) : 0;
    const historyRow = historyByCounty[row.county] || { change6h: 0, change12h: 0, change24h: row.customersOut, trendVelocity: 0, sevenDayPeak: row.customersOut };
    row.currentSeverity = computeCurrentSeverity(row);
    row.predictedRisk = computePredictedRisk(row, historyRow);
    row.blendedPredictedRisk = row.predictedRisk;
    row.predictedRiskBand = riskBand(row.predictedRisk);
    row.restorationDifficulty = computeRestorationDifficulty(row);
    row.trend6h = historyRow.change6h;
    row.trend12h = historyRow.change12h;
    row.trend24h = historyRow.change24h;
    row.trendVelocity = historyRow.trendVelocity;
    row.sevenDayPeak = historyRow.sevenDayPeak;
    row.predictionExplanation = [
      row.weatherAlerts > 0 ? row.weatherAlerts + " weather alert(s)" : "No county-matched weather alerts",
      row.alertWarningCount > 0 ? row.alertWarningCount + " active warning(s)" : "No active warnings",
      row.customersOut > 0 ? row.customersOut.toLocaleString() + " current customers out" : "No current outage load",
      row.trend24h > 0 ? "24h trend worsening by " + row.trend24h.toLocaleString() : "24h trend stable or improving"
    ].join(" + ");
  }

  outages.sort((a, b) => b.currentSeverity - a.currentSeverity);
  const snapshot = {
    timestamp: new Date().toISOString(),
    totalCustomersOut: outages.reduce((s, o) => s + o.customersOut, 0),
    countiesImpacted: outages.length,
    counties: outages.map(snapshotCounty)
  };
  const newSnapshots = [...previousSnapshots, snapshot].filter(s => {
    const t = new Date(s.timestamp).getTime();
    return Number.isFinite(t) && Date.now() - t <= 7 * 24 * 60 * 60 * 1000;
  });
  await writeHistory(newSnapshots);

  const hospitalCapacity = { latest: null, trend: [] };
  if (Array.isArray(hhsRows)) {
    hospitalCapacity.trend = hhsRows.map(r => ({ weekEndingDate: r.weekendingdate, inpatientOccupancyPct: num(r.pctinptbedsocc), icuOccupancyPct: num(r.pcticubedsocc) })).filter(r => r.weekEndingDate).reverse();
    hospitalCapacity.latest = hospitalCapacity.trend[hospitalCapacity.trend.length - 1] || null;
  }

  const payload = {
    updated: new Date().toISOString(),
    sourceStatus: [
      { name: "TDIS Power Outage Data", ok: true, rawPointRecords: points.length, pointRecordsUsed: outagePoints.length, countyRecords: outages.length },
      { name: "NWS Active Alerts", ok: true, activeTexasAlerts: nwsAlerts.length, structuredAlertFields: true },
      { name: "History", ok: true, snapshots: newSnapshots.length }
    ],
    count: outages.length,
    countiesWithOutages: outages.length,
    totalCustomersOut: outages.reduce((s, o) => s + o.customersOut, 0),
    highestPredictedRisk: Math.max(0, ...outages.map(o => o.predictedRisk)),
    highestCurrentSeverity: Math.max(0, ...outages.map(o => o.currentSeverity)),
    highestRestorationDifficulty: Math.max(0, ...outages.map(o => o.restorationDifficulty || 0)),
    outages,
    outagePoints: outagePoints.sort((a, b) => b.customersOut - a.customersOut).slice(0, 5000),
    roadClosures: [],
    roadSummary: { count: 0, highRisk: 0, source: "not enabled in clean v1" },
    hospitalCapacity,
    gridStress: { ok: false, level: "UNKNOWN" },
    history: newSnapshots.slice(-48)
  };
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2));
  console.log("SUCCESS: " + payload.totalCustomersOut + " customers out, " + payload.count + " counties");
}

main().catch(async err => {
  const payload = { updated: new Date().toISOString(), sourceStatus: [{ name: "TXDRMAP pipeline", ok: false, error: err.message }], count: 0, totalCustomersOut: 0, highestPredictedRisk: 0, outages: [], outagePoints: [], roadClosures: [], hospitalCapacity: null, gridStress: null, history: [] };
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2));
  console.error(err);
  process.exitCode = 1;
});
