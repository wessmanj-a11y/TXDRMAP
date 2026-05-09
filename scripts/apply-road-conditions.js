const fs = require("fs/promises");

const OUTAGES_FILE = "outages.json";
const COUNTIES_URL = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";
const DRIVE_TEXAS_KEY = process.env.DRIVE_TEXAS_API_KEY;
const DRIVE_TEXAS_URL = DRIVE_TEXAS_KEY
  ? "https://api.drivetexas.org/api/conditions.geojson?key=" + encodeURIComponent(DRIVE_TEXAS_KEY)
  : null;

function num(value) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: "application/geo+json, application/json,*/*",
      "user-agent": "TXDRMAP Texas Resilience Dashboard"
    }
  });
  if (!res.ok) throw new Error(res.status + " " + res.statusText + " " + url.replace(/key=[^&]+/, "key=REDACTED"));
  return res.json();
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function keyCounty(name) {
  return String(name || "").replace(/ County$/i, "").trim().toLowerCase();
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

function flattenCoordinates(coords, out = []) {
  if (!Array.isArray(coords)) return out;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    out.push({ lon: coords[0], lat: coords[1] });
    return out;
  }
  for (const item of coords) flattenCoordinates(item, out);
  return out;
}

function representativePoint(geometry) {
  const points = flattenCoordinates(geometry?.coordinates || []);
  const valid = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!valid.length) return null;

  return {
    lat: valid.reduce((s, p) => s + p.lat, 0) / valid.length,
    lon: valid.reduce((s, p) => s + p.lon, 0) / valid.length
  };
}

