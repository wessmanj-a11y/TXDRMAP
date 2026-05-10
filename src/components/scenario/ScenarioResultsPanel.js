function severityClass(value) {
  if (value >= 90) return 'extreme';
  if (value >= 70) return 'high';
  if (value >= 45) return 'moderate';
  return 'low';
}

function renderScenarioResultsPanel(containerId, resolvedImpacts) {
  const container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if (!container) return;
  const impacts = resolvedImpacts || [];
  if (!impacts.length) {
    container.innerHTML = '<p>No county resource impact results available.</p>';
    return;
  }

  const mutualAidCount = impacts.filter(function (item) { return item.mutualAidRequired; }).length;
  const maxStress = Math.max.apply(null, impacts.map(function (item) { return item.totalStress; }));
  const totalCalls = impacts.reduce(function (sum, item) { return sum + item.estimatedCalls; }, 0);
  const totalInjuries = impacts.reduce(function (sum, item) { return sum + item.estimatedInjuries; }, 0);

  container.innerHTML =
    '<section class="resource-summary">' +
      '<div class="card"><div class="label">Mutual Aid Counties</div><div class="value">' + mutualAidCount + '</div></div>' +
      '<div class="card"><div class="label">Max County Stress</div><div class="value">' + maxStress + '%</div></div>' +
      '<div class="card"><div class="label">Estimated Calls</div><div class="value">' + totalCalls.toLocaleString() + '</div></div>' +
      '<div class="card"><div class="label">Estimated Injuries</div><div class="value">' + totalInjuries.toLocaleString() + '</div></div>' +
    '</section>' +
    '<div class="table-wrap"><table><thead><tr>' +
      '<th>County</th><th>Stress</th><th>Mutual Aid</th><th>Responder Load</th><th>Hospital Load</th><th>Grid</th><th>Telco</th><th>Posture</th>' +
    '</tr></thead><tbody>' +
    impacts.map(function (item) {
      return '<tr class="stress-' + severityClass(item.totalStress) + '">' +
        '<td>' + item.county + ' (' + item.ercotZone + ')</td>' +
        '<td>' + item.totalStress + '%</td>' +
        '<td>' + (item.mutualAidRequired ? 'Yes' : 'No') + '</td>' +
        '<td>' + item.responderLoadPercent + '%</td>' +
        '<td>' + item.hospitalLoadPercent + '%</td>' +
        '<td>' + item.gridStressPercent + '%</td>' +
        '<td>' + item.telcoLoadPercent + '%</td>' +
        '<td>' + item.recommendedPosture + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';
}

if (typeof module !== 'undefined') {
  module.exports = { renderScenarioResultsPanel };
}

if (typeof window !== 'undefined') {
  window.TXDRScenarioResultsPanel = { renderScenarioResultsPanel };
}
