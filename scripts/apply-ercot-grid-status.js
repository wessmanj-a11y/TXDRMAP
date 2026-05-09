const fs = require("fs/promises");

const OUTAGES_FILE = "outages.json";
const ERCOT_SUPPLY_URL = "https://www.ercot.com/api/1/services/read/dashboards/supply-demand.json";
const ERCOT_OUTAGES_URL = "https://www.ercot.com/api/1/services/read/dashboards/generation-outages.json";

function num(value) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json,*/*",
      "user-agent": "TXDRMAP Texas Resilience Dashboard"
    }
  });
  if (!res.ok) throw new Error(res.status + " " + res.statusText + " " + url);
  return res.json();
}

async function safeFetchJson(url) {
  try {
    return await fetchJson(url);
  } catch (err) {
    return { __error: err.message };
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function pickLatestRecord(payload) {
  if (!payload || payload.__error) return null;
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload?.current)) return payload.current[0] || null;
  if (Array.isArray(payload?.records)) return payload.records[0] || null;
  return payload.data || payload.current || payload;
}

function findFirstNumberDeep(obj, candidateTerms) {
  const seen = new Set();
  const stack = [{ value: obj, path: "" }];

  while (stack.length) {
    const { value, path } = stack.pop();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);

    for (const [key, child] of Object.entries(value)) {
      const fullPath = path ? path + "." + key : key;
      const lower = fullPath.toLowerCase();
      const isCandidate = candidateTerms.some(term => lower.includes(term));
      const n = num(child);
      if (isCandidate && n > 0) return n;
      if (child && typeof child === "object") stack.push({ value: child, path: fullPath });
    }
  }

  return 0;
}

function pickFirstNumber(obj, keys, deepTerms) {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], obj);
    const n = num(value);
    if (n > 0) return n;
  }
  return findFirstNumberDeep(obj, deepTerms || []);
}

function buildGridStress(supplyPayload, outagesPayload) {
  const latest = pickLatestRecord(supplyPayload);
  const outageRecord = pickLatestRecord(outagesPayload);

  if (!latest) {
    return {
      ok: false,
      source: "ERCOT dashboards",
      level: "UNKNOWN",
      score: 0,
      note: supplyPayload?.__error || "ERCOT supply data unavailable or unexpected shape"
    };
  }

  const demand = pickFirstNumber(latest, [
    "demand",
    "load",
    "currentDemand",
    "current_load",
    "systemLoad",
    "system_load",
    "demandMW",
    "demand_mw",
    "forecast.systemWideDemand",
    "systemWideDemand"
  ], ["demand", "load"]);

  const available = pickFirstNumber(latest, [
    "availableCapacity",
    "available_capacity",
    "availableCap",
    "capacity",
    "availableMW",
    "available_mw",
    "supply",
    "generation",
    "currentGeneration",
    "supplyMW",
    "supply_mw"
  ], ["available", "capacity", "supply", "generation"]);

  const reserve = pickFirstNumber(latest, [
    "operatingReserve",
    "operating_reserve",
    "reserve",
    "reserves",
    "physicalResponsiveCapability",
    "prc"
  ], ["reserve", "responsivecapability", "prc"]);

  const outageMW = pickFirstNumber(outageRecord || {}, [
    "totalOutagesMW",
    "total_outages_mw",
    "totalOutageMW",
    "totalResourceMW",
    "outageMW",
    "mw"
  ], ["outage"]);

  let reservePct = null;
  if (demand > 0 && reserve > 0) {
    reservePct = (reserve / demand) * 100;
  } else if (demand > 0 && available > 0) {
    reservePct = ((available - demand) / demand) * 100;
  }

  let score = 0;
  if (reservePct === null) {
    score = 0;
  } else {
    if (reservePct < 15) score += 2;
    if (reservePct < 10) score += 3;
    if (reservePct < 5) score += 5;
  }

  if (outageMW > 10000) score += 1;
  if (outageMW > 20000) score += 2;

  let level = "LOW";
  if (score >= 3) level = "MODERATE";
  if (score >= 6) level = "HIGH";
  if (score >= 9) level = "CRITICAL";
  if (reservePct === null && !outageMW) level = "UNKNOWN";

  return {
    ok: reservePct !== null || outageMW > 0,
    source: "ERCOT dashboards",
    level,
    score,
    demandMW: demand || null,
    availableMW: available || null,
    operatingReserveMW: reserve || null,
    reservePct: reservePct === null ? null : Number(reservePct.toFixed(2)),
    outageMW: outageMW || null,
    timestamp: latest.timestamp || latest.datetime || latest.interval || latest.time || latest.lastUpdated || null
  };
}

function applyGridStressToCounties(payload, gridStress) {
  if (!Array.isArray(payload.outages)) return;
  const gridRiskBoost = gridStress.level === "CRITICAL" ? 12 : gridStress.level === "HIGH" ? 8 : gridStress.level === "MODERATE" ? 4 : 0;

  for (const row of payload.outages) {
    row.gridStressLevel = gridStress.level;
    row.gridStressScore = gridStress.score || 0;
    row.gridReservePct = gridStress.reservePct;

    if (gridRiskBoost > 0) {
      row.predictedRisk = Math.min(100, Math.round(num(row.predictedRisk) + gridRiskBoost));
      row.blendedPredictedRisk = Math.min(100, Math.round(num(row.blendedPredictedRisk || row.predictedRisk) + gridRiskBoost));
      row.predictionExplanation = [
        row.predictionExplanation || "",
        "ERCOT grid stress " + gridStress.level
      ].filter(Boolean).join(" + ");
    }
  }
}

async function main() {
  const payload = await readJson(OUTAGES_FILE, null);
  if (!payload) throw new Error("outages.json not found or unreadable");

  const [supplyPayload, outagesPayload] = await Promise.all([
    safeFetchJson(ERCOT_SUPPLY_URL),
    safeFetchJson(ERCOT_OUTAGES_URL)
  ]);

  const gridStress = buildGridStress(supplyPayload, outagesPayload);
  payload.gridStress = gridStress;
  applyGridStressToCounties(payload, gridStress);

  payload.sourceStatus = [
    ...(payload.sourceStatus || []).filter(s => s.name !== "ERCOT Grid Stress"),
    {
      name: "ERCOT Grid Stress",
      ok: !!gridStress.ok,
      level: gridStress.level,
      reservePct: gridStress.reservePct,
      demandMW: gridStress.demandMW,
      availableMW: gridStress.availableMW,
      operatingReserveMW: gridStress.operatingReserveMW,
      outageMW: gridStress.outageMW,
      note: gridStress.note || null
    }
  ];

  await fs.writeFile(OUTAGES_FILE, JSON.stringify(payload, null, 2));
  console.log("SUCCESS: ERCOT grid stress " + gridStress.level + " reservePct=" + (gridStress.reservePct ?? "unknown"));
}

main().catch(async err => {
  const payload = await readJson(OUTAGES_FILE, null);
  if (payload) {
    payload.gridStress = { ok: false, source: "ERCOT dashboards", level: "UNKNOWN", error: err.message };
    payload.sourceStatus = [
      ...(payload.sourceStatus || []).filter(s => s.name !== "ERCOT Grid Stress"),
      { name: "ERCOT Grid Stress", ok: false, level: "UNKNOWN", error: err.message }
    ];
    await fs.writeFile(OUTAGES_FILE, JSON.stringify(payload, null, 2));
  }
  console.error(err);
  process.exitCode = 1;
});
