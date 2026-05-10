function runScenarioPipeline(options) {
  const impacts = options.impacts || [];
  const resources = options.resources || {};
  const resolver = options.resolver || (typeof window !== 'undefined' ? window.TXDRCountyImpactResolver : null);
  const panel = options.panel || (typeof window !== 'undefined' ? window.TXDRScenarioResultsPanel : null);
  const containerId = options.containerId || 'resourceImpactResults';

  if (!resolver || !resolver.resolveScenarioImpacts) {
    return { ok: false, error: 'County impact resolver is not available.' };
  }

  const resolvedImpacts = resolver.resolveScenarioImpacts(impacts, resources);

  if (panel && panel.renderScenarioResultsPanel) {
    panel.renderScenarioResultsPanel(containerId, resolvedImpacts);
  }

  return {
    ok: true,
    resolvedImpacts,
    mutualAidCount: resolvedImpacts.filter(function (item) { return item.mutualAidRequired; }).length,
    maxStress: resolvedImpacts.reduce(function (max, item) { return Math.max(max, item.totalStress); }, 0)
  };
}

if (typeof module !== 'undefined') {
  module.exports = { runScenarioPipeline };
}

if (typeof window !== 'undefined') {
  window.TXDRRunScenarioPipeline = { runScenarioPipeline };
}
