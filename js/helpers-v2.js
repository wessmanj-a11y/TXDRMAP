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

function colorByScore(v){
  const score = safeNum(v);
  if(score >= 80) return "#dc2626";  // Severe
  if(score >= 60) return "#f97316";  // High
  if(score >= 40) return "#facc15";  // Elevated
  if(score >= 20) return "#60a5fa";  // Watch
  return "#334155";                  // Low
}

function colorByOutagePercent(v){
  const pct = safeNum(v);
  if(pct >= 10) return "#dc2626";
  if(pct >= 5) return "#f97316";
  if(pct >= 1) return "#facc15";
  if(pct > 0) return "#60a5fa";
  return "#334155";
}

function colorByValue(v, max){
  // Fallback for non-risk values only. Risk modes should use activeColor().
  if(!v) return "#334155";
  const p = v / Math.max(1, max);
  if(p > .76) return "#dc2626";
  if(p > .52) return "#f97316";
  if(p > .30) return "#facc15";
  return "#60a5fa";
}

function activeColor(c, max){
  if(STATE.mode === "outage") return colorByOutagePercent(c.percentCustomersOut || 0);
  if(STATE.mode === "prediction") return colorByScore(c.blendedPredictedRisk || c.predictedRisk || 0);
  if(STATE.mode === "forecast") return colorByScore(c.forecastStormRisk || 0);
  if(STATE.mode === "weather") return colorByScore(c.weatherRisk || 0);
  return colorByScore(c.currentSeverity || 0);
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
