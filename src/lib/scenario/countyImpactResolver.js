function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCountyResources(resources, countyName) {
  if (!resources) return null;
  if (resources.counties && resources.counties[countyName]) return resources.counties[countyName];
  if (resources[countyName]) return resources[countyName];
  return null;
}

function defaultResources() {
  return {
    population: 120000,
    hospitals: 1,
    hospitalBeds: 250,
    fireStations: 6,
    emsStations: 4,
    policeDepartments: 3,
    cellTowers: 100,
    ercotZone: 'Unknown'
  };
}

function resolveCountyImpact(countyName, impact, resources) {
  const profile = getCountyResources(resources, countyName) || defaultResources();
  const population = profile.population || 120000;
  const hazard = impact.hazard || 0;
  const outagePercent = impact.outagePercent || 0;
  const roadPercent = impact.roadPercent || 0;
  const telcoPercent = impact.telcoPercent || 0;
  const hospitalSurge = impact.hospitalSurge || 0;

  const estimatedCalls = Math.round((population / 1000) * (hazard / 100) * 8 + roadPercent * 18);
  const estimatedInjuries = Math.round((population / 10000) * (hazard / 100) * 7 + hospitalSurge * 4);
  const responderCapacity = Math.max(1, (profile.fireStations || 0) * 18 + (profile.emsStations || 0) * 12 + (profile.policeDepartments || 0) * 20);
  const hospitalCapacity = Math.max(1, profile.hospitalBeds || 1);
  const towerCount = Math.max(1, profile.cellTowers || 1);

  const responderLoadPercent = clamp(Math.round((estimatedCalls / responderCapacity) * 100), 0, 300);
  const hospitalLoadPercent = clamp(Math.round((estimatedInjuries / hospitalCapacity) * 100), 0, 300);
  const telcoLoadPercent = clamp(Math.round(telcoPercent + outagePercent * 0.35 - Math.log10(towerCount) * 4), 0, 100);
  const gridStressPercent = clamp(Math.round(outagePercent + hazard * 0.2), 0, 100);
  const totalStress = Math.round((responderLoadPercent + hospitalLoadPercent + telcoLoadPercent + gridStressPercent) / 4);

  return {
    county: countyName,
    ercotZone: profile.ercotZone || 'Unknown',
    population,
    estimatedCalls,
    estimatedInjuries,
    responderCapacity,
    hospitalCapacity,
    responderLoadPercent,
    hospitalLoadPercent,
    telcoLoadPercent,
    gridStressPercent,
    totalStress,
    mutualAidRequired: responderLoadPercent >= 85 || hospitalLoadPercent >= 85 || gridStressPercent >= 80 || telcoLoadPercent >= 75,
    recommendedPosture: totalStress >= 90 ? 'Extreme - activate regional mutual aid' : totalStress >= 70 ? 'High - pre-stage external resources' : totalStress >= 45 ? 'Moderate - stage local surge' : 'Low - local resources likely sufficient'
  };
}

function resolveScenarioImpacts(impacts, resources) {
  return (impacts || []).map(function (impact) {
    return resolveCountyImpact(impact.county, impact, resources);
  });
}

if (typeof module !== 'undefined') {
  module.exports = { resolveCountyImpact, resolveScenarioImpacts };
}

if (typeof window !== 'undefined') {
  window.TXDRCountyImpactResolver = { resolveCountyImpact, resolveScenarioImpacts };
}
