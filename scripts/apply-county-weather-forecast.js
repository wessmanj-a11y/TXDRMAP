const fs = require('fs/promises');

const OUTAGES_FILE = 'outages.json';
const HISTORY_FILE = 'history/outage-history.json';
const FORECAST_FILE = 'history/county-weather-forecast.json';

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function keyCounty(name) {
  return String(name || '')
    .replace(/ County$/i, '')
    .trim()
    .toLowerCase();
}

function emptyForecast() {
  return {
    forecastWindMax6h: 0,
    forecastWindMax12h: 0,
    forecastPrecipChanceMax12h: 0,
    forecastTempMax12h: null,
    forecastTempMin12h: null,
    forecastStormRisk: 0,
    forecastSummary12h: null
  };
}

function forecastFields(forecast) {
  if (!forecast) return emptyForecast();
  return {
    forecastWindMax6h: num(forecast.forecastWindMax6h),
    forecastWindMax12h: num(forecast.forecastWindMax12h),
    forecastPrecipChanceMax12h: num(forecast.forecastPrecipChanceMax12h),
    forecastTempMax12h: forecast.forecastTempMax12h == null ? null : num(forecast.forecastTempMax12h),
    forecastTempMin12h: forecast.forecastTempMin12h == null ? null : num(forecast.forecastTempMin12h),
    forecastStormRisk: num(forecast.forecastStormRisk),
    forecastSummary12h: forecast.forecastSummary12h || null
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function applyToRows(rows, forecastByCounty) {
  let enriched = 0;
  const updatedRows = (rows || []).map(row => {
    const forecast = forecastByCounty.get(keyCounty(row.county));
    if (forecast) enriched += 1;
    return {
      ...row,
      ...forecastFields(forecast)
    };
  });
  return { rows: updatedRows, enriched };
}

async function main() {
  const outagesPayload = await readJson(OUTAGES_FILE, null);
  if (!outagesPayload) {
    console.log('No outages.json found; skipping forecast merge');
    return;
  }

  const forecastPayload = await readJson(FORECAST_FILE, { forecasts: [] });
  const forecasts = Array.isArray(forecastPayload.forecasts) ? forecastPayload.forecasts : [];
  const forecastByCounty = new Map(forecasts.map(f => [keyCounty(f.county || f.key), f]));

  const outageResult = applyToRows(outagesPayload.outages || [], forecastByCounty);
  outagesPayload.outages = outageResult.rows;

  outagesPayload.weatherForecast = {
    ok: forecasts.length > 0,
    updated: forecastPayload.updated || null,
    source: forecastPayload.source || 'NWS hourly forecast via county centroids',
    countyForecasts: forecasts.length,
    countiesEnriched: outageResult.enriched,
    errorCount: forecastPayload.errorCount || 0
  };

  outagesPayload.sourceStatus = Array.isArray(outagesPayload.sourceStatus)
    ? outagesPayload.sourceStatus.filter(s => s.name !== 'NWS County Forecast')
    : [];

  outagesPayload.sourceStatus.push({
    name: 'NWS County Forecast',
    ok: forecasts.length > 0,
    countyForecasts: forecasts.length,
    countiesEnriched: outageResult.enriched,
    errorCount: forecastPayload.errorCount || 0
  });

  await fs.writeFile(OUTAGES_FILE, JSON.stringify(outagesPayload, null, 2));

  const historyPayload = await readJson(HISTORY_FILE, null);
  if (historyPayload && Array.isArray(historyPayload.snapshots) && historyPayload.snapshots.length) {
    const latest = historyPayload.snapshots[historyPayload.snapshots.length - 1];
    const historyResult = applyToRows(latest.counties || [], forecastByCounty);
    latest.counties = historyResult.rows;
    await fs.writeFile(HISTORY_FILE, JSON.stringify({
      ...historyPayload,
      updated: new Date().toISOString()
    }, null, 2));
  }

  console.log('Merged forecast into ' + outageResult.enriched + ' outage counties from ' + forecasts.length + ' county forecasts');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
