function initCounties(){
  STATE.countyData = {};

  STATE.countyGeo.features
    .filter(f => f.properties.STATE === CONFIG.stateFips)
    .forEach(f => {
      const name = f.properties.NAME;
      STATE.countyData[keyCounty(name)] = {
        name,
        customersOut: 0,
        percentCustomersOut: 0,
        incidents: 0,
        maxSingleOutage: 0,
        currentSeverity: 0,
        predictedRisk: 0,
        blendedPredictedRisk: 0,
        mlRiskScore: 0,
        mlRiskBand: null,
        predictedRiskBand: "Low",
        trend6h: 0,
        trend12h: 0,
        trend24h: 0,
        trendVelocity: 0,
        sevenDayPeak: 0,
        weatherAlerts: 0,
        weatherRisk: 0,
        weatherEvents: [],
        forecastWindMax6h: 0,
        forecastWindMax12h: 0,
        forecastPrecipChanceMax12h: 0,
        forecastStormRisk: 0,
        forecastSummary12h: null,
        roadClosures: 0,
        roadClosureRisk: 0,
        roadEvents: [],
        restorationDifficulty: 0,
        predictionExplanation: "",
        points: []
      };
    });
}

function processOutages(){
  const rows = STATE.outageData?.outages || [];

  rows.forEach(o => {
    const key = keyCounty(o.county);
    const c = STATE.countyData[key];
    if(!c) return;

    c.customersOut = safeNum(o.customersOut);
    c.percentCustomersOut = safeNum(o.percentCustomersOut);
    c.incidents = safeNum(o.incidents);
    c.maxSingleOutage = safeNum(o.maxSingleOutage);
    c.currentSeverity = safeNum(o.currentSeverity);
    c.predictedRisk = safeNum(o.predictedRisk);
    c.blendedPredictedRisk = safeNum(o.blendedPredictedRisk || o.predictedRisk);
    c.mlRiskScore = safeNum(o.mlRiskScore);
    c.mlRiskBand = o.mlRiskBand || null;
    c.predictedRiskBand = o.predictedRiskBand || c.predictedRiskBand;
    c.trend6h = safeNum(o.trend6h);
    c.trend12h = safeNum(o.trend12h);
    c.trend24h = safeNum(o.trend24h);
    c.trendVelocity = safeNum(o.trendVelocity);
    c.sevenDayPeak = safeNum(o.sevenDayPeak);
    c.weatherAlerts = safeNum(o.weatherAlerts);
    c.weatherRisk = safeNum(o.weatherRisk);
    c.weatherEvents = o.weatherEvents || [];
    c.forecastWindMax6h = safeNum(o.forecastWindMax6h);
    c.forecastWindMax12h = safeNum(o.forecastWindMax12h);
    c.forecastPrecipChanceMax12h = safeNum(o.forecastPrecipChanceMax12h);
    c.forecastStormRisk = safeNum(o.forecastStormRisk);
    c.forecastSummary12h = o.forecastSummary12h || null;
    c.roadClosures = safeNum(o.roadClosures);
    c.roadClosureRisk = safeNum(o.roadClosureRisk);
    c.roadEvents = o.roadEvents || [];
    c.restorationDifficulty = safeNum(o.restorationDifficulty);
    c.predictionExplanation = o.predictionExplanation || "";
  });

  (STATE.outageData?.outagePoints || []).forEach(p => {
    const c = STATE.countyData[keyCounty(p.county)];
    if(c) c.points.push(p);
  });
}

async function loadData(){
  document.getElementById("sourceStatus").innerHTML = "Loading counties, outages, weather, forecast, and ML risk...";

  const [geo, outages, nws, mlAccuracyHistory] = await Promise.all([
    fetchJson(CONFIG.countyGeoUrl),
    tryFetch(CONFIG.outageUrl + "?cb=" + Date.now()),
    tryFetch(CONFIG.nwsAlertsUrl),
    tryFetch("history/ml-accuracy-history.json?cb=" + Date.now())
  ]);

  STATE.countyGeo = geo;
  STATE.outageData = outages || { outages: [], outagePoints: [] };
  STATE.outageData.mlAccuracyHistory = mlAccuracyHistory || { points: [] };
  STATE.nwsAlerts = nws?.features || [];

  initCounties();
  processOutages();

  document.getElementById("sourceStatus").innerHTML = [
    `County records: ${(STATE.outageData.outages || []).length}`,
    `Outage points: ${(STATE.outageData.outagePoints || []).length}`,
    `NWS Texas alerts: ${STATE.nwsAlerts.length}`,
    `Forecast counties: ${STATE.outageData.weatherForecast?.countyForecasts ?? "—"}`,
    `ML risk: ${STATE.outageData.mlRisk?.ok ? "active" : "pending"}`,
    `ML history points: ${(STATE.outageData.mlAccuracyHistory?.points || []).length}`,
    `Last update: ${STATE.outageData.updated || "unknown"}`
  ].join("<br>");
}
