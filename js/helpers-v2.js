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
  if(score >= 95) return "#dc2626";
  if(score >= 75) return "#f97316";
  if(score >= 50) return "#facc15";
  if(score >= 20) return "#60a5fa";
  return "#334155";
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
  if(!v) return "#334155";
  const p = v / Math.max(1, max);
  if(p > .76) return "#dc2626";
  if(p > .52) return "#f97316";
  if(p > .30) return "#facc15";
  return "#60a5fa";
}

function countyRarityScore(c){
  return safeNum(c.historicalPercentileRank || c.historicalAnomalyScore || 0);
}

function activeColor(c, max){
  if(STATE.mode === "outage") return colorByOutagePercent(c.percentCustomersOut || 0);
  if(STATE.mode === "prediction") return colorByScore(c.blendedPredictedRisk || c.predictedRisk || 0);
  if(STATE.mode === "rarity") return colorByScore(countyRarityScore(c));
  if(STATE.mode === "forecast") return colorByScore(c.forecastStormRisk || 0);
  if(STATE.mode === "weather") return colorByScore(c.weatherRisk || 0);
  return colorByScore(c.currentSeverity || 0);
}

function activeValue(c){
  if(STATE.mode === "prediction") return c.blendedPredictedRisk || c.predictedRisk || 0;
  if(STATE.mode === "rarity") return countyRarityScore(c);
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

function trendArrow(c){
  const velocity = safeNum(c.trendVelocity);
  const trend6h = safeNum(c.trend6h);
  const trend24h = safeNum(c.trend24h);
  const signal = velocity || trend6h || trend24h;
  if(signal >= 500) return { icon:"↑↑", label:"Rapidly worsening", cls:"bad" };
  if(signal >= 100) return { icon:"↑", label:"Worsening", cls:"warn" };
  if(signal <= -500) return { icon:"↓↓", label:"Rapidly improving", cls:"good" };
  if(signal <= -100) return { icon:"↓", label:"Improving", cls:"good" };
  return { icon:"→", label:"Stable", cls:"neutral" };
}

function historicalBadge(c){
  const ratio = safeNum(c.outageVsHistoricalMonthlyP95 || c.outageVsHistoricalP95);
  const percentile = countyRarityScore(c);
  const anomaly = safeNum(c.historicalAnomalyScore);
  if(percentile >= 99 || ratio >= 2 || anomaly >= 90) return { label:"Extreme outlier", cls:"bad" };
  if(percentile >= 95 || ratio >= 1 || anomaly >= 75) return { label:"Rare event", cls:"warn" };
  if(percentile >= 75 || safeNum(c.outageVsHistoricalAvg) >= 2 || anomaly >= 45) return { label:"Above normal", cls:"watch" };
  return { label:"Normal", cls:"good" };
}

function rarityLabel(c){
  const p = countyRarityScore(c);
  if(p >= 99) return { title:"99th+ percentile", detail:"Extreme county outlier", cls:"bad", pct:p };
  if(p >= 95) return { title:"95th+ percentile", detail:"Rare county event", cls:"warn", pct:p };
  if(p >= 75) return { title:"75th+ percentile", detail:"Above normal", cls:"watch", pct:p };
  if(p > 0) return { title:`${Math.round(p)}th percentile`, detail:"Within normal range", cls:"good", pct:p };
  return { title:"No percentile", detail:"Awaiting historical match", cls:"neutral", pct:0 };
}

function rarityBar(c){
  const r = rarityLabel(c);
  return `<div class="rarity-card ${r.cls}"><div><span class="rarity-label">County rarity</span><strong>${r.title}</strong><small>${r.detail}</small></div><div class="rarity-meter"><span style="width:${Math.min(100, Math.max(0, r.pct))}%"></span></div></div>`;
}

function confidenceBadge(c){
  const ml = safeNum(c.mlRiskScore);
  const rule = safeNum(c.predictedRisk);
  const blended = safeNum(c.blendedPredictedRisk || c.predictedRisk);
  const agreement = Math.abs(ml - rule);
  const hasHistory = safeNum(c.outageVsHistoricalAvg) > 0 || safeNum(c.historicalAvgPercentOut) > 0;
  const hasForecast = safeNum(c.forecastStormRisk) > 0 || safeNum(c.forecastPrecipChanceMax12h) > 0;
  if(hasHistory && hasForecast && agreement <= 20 && blended >= 40) return { label:"High confidence", cls:"good" };
  if((hasHistory || hasForecast) && agreement <= 35) return { label:"Medium confidence", cls:"watch" };
  return { label:"Low confidence", cls:"neutral" };
}

function countySparkline(c){
  const vals = [safeNum(c.trend24h), safeNum(c.trend12h), safeNum(c.trend6h), safeNum(c.trendVelocity), safeNum(c.customersOut)];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const chars = "▁▂▃▄▅▆▇█";
  if(max === min) return "▁▁▁▁▁";
  return vals.map(v => chars[Math.max(0, Math.min(chars.length - 1, Math.round(((v - min) / (max - min)) * (chars.length - 1))))]).join("");
}

function topDrivers(c){
  const drivers = [];
  const rarity = rarityLabel(c);
  if(rarity.pct >= 75) drivers.push(`${rarity.title} county outage rarity`);
  if(safeNum(c.customersOut) > 0) drivers.push(`${safeNum(c.customersOut).toLocaleString()} customers out`);
  if(safeNum(c.outageVsHistoricalMonthlyP95) >= 1) drivers.push(`${safeNum(c.outageVsHistoricalMonthlyP95).toFixed(1)}x monthly p95`);
  else if(safeNum(c.outageVsHistoricalAvg) >= 2) drivers.push(`${safeNum(c.outageVsHistoricalAvg).toFixed(1)}x historical avg`);
  if(safeNum(c.forecastStormRisk) >= 40) drivers.push(`Forecast risk ${safeNum(c.forecastStormRisk)}`);
  if(safeNum(c.trend6h) > 100) drivers.push(`6h trend +${safeNum(c.trend6h).toLocaleString()}`);
  if(safeNum(c.weatherAlerts) > 0) drivers.push(`${safeNum(c.weatherAlerts)} active alerts`);
  if(safeNum(c.mlRiskScore) >= 45) drivers.push(`ML risk ${safeNum(c.mlRiskScore)}`);
  return drivers.slice(0,3);
}

function stormClass(c){
  const risk = safeNum(c.forecastStormRisk);
  if(risk >= 70) return "storm-critical";
  if(risk >= 45) return "storm-watch";
  return "";
}
