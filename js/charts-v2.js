function renderOutageTrendChart(){
  const canvas = document.getElementById("outageTrendChart");
  if(!canvas) return;
  const history = STATE.outageData?.history || [];
  if(!history.length){
    if(STATE.outageTrendChart) STATE.outageTrendChart.destroy();
    return;
  }

  const selectedKey = keyCounty(STATE.selectedCounty);
  const labels = history.map(s => new Date(s.timestamp).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }));
  const texasData = history.map(s => safeNum(s.totalCustomersOut));
  const countySeries = history.map(s => {
    const row = (s.counties || []).find(c => keyCounty(c.county) === selectedKey);
    return row ? safeNum(row.customersOut) : 0;
  });

  if(STATE.outageTrendChart) STATE.outageTrendChart.destroy();
  STATE.outageTrendChart = new Chart(canvas.getContext("2d"), chartConfig(labels, [
    { label:"Texas Total", data:texasData },
    { label:STATE.selectedCounty + " County", data:countySeries }
  ], false));
}

function renderHospitalTrendChart(){
  const canvas = document.getElementById("hospitalTrendChart");
  if(!canvas) return;
  const trend = STATE.outageData?.hospitalCapacity?.trend || [];
  if(!trend.length){
    if(STATE.hospitalTrendChart) STATE.hospitalTrendChart.destroy();
    return;
  }

  const labels = trend.map(r => new Date(r.weekEndingDate).toLocaleDateString([], { month:"short", day:"numeric" }));
  const inpatient = trend.map(r => safeNum(r.inpatientOccupancyPct));
  const icu = trend.map(r => safeNum(r.icuOccupancyPct));

  if(STATE.hospitalTrendChart) STATE.hospitalTrendChart.destroy();
  STATE.hospitalTrendChart = new Chart(canvas.getContext("2d"), chartConfig(labels, [
    { label:"Inpatient Occupancy %", data:inpatient },
    { label:"ICU Occupancy %", data:icu }
  ], true));
}

function chartConfig(labels, datasets, percent){
  return {
    type:"line",
    data:{ labels, datasets:datasets.map(ds => ({ ...ds, tension:.35, borderWidth:2, pointRadius:1 })) },
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:"#cbd5e1" } } },
      scales:{
        x:{ ticks:{ color:"#94a3b8", maxTicksLimit:8 }, grid:{ color:"rgba(255,255,255,.08)" } },
        y:{ min:percent ? 0 : undefined, max:percent ? 100 : undefined, ticks:{ color:"#94a3b8", callback:v => percent ? `${v}%` : Number(v).toLocaleString() }, grid:{ color:"rgba(255,255,255,.08)" } }
      }
    }
  };
}
