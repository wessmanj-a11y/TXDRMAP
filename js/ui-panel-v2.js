function renderPanel(){
  const c = STATE.countyData[keyCounty(STATE.selectedCounty)] || STATE.countyData["harris"] || Object.values(STATE.countyData)[0];
  if(!c) return;

  const trend = trendArrow(c);
  const history = historicalBadge(c);
  const confidence = confidenceBadge(c);
  const drivers = topDrivers(c);

  document.getElementById("selectedCountyPanel").innerHTML = `
    <div class="panel-title">Selected County</div>
    <h2>${c.name} County</h2>
    <span class="pill">${c.mlRiskBand || c.predictedRiskBand || priorityLabel(c.blendedPredictedRisk || c.predictedRisk)}</span>
    <div class="badge-row">
      <span class="context-pill ${trend.cls}">${trend.icon} ${trend.label}</span>
      <span class="context-pill ${history.cls}">${history.label}</span>
      <span class="context-pill ${confidence.cls}">${confidence.label}</span>
    </div>
    ${rarityBar(c)}
    <div class="sparkline-box"><strong>24h trajectory:</strong> <span class="sparkline">${countySparkline(c)}</span></div>

    <div class="mini-grid">
      <div class="mini"><strong>${safeNum(c.currentSeverity)}</strong><span>Current severity</span></div>
      <div class="mini"><strong>${safeNum(c.blendedPredictedRisk || c.predictedRisk)}</strong><span>Blended risk</span></div>
      <div class="mini"><strong>${safeNum(c.mlRiskScore)}</strong><span>ML risk score</span></div>
      <div class="mini"><strong>${safeNum(c.historicalPercentileRank)}</strong><span>Historical percentile</span></div>
      <div class="mini"><strong>${safeNum(c.forecastStormRisk)}</strong><span>Forecast storm risk</span></div>
      <div class="mini"><strong>${safeNum(c.forecastWindMax12h)} mph</strong><span>Max wind next 12h</span></div>
      <div class="mini"><strong>${safeNum(c.forecastPrecipChanceMax12h)}%</strong><span>Rain chance next 12h</span></div>
      <div class="mini"><strong>${safeNum(c.customersOut).toLocaleString()}</strong><span>Customers out</span></div>
      <div class="mini"><strong>${safeNum(c.percentCustomersOut).toFixed(3)}%</strong><span>Percent customers out</span></div>
      <div class="mini"><strong>${safeNum(c.incidents)}</strong><span>Outage incidents</span></div>
      <div class="mini"><strong>${safeNum(c.trend24h) >= 0 ? "+" : ""}${safeNum(c.trend24h).toLocaleString()}</strong><span>24h trend</span></div>
      <div class="mini"><strong>${safeNum(c.outageVsHistoricalAvg).toFixed(2)}x</strong><span>Vs historical avg</span></div>
    </div>

    <div class="explain"><strong>Why this county:</strong><br>${drivers.length ? drivers.map(d => `• ${d}`).join('<br>') : '• No dominant drivers detected.'}<br><br><strong>Prediction explanation:</strong><br>${c.predictionExplanation || "No prediction explanation available."}<br><br><strong>Forecast:</strong> ${c.forecastSummary12h || "No forecast summary available."}</div>
    <div id="countyIncidentsList">${renderCountyIncidents(c)}</div>
  `;
}

function renderCountyIncidents(c){
  const items = [
    ...(c.points || []).slice(0,5).map(p => ({ type:"OUTAGE", title:`${safeNum(p.customersOut).toLocaleString()} customers out`, detail:`Cause: ${p.outageCause || "Unknown"} · ETR: ${p.estimatedRestoration || "Unknown"}` })),
    ...(c.weatherEvents || []).slice(0,5).map(w => ({ type:"WEATHER", title: typeof w === "string" ? w : w.event, detail: typeof w === "string" ? "Active NWS alert" : (w.headline || w.severity || "Weather alert") }))
  ];

  return items.length
    ? items.map(i => `<div class="incident"><div class="incident-top"><span>${i.type}</span></div><h3>${i.title}</h3><p>${i.detail}</p></div>`).join("")
    : `<div class="incident"><p>No detailed incidents loaded for this county.</p></div>`;
}
