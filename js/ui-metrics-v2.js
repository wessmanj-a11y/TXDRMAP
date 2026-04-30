function renderMetrics(){
  const counties = Object.values(STATE.countyData);
  const totalCustomers = counties.reduce((s,c)=>s + safeNum(c.customersOut), 0);
  const impacted = counties.filter(c => safeNum(c.customersOut) > 0).length;
  const severe = counties.filter(c => safeNum(c.currentSeverity) >= 70).length;
  const topPredicted = Math.max(0, ...counties.map(c => safeNum(c.blendedPredictedRisk || c.predictedRisk)));
  const topForecast = Math.max(0, ...counties.map(c => safeNum(c.forecastStormRisk)));
  const trend = counties.reduce((s,c)=>s + safeNum(c.trend24h), 0);
  const hosp = STATE.outageData?.hospitalCapacity?.latest;
  const grid = STATE.outageData?.gridStress;

  const cards = [
    { id:"totalCustomers", value:totalCustomers.toLocaleString(), label:"Customers Out", sub:"current outage load", color:"red" },
    { id:"countyImpacted", value:impacted, label:"Counties Impacted", sub:"active outage records", color:"orange" },
    { id:"severeCounties", value:severe, label:"Severe Counties", sub:"severity score ≥ 70", color:"red" },
    { id:"highestPredicted", value:topPredicted, label:"Top Predicted Risk", sub:"rules + ML blend", color:"blue" },
    { id:"forecastThreat", value:topForecast, label:"Forecast Threat", sub:"next 12h weather risk", color:"purple" },
    { id:"trendMetric", value:(trend >= 0 ? "+" : "") + trend.toLocaleString(), label:"24h Trend", sub:"net outage change", color:"orange" },
    { id:"hospitalOccupancy", value:hosp?.inpatientOccupancyPct != null ? `${safeNum(hosp.inpatientOccupancyPct).toFixed(1)}%` : "—", label:"Hospital Occupancy", sub:"Texas inpatient beds", color:"green" },
    { id:"gridStress", value:grid?.level || "—", label:"Texas Grid Stress", sub:grid?.reservePct != null ? `Reserve ${safeNum(grid.reservePct).toFixed(1)}%` : "ERCOT reserve status", color:"green" }
  ];

  document.getElementById("metrics").innerHTML = cards.map(card => `
    <div class="card metric ${card.color}">
      <div class="value" id="${card.id}">${card.value}</div>
      <div class="label">${card.label}</div>
      <div class="sub">${card.sub}</div>
    </div>
  `).join("");
}
