function renderControls(){
  const buttons = [
    ["severity", "Severity"],
    ["prediction", "Predicted Risk"],
    ["forecast", "Forecast Threat"],
    ["outage", "Outages"],
    ["weather", "Weather"],
    ["weatherPolys", "NWS Polygons"],
    ["points", "Outage Points"],
    ["radar", "Radar"],
    ["roads", "Road Closures"]
  ];

  document.getElementById("modeControls").innerHTML = buttons.map(([id,label]) => `<button id="${id}Btn">${label}</button>`).join("");

  document.getElementById("severityBtn").onclick = () => setMode("severity");
  document.getElementById("predictionBtn").onclick = () => setMode("prediction");
  document.getElementById("forecastBtn").onclick = () => setMode("forecast");
  document.getElementById("outageBtn").onclick = () => setMode("outage");
  document.getElementById("weatherBtn").onclick = () => setMode("weather");
  document.getElementById("weatherPolysBtn").onclick = () => { STATE.showWeatherPolys = !STATE.showWeatherPolys; renderAll(); };
  document.getElementById("pointsBtn").onclick = () => { STATE.showPoints = !STATE.showPoints; renderAll(); };
  document.getElementById("radarBtn").onclick = () => { STATE.showRadar = !STATE.showRadar; renderAll(); };
  document.getElementById("roadsBtn").onclick = () => { STATE.showRoads = !STATE.showRoads; renderAll(); };

  document.getElementById("refreshBtn").onclick = loadAndRender;
  document.getElementById("basemap").onchange = e => setBaseMap(e.target.value);
  setButtonState();
}

function setMode(mode){
  STATE.mode = mode;
  renderAll();
}

function setButtonState(){
  ["severity","prediction","forecast","outage","weather"].forEach(mode => {
    const b = document.getElementById(mode + "Btn");
    if(!b) return;
    b.classList.toggle("active", STATE.mode === mode);
    b.classList.toggle("inactive", STATE.mode !== mode);
  });

  const toggles = [
    ["weatherPolysBtn", STATE.showWeatherPolys],
    ["pointsBtn", STATE.showPoints],
    ["radarBtn", STATE.showRadar],
    ["roadsBtn", STATE.showRoads]
  ];

  toggles.forEach(([id,on]) => {
    const b = document.getElementById(id);
    if(!b) return;
    b.classList.toggle("active", on);
    b.classList.toggle("inactive", !on);
  });
}
