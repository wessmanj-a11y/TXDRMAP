// TXDRMAP Scenario Zones Engine
// County centroid + radius severity approximation for rapid statewide scenario modeling

(function(window){
  const DEFAULTS = {
    majorRadiusMiles: 60,
    severeRadiusMiles: 120,
    moderateRadiusMiles: 200,
    elevatedRadiusMiles: 300
  };

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2) ** 2 +
      Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
      Math.sin(dLon/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function pointToSegmentDistanceMiles(point, start, end) {
    const steps = 24;
    let min = Infinity;
    for (let i=0;i<=steps;i++) {
      const t = i/steps;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;
      const d = haversineMiles(point.lat, point.lng, lat, lng);
      if (d < min) min = d;
    }
    return min;
  }

  function classifySeverity(distance, config) {
    if (distance <= config.majorRadiusMiles) return { level:'catastrophic', multiplier:1.0, color:'#b91c1c' };
    if (distance <= config.severeRadiusMiles) return { level:'severe', multiplier:0.75, color:'#ea580c' };
    if (distance <= config.moderateRadiusMiles) return { level:'moderate', multiplier:0.5, color:'#eab308' };
    if (distance <= config.elevatedRadiusMiles) return { level:'elevated', multiplier:0.25, color:'#db2777' };
    return null;
  }

  function buildImpactZones(pathPoints, countyData, customConfig = {}) {
    const config = Object.assign({}, DEFAULTS, customConfig);
    const impacted = [];

    countyData.forEach(county => {
      let minDistance = Infinity;
      for (let i=0; i<pathPoints.length-1; i++) {
        const dist = pointToSegmentDistanceMiles(
          county.centroid,
          pathPoints[i],
          pathPoints[i+1]
        );
        if (dist < minDistance) minDistance = dist;
      }

      const severity = classifySeverity(minDistance, config);
      if (severity) {
        impacted.push({
          ...county,
          distanceMiles: Math.round(minDistance),
          severity: severity.level,
          impactMultiplier: severity.multiplier,
          zoneColor: severity.color,
          estimatedPowerOutagePct: Math.round((county.population / 100000) * 8 * severity.multiplier),
          estimatedRoadImpactPct: Math.round(20 * severity.multiplier),
          estimatedHospitalSurgePct: Math.round(35 * severity.multiplier),
          estimatedTelcoImpactPct: Math.round(30 * severity.multiplier)
        });
      }
    });

    return impacted.sort((a,b)=>a.distanceMiles-b.distanceMiles);
  }

  function drawScenarioZones(map, impactedCounties) {
    if (!window.scenarioZoneLayers) window.scenarioZoneLayers = [];
    window.scenarioZoneLayers.forEach(layer => map.removeLayer(layer));
    window.scenarioZoneLayers = [];

    impactedCounties.forEach(county => {
      const radiusMeters = Math.max(15000, county.impactMultiplier * 50000);
      const circle = L.circle([county.centroid.lat, county.centroid.lng], {
        color: county.zoneColor,
        fillColor: county.zoneColor,
        fillOpacity: 0.2,
        radius: radiusMeters,
        weight: 1
      }).bindPopup(`
        <b>${county.name} County</b><br/>
        Severity: ${county.severity}<br/>
        Distance: ${county.distanceMiles} mi<br/>
        Power Outage Risk: ${county.estimatedPowerOutagePct}%<br/>
        Road Impact: ${county.estimatedRoadImpactPct}%<br/>
        Hospital Surge: ${county.estimatedHospitalSurgePct}%<br/>
        Telco Impact: ${county.estimatedTelcoImpactPct}%
      `);
      circle.addTo(map);
      window.scenarioZoneLayers.push(circle);
    });
  }

  window.TXDRScenarioZones = {
    buildImpactZones,
    drawScenarioZones,
    DEFAULTS
  };
})(window);
