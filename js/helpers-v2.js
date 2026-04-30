function keyCounty(n){
  return String(n || "").replace(/ County$/i, "").trim().toLowerCase();
}

function safeNum(v){
  const n = Number(String(v ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(r.status);
  return r.json();
}

async function tryFetch(url){
  try { return await fetchJson(url); }
  catch { return null; }
}

function colorByValue(v, max){
  if(!v) return "#334155";
  const p = v / Math.max(1, max);
  if(p > .76) return "#dc2626";
  if(p > .52) return "#f97316";
  if(p > .30) return "#facc15";
  return "#60a5fa";
}

function activeValue(c){
  if(STATE.mode === "prediction") return c.blendedPredictedRisk || c.predictedRisk || 0;
  if(STATE.mode === "forecast") return c.forecastStormRisk || 0;
  if(STATE.mode === "outage") return c.percentCustomersOut || c.customersOut || 0;
  if(STATE.mode === "weather") return c.weatherRisk || 0;
  return c.currentSeverity || 0;
}

function priorityLabel(score){
  if(score >= 80) return "Immediate";
  if(score >= 60) return "High";
  if(score >= 40) return "Elevated";
  if(score >= 20) return "Watch";
  return "Routine";
}
