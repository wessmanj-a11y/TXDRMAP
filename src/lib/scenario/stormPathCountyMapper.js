function normalizeCountyName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function countyKey(name) {
  return normalizeCountyName(name).replace(/\s+/g, '').replace(/[^A-Za-z]/g, '');
}

const DEFAULT_COUNTY_POINTS = {
  Galveston: [29.3013, -94.7977],
  Harris: [29.7604, -95.3698],
  Montgomery: [30.3213, -95.4778],
  Walker: [30.7235, -95.5508],
  Madison: [30.9499, -95.9116],
  Dallas: [32.7767, -96.7970],
  Tarrant: [32.7555, -97.3308],
  Bexar: [29.4241, -98.4936],
  Travis: [30.2672, -97.7431],
  Collin: [33.1795, -96.4930],
  Denton: [33.2148, -97.1331],
  FortBend: [29.5693, -95.8143],
  Hidalgo: [26.1004, -98.2631],
  ElPaso: [31.7619, -106.4850],
  Brazoria: [29.1694, -95.4344]
};

function displayCounty(key) {
  if (key === 'FortBend') return 'Fort Bend';
  if (key === 'ElPaso') return 'El Paso';
  return key.replace(/([A-Z])/g, ' $1').trim();
}

function toPoint(entry) {
  if (!entry) return null;
  if (Array.isArray(entry)) return { lat: entry[0], lng: entry[1] };
  if (typeof entry.lat === 'number' && typeof entry.lng === 'number') return entry;
  if (typeof entry.lat === 'number' && typeof entry.lon === 'number') return { lat: entry.lat, lng: entry.lon };
  return null;
}

function countyPointsToRecords(points) {
  return Object.keys(points || DEFAULT_COUNTY_POINTS).map(function (key) {
    return { county: displayCounty(key), point: toPoint(points[key]) };
  }).filter(function (item) { return item.point; });
}

function haversineMiles(a, b) {
  const radius = 3958.8;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * radius * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function interpolateDistanceToPath(point, pathPoints) {
  if (!pathPoints || !pathPoints.length) return Infinity;
  if (pathPoints.length === 1) return haversineMiles(point, pathPoints[0]);
  let minDistance = Infinity;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const start = pathPoints[i];
    const end = pathPoints[i + 1];
    for (let step = 0; step <= 24; step++) {
      const t = step / 24;
      const interpolated = { lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t };
      minDistance = Math.min(minDistance, haversineMiles(point, interpolated));
    }
  }
  return minDistance;
}

function severityMultiplier(distanceMiles, radiusMiles) {
  if (distanceMiles <= radiusMiles * 0.25) return 1;
  if (distanceMiles <= radiusMiles * 0.5) return 0.75;
  if (distanceMiles <= radiusMiles * 0.75) return 0.5;
  if (distanceMiles <= radiusMiles) return 0.25;
  return 0;
}

function mapStormPathToCountyImpacts(options) {
  const pathPoints = (options.pathPoints || []).map(toPoint).filter(Boolean);
  const countyRecords = countyPointsToRecords(options.countyPoints || DEFAULT_COUNTY_POINTS);
  const wind = Number(options.wind || 0);
  const rain = Number(options.rain || 0);
  const duration = Number(options.duration || 0);
  const radiusMiles = Number(options.radiusMiles || 220);

  return countyRecords.map(function (record) {
    const distanceMiles = interpolateDistanceToPath(record.point, pathPoints);
    const multiplier = severityMultiplier(distanceMiles, radiusMiles);
    if (!multiplier) return null;
    const hazard = Math.max(1, Math.min(100, Math.round(((wind * 0.42) + (rain * 1.8) + (duration * 0.5)) * multiplier)));
    return {
      county: record.county,
      distanceMiles: Math.round(distanceMiles),
      hazard,
      outagePercent: Math.max(1, Math.min(100, Math.round(hazard * 0.7))),
      roadPercent: Math.max(1, Math.min(100, Math.round(hazard * 0.45 + rain))),
      telcoPercent: Math.max(1, Math.min(100, Math.round(hazard * 0.55))),
      hospitalSurge: Math.max(1, Math.min(100, Math.round(hazard * 0.38)))
    };
  }).filter(Boolean).sort(function (a, b) { return b.hazard - a.hazard; });
}

if (typeof module !== 'undefined') module.exports = { mapStormPathToCountyImpacts };
if (typeof window !== 'undefined') window.TXDRStormPathCountyMapper = { mapStormPathToCountyImpacts };
