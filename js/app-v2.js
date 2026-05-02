async function loadAndRender(){
  await loadData();
  renderAll();
}

function renderAll(){
  setButtonState();
  renderMapLayers();
  renderMetrics();
  renderPanel();
  renderTopPanels();
  renderPointTable();
  renderRoadTable();
  renderOutageTrendChart();
  renderMLAccuracyChart();
  renderHospitalTrendChart();
}

async function start(){
  initMap();
  renderControls();
  await loadAndRender();
}

start().catch(err => {
  console.error(err);
  document.getElementById("sourceStatus").innerHTML = `Load failed: ${err.message}`;
});