function firstString(props, keys) {
  for (const key of keys) {
    const value = props?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function roadRiskScore(event) {
  const text = [event.type, event.status, event.title, event.description, event.road].join(" ").toLowerCase();
  let score = 0;

  if (text.includes("closed") || text.includes("closure")) score += 16;
  if (text.includes("all lanes") || text.includes("main lanes")) score += 8;
  if (text.includes("detour")) score += 6;
  if (text.includes("flood") || text.includes("high water")) score += 10;
  if (text.includes("ice") || text.includes("snow") || text.includes("sleet")) score += 9;
  if (text.includes("hazard")) score += 7;
  if (text.includes("crash") || text.includes("accident")) score += 5;
  if (text.includes("construction") || text.includes("maintenance") || text.includes("work zone")) score += 3;
  if (text.includes("delay")) score += 2;
  if (text.includes("shoulder")) score -= 4;

  return Math.max(0, Math.min(30, score));
}

function isImpactfulRoadEvent(event) {
  const text = [event.type, event.status, event.title, event.description, event.road].join(" ").toLowerCase();
  if (text.includes("shoulder") && !text.includes("closed")) return false;
  return event.risk >= 6;
}

function normalizeRoadEvent(feature, counties) {
  const props = feature.properties || {};
  const point = representativePoint(feature.geometry);
  if (!point) return null;

  const county = countyForPoint(point.lat, point.lon, counties);
  if (!county) return null;

  const title = firstString(props, ["headline", "title", "name", "event", "condition", "summary"]);
  const description = firstString(props, ["description", "details", "comments", "message", "fullDescription", "restriction"]);
  const road = firstString(props, ["road", "roadway", "route", "routeName", "highway", "facility", "name"]);
  const type = firstString(props, ["type", "eventType", "conditionType", "category", "event_category"]);
  const status = firstString(props, ["status", "condition", "state", "eventStatus"]);
  const id = firstString(props, ["id", "eventId", "conditionId", "globalId", "OBJECTID"]) || `${county}-${road}-${point.lat.toFixed(4)}-${point.lon.toFixed(4)}`;

  const event = {
    id,
    county,
    lat: Number(point.lat.toFixed(5)),
    lon: Number(point.lon.toFixed(5)),
    road: road || "Unknown road",
    type: type || "Road condition",
    status: status || "Unknown",
    title: title || type || "DriveTexas condition",
    description,
    startTime: firstString(props, ["startTime", "start_date", "begin", "created", "createdDate"]) || null,
    endTime: firstString(props, ["endTime", "end_date", "expires", "updated", "updatedDate"]) || null,
    source: "DriveTexas API",
    risk: 0
  };

  event.risk = roadRiskScore(event);
  return event;
}

async function main() {
  const outages = await readJson(OUTAGES_FILE, null);
  if (!outages) throw new Error("outages.json not found or unreadable");

  if (!DRIVE_TEXAS_URL) {
    outages.roadSummary = {
      count: 0,
      highRisk: 0,
      source: "DriveTexas API",
      ok: false,
      error: "DRIVE_TEXAS_API_KEY secret is not configured"
    };
    outages.sourceStatus = [...(outages.sourceStatus || []), outages.roadSummary];
    await fs.writeFile(OUTAGES_FILE, JSON.stringify(outages, null, 2));
    console.log("DriveTexas skipped: DRIVE_TEXAS_API_KEY secret is not configured");
    return;
  }

  const [counties, driveTexas] = await Promise.all([
    fetchJson(COUNTIES_URL),
    fetchJson(DRIVE_TEXAS_URL)
  ]);

  const rawFeatures = Array.isArray(driveTexas.features) ? driveTexas.features : [];
  const roadEvents = rawFeatures
    .map(feature => normalizeRoadEvent(feature, counties))
    .filter(Boolean)
    .filter(isImpactfulRoadEvent)
    .sort((a, b) => b.risk - a.risk);

  const byCounty = new Map((outages.outages || []).map(row => [keyCounty(row.county), row]));

  for (const row of byCounty.values()) {
    row.roadClosures = 0;
    row.roadClosureRisk = 0;
    row.roadEvents = [];
  }

  for (const event of roadEvents) {
    const row = byCounty.get(keyCounty(event.county));
    if (!row) continue;
    row.roadClosures += 1;
    row.roadClosureRisk += event.risk;
    row.roadEvents.push(event);
  }

  for (const row of byCounty.values()) {
    if (row.roadEvents.length > 20) row.roadEvents = row.roadEvents.slice(0, 20);
    const roadBoost = Math.min(15, (row.roadClosureRisk || 0) * 0.25);
    row.restorationDifficulty = Math.min(100, Math.round(num(row.restorationDifficulty) + roadBoost));
  }

  outages.roadClosures = roadEvents.slice(0, 1000);
  outages.roadSummary = {
    count: roadEvents.length,
    highRisk: roadEvents.filter(r => r.risk >= 15).length,
    source: "DriveTexas API",
    ok: true,
    rawFeatureCount: rawFeatures.length,
    updated: new Date().toISOString()
  };

  outages.sourceStatus = [
    ...(outages.sourceStatus || []).filter(s => s.name !== "DriveTexas API Road Conditions"),
    {
      name: "DriveTexas API Road Conditions",
      ok: true,
      rawFeatureCount: rawFeatures.length,
      impactfulRoadEvents: roadEvents.length,
      highRisk: outages.roadSummary.highRisk
    }
  ];

  await fs.writeFile(OUTAGES_FILE, JSON.stringify(outages, null, 2));
  console.log(`SUCCESS: merged ${roadEvents.length} impactful DriveTexas road events from ${rawFeatures.length} raw features`);
}

main().catch(async err => {
  const outages = await readJson(OUTAGES_FILE, null);
  if (outages) {
    outages.roadSummary = {
      count: 0,
      highRisk: 0,
      source: "DriveTexas API",
      ok: false,
      error: err.message
    };
    outages.sourceStatus = [...(outages.sourceStatus || []), { name: "DriveTexas API Road Conditions", ok: false, error: err.message }];
    await fs.writeFile(OUTAGES_FILE, JSON.stringify(outages, null, 2));
  }
  console.error(err);
  process.exitCode = 1;
});
