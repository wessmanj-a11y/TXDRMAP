function initMap(){
  STATE.map = L.map("map", { scrollWheelZoom:false }).setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
  setBaseMap("streets");
  STATE.radarLayer = L.tileLayer(CONFIG.openWeatherRadarUrl, { opacity:0.5 });
}

function setBaseMap(type){
  if(STATE.baseLayer) STATE.map.removeLayer(STATE.baseLayer);
  STATE.baseLayer = L.tileLayer(
    type === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution:"&copy; OpenStreetMap" }
  ).addTo(STATE.map);
}

function renderCounties(){
  if(STATE.countyLayer) STATE.map.removeLayer(STATE.countyLayer);

  const values = Object.values(STATE.countyData).map(activeValue);
  const max = Math.max(1, ...values);

  STATE.countyLayer = L.geoJSON(STATE.countyGeo, {
    filter: f => f.properties.STATE === CONFIG.stateFips,
    style: f => {
      const c = STATE.countyData[keyCounty(f.properties.NAME)] || {};
      const selected = keyCounty(f.properties.NAME) === keyCounty(STATE.selectedCounty);
      return {
        fillColor: activeColor(c, max),
        fillOpacity: selected ? .9 : .68,
        color: selected ? "#fff" : "rgba(255,255,255,.75)",
        weight: selected ? 3 : 1
      };
    },
    onEachFeature: (f, layer) => {
      const c = STATE.countyData[keyCounty(f.properties.NAME)];
      if(!c) return;
      layer.on("click", () => {
        STATE.selectedCounty = c.name;
        renderAll();
      });
      layer.bindTooltip(`${c.name} County · Severity ${c.currentSeverity} · Risk ${c.blendedPredictedRisk || c.predictedRisk || 0} · Forecast ${c.forecastStormRisk || 0}`);
    }
  }).addTo(STATE.map);

  STATE.countyLayer.bringToBack();
}

function renderPoints(){
  if(STATE.pointLayer) STATE.map.removeLayer(STATE.pointLayer);
  STATE.pointLayer = L.layerGroup().addTo(STATE.map);
  if(!STATE.showPoints) return;

  (STATE.outageData?.outagePoints || []).slice(0,1500).forEach(p => {
    if(!p.lat || !p.lon) return;
    const customers = safeNum(p.customersOut);
    const radius = 4 + Math.min(22, Math.sqrt(customers) / 10);
    const color = customers > 1000 ? "#dc2626" : customers > 200 ? "#f97316" : customers > 50 ? "#facc15" : "#22c55e";
    L.circleMarker([p.lat, p.lon], { radius, color:"#fff", fillColor:color, fillOpacity:.78, weight:1 })
      .bindPopup(`<strong>${p.county} County outage</strong><br>${customers.toLocaleString()} customers out<br>Cause: ${p.outageCause || "Unknown"}<br>ETR: ${p.estimatedRestoration || "Unknown"}`)
      .addTo(STATE.pointLayer);
  });
}

function renderWeather(){
  if(STATE.weatherLayer) STATE.map.removeLayer(STATE.weatherLayer);
  STATE.weatherLayer = L.layerGroup().addTo(STATE.map);
  if(!STATE.showWeatherPolys) return;

  STATE.nwsAlerts.forEach(alert => {
    if(!alert.geometry) return;
    const p = alert.properties || {};
    try{
      L.geoJSON(alert.geometry, { style:{ color:"#ef4444", weight:2, fillColor:"#ef4444", fillOpacity:.14 } })
        .bindPopup(`<strong>${p.event || "Weather alert"}</strong><br>Severity: ${p.severity || "Unknown"}<br>${p.headline || p.areaDesc || ""}`)
        .addTo(STATE.weatherLayer);
    } catch(e) {}
  });
}

function renderRoads(){
  if(STATE.roadLayer) STATE.map.removeLayer(STATE.roadLayer);
  STATE.roadLayer = L.layerGroup().addTo(STATE.map);
  if(!STATE.showRoads) return;

  (STATE.outageData?.roadClosures || []).slice(0,1000).forEach(r => {
    if(!r.lat || !r.lon) return;
    const risk = safeNum(r.risk);
    const color = risk >= 15 ? "#dc2626" : risk >= 10 ? "#f97316" : risk >= 5 ? "#facc15" : "#94a3b8";
    L.circleMarker([r.lat, r.lon], { radius:6, color:"#fff", fillColor:color, fillOpacity:.85, weight:1 })
      .bindPopup(`<strong>${r.road || r.route || "Road closure"}</strong><br>${r.county || "Unknown"} County<br>Risk: ${risk}<br>${r.description || ""}`)
      .addTo(STATE.roadLayer);
  });
}

function renderRadar(){
  if(STATE.showRadar){
    if(!STATE.map.hasLayer(STATE.radarLayer)) STATE.radarLayer.addTo(STATE.map);
  } else {
    if(STATE.map.hasLayer(STATE.radarLayer)) STATE.map.removeLayer(STATE.radarLayer);
  }
}

function renderMapLayers(){
  renderCounties();
  renderWeather();
  renderPoints();
  renderRoads();
  renderRadar();
}
