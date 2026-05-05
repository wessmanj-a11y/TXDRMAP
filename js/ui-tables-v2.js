function renderTopPanels(){
  const counties = Object.values(STATE.countyData);

  const topSeverity = [...counties].sort((a,b)=>safeNum(b.currentSeverity)-safeNum(a.currentSeverity)).slice(0,10);
  const maxSeverity = Math.max(1, ...topSeverity.map(c=>safeNum(c.currentSeverity)));
  document.getElementById("topCounties").innerHTML = topSeverity.map(c => rankRow(c, c.currentSeverity, maxSeverity, `${trendArrow(c).icon} ${historicalBadge(c).label} · ${safeNum(c.customersOut).toLocaleString()} out · Forecast ${safeNum(c.forecastStormRisk)}`)).join("");

  const topPredicted = [...counties].sort((a,b)=>safeNum(b.blendedPredictedRisk || b.predictedRisk)-safeNum(a.blendedPredictedRisk || a.predictedRisk)).slice(0,10);
  const maxPredicted = Math.max(1, ...topPredicted.map(c=>safeNum(c.blendedPredictedRisk || c.predictedRisk)));
  document.getElementById("topPredicted").innerHTML = topPredicted.map(c => rankRow(c, c.blendedPredictedRisk || c.predictedRisk, maxPredicted, `${c.mlRiskBand || c.predictedRiskBand} · ${confidenceBadge(c).label} · ML ${safeNum(c.mlRiskScore)}`)).join("");

  const movers = [...counties].sort((a,b)=>safeNum(b.trendVelocity)-safeNum(a.trendVelocity)).slice(0,5);
  const improvers = [...counties].sort((a,b)=>safeNum(a.trendVelocity)-safeNum(b.trendVelocity)).slice(0,5);

  const moversHtml = `
    <div class="panel-title">Top Movers</div>
    ${movers.map(c => `<button class="rank-row" onclick="selectCountyV2('${String(c.name).replace(/'/g,"\\'")}')"><strong>${c.name}</strong><span style="float:right">${trendArrow(c).icon}</span><br><small>+${safeNum(c.trendVelocity).toLocaleString()} velocity · ${countySparkline(c)}</small></button>`).join("")}
    <div class="panel-title" style="margin-top:10px">Biggest Improvements</div>
    ${improvers.map(c => `<button class="rank-row" onclick="selectCountyV2('${String(c.name).replace(/'/g,"\\'")}')"><strong>${c.name}</strong><span style="float:right">${trendArrow(c).icon}</span><br><small>${safeNum(c.trendVelocity).toLocaleString()} velocity · ${countySparkline(c)}</small></button>`).join("")}
  `;

  const existing = document.getElementById("topMovers");
  if(existing) existing.innerHTML = moversHtml;
}

function rankRow(c, value, max, detail){
  return `<button class="rank-row" onclick="selectCountyV2('${String(c.name).replace(/'/g,"\\'")}')"><strong>${c.name}</strong><span style="float:right">${safeNum(value)}</span><br><small>${detail}</small><div class="bar"><span style="width:${Math.min(100,(safeNum(value)/max)*100)}%"></span></div></button>`;
}

function renderPointTable(){
  const rows = (STATE.outageData?.outagePoints || []).slice(0,8);
  document.getElementById("pointTable").innerHTML = rows.map(p => `<tr><td>${p.county}</td><td>${safeNum(p.customersOut).toLocaleString()}</td><td>${p.outageCause || "Unknown"}</td></tr>`).join("");
}

function renderRoadTable(){
  const rows = (STATE.outageData?.roadClosures || []).slice().sort((a,b)=>safeNum(b.risk)-safeNum(a.risk)).slice(0,8);
  document.getElementById("roadTable").innerHTML = rows.map(r => `<tr><td>${r.county || "Unknown"}</td><td>${r.road || r.route || "Unknown"}</td><td>${safeNum(r.risk)}</td></tr>`).join("");
}

window.selectCountyV2 = function(name){
  STATE.selectedCounty = name;
  renderAll();
};
