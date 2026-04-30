const fs = require('fs/promises');

const COUNTIES_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const OUT = 'history/county-weather-forecast.json';
const USER_AGENT = process.env.NWS_USER_AGENT || 'TXDRMAP Texas Resilience Dashboard';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function num(value) {
  const n = Number(String(value ?? 0).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/geo+json, application/json',
      'user-agent': USER_AGENT
    }
  });
  if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
  return response.json();
}

function flattenCoordinates(coords, out = []) {
  if (!Array.isArray(coords)) return out;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    out.push({ lon: coords[0], lat: coords[1] });
    return out;
  }
  for (const item of coords) flattenCoordinates(item, out);
  return out;
}

function centroidFromGeometry(geometry) {
  const points = flattenCoordinates(geometry?.coordinates || []);
  const valid = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!valid.length) return null;
  return {
    lat: Number((valid.reduce((sum, p) => sum + p.lat, 0) / valid.length).toFixed(5)),
    lon: Number((valid.reduce((sum, p) => sum + p.lon, 0) / valid.length).toFixed(5))
  };
}

function parseWindSpeed(value) {
  const matches = String(value || '').match(/[0-9]+/g) || [];
  return matches.length ? Math.max(...matches.map(Number)) : 0;
}

function periodTime(period) {
  const t = new Date(period?.startTime || period?.endTime || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function summarizeHourlyForecast(hourlyJson) {
  const periods = Array.isArray(hourlyJson?.properties?.periods) ? hourlyJson.properties.periods : [];
  const future = periods
    .filter(p => periodTime(p) >= Date.now() - 60 * 60 * 1000)
    .sort((a, b) => periodTime(a) - periodTime(b));

  const next6 = future.slice(0, 6);
  const next12 = future.slice(0, 12);
  const forecastWindMax6h = Math.max(0, ...next6.map(p => parseWindSpeed(p.windSpeed)));
  const forecastWindMax12h = Math.max(0, ...next12.map(p => parseWindSpeed(p.windSpeed)));
  const forecastPrecipChanceMax12h = Math.max(0, ...next12.map(p => num(p.probabilityOfPrecipitation?.value)));
  const temps = next12.map(p => num(p.temperature)).filter(n => Number.isFinite(n));
  const text = next12.map(p => ((p.shortForecast || '') + ' ' + (p.detailedForecast || ''))).join(' ').toLowerCase();

  let forecastStormRisk = 0;
  if (forecastWindMax12h >= 60) forecastStormRisk += 40;
  else if (forecastWindMax12h >= 50) forecastStormRisk += 30;
  else if (forecastWindMax12h >= 40) forecastStormRisk += 22;
  else if (forecastWindMax12h >= 30) forecastStormRisk += 12;
  else if (forecastWindMax12h >= 20) forecastStormRisk += 5;

  if (forecastPrecipChanceMax12h >= 80) forecastStormRisk += 10;
  else if (forecastPrecipChanceMax12h >= 60) forecastStormRisk += 7;
  else if (forecastPrecipChanceMax12h >= 40) forecastStormRisk += 4;

  if (text.includes('thunderstorm')) forecastStormRisk += 15;
  if (text.includes('severe')) forecastStormRisk += 15;
  if (text.includes('tornado')) forecastStormRisk += 25;
  if (text.includes('hail')) forecastStormRisk += 12;
  if (text.includes('ice') || text.includes('freezing rain')) forecastStormRisk += 25;
  if (text.includes('snow') || text.includes('sleet')) forecastStormRisk += 8;

  return {
    forecastWindMax6h,
    forecastWindMax12h,
    forecastPrecipChanceMax12h,
    forecastTempMax12h: temps.length ? Math.max(...temps) : null,
    forecastTempMin12h: temps.length ? Math.min(...temps) : null,
    forecastStormRisk: Math.min(100, forecastStormRisk),
    forecastSummary12h: next12[0]?.shortForecast || null,
    periodsUsed: next12.length
  };
}

async function fetchCountyForecast(county) {
  const pointJson = await fetchJson('https://api.weather.gov/points/' + county.lat + ',' + county.lon);
  const hourlyUrl = pointJson?.properties?.forecastHourly;
  if (!hourlyUrl) throw new Error('No hourly forecast URL');
  await sleep(100);
  const hourlyJson = await fetchJson(hourlyUrl);
  return {
    county: county.county,
    key: county.key,
    lat: county.lat,
    lon: county.lon,
    nwsOffice: pointJson?.properties?.cwa || null,
    gridId: pointJson?.properties?.gridId || null,
    gridX: pointJson?.properties?.gridX || null,
    gridY: pointJson?.properties?.gridY || null,
    hourlyUrl,
    ...summarizeHourlyForecast(hourlyJson)
  };
}

async function main() {
  const countiesGeo = await fetchJson(COUNTIES_URL);
  const texasCounties = (countiesGeo.features || [])
    .filter(f => f.properties?.STATE === '48')
    .map(f => {
      const center = centroidFromGeometry(f.geometry);
      return {
        county: f.properties.NAME,
        key: String(f.properties.NAME || '').trim().toLowerCase(),
        lat: center?.lat,
        lon: center?.lon
      };
    })
    .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .sort((a, b) => a.county.localeCompare(b.county));

  const forecasts = [];
  const errors = [];

  for (const county of texasCounties) {
    try {
      const forecast = await fetchCountyForecast(county);
      forecasts.push(forecast);
      console.log('OK ' + county.county + ': stormRisk=' + forecast.forecastStormRisk);
    } catch (err) {
      errors.push({ county: county.county, error: err.message });
      console.log('WARN ' + county.county + ': ' + err.message);
    }
    await sleep(250);
  }

  await fs.mkdir('history', { recursive: true });
  await fs.writeFile(OUT, JSON.stringify({
    updated: new Date().toISOString(),
    source: 'NWS hourly forecast via api.weather.gov county centroids',
    count: forecasts.length,
    errorCount: errors.length,
    forecasts,
    errors
  }, null, 2));

  console.log('SUCCESS: wrote ' + forecasts.length + ' forecasts with ' + errors.length + ' errors');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
