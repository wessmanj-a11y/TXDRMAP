document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('scenarioForm');
  if (!form) return;

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const scenario = readScenario();
    const impacts = runScenario(scenario);
    renderScenario(impacts, scenario);
  });

  form.dispatchEvent(new Event('submit'));
});

function readScenario() {
  return {
    name: valueOf('scenarioName') || 'Custom Texas Scenario',
    type: valueOf('scenarioType') || 'hurricane',
    wind: numberOf('windSpeed'),
    rain: numberOf('rainfall'),
    duration: numberOf('duration'),
    counties: valueOf('trackCounties').split(',').map(function (county) {
      return county.trim();
    }).filter(Boolean)
  };
}

function valueOf(id) {
  const element = document.getElementById(id);
  return element ? element.value : '';
}

function numberOf(id) {
  const value = Number(valueOf(id));
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scenarioMultiplier(type) {
  if (type === 'hurricane') return 1.15;
  if (type === 'winterstorm') return 1.05;
  return 0.92;
}

function runScenario(scenario) {
  return scenario.counties.map(function (county, index) {
    const trackDecay = Math.max(0.45, 1 - index * 0.08);
    const hazard = clamp(Math.round(((scenario.wind * 0.42) + (scenario.rain * 1.9) + (scenario.duration * 0.55)) * scenarioMultiplier(scenario.type) * trackDecay), 1, 100);
    const outagePercent = clamp(Math.round(hazard * 0.74), 1, 100);
    const roadPercent = clamp(Math.round((hazard * 0.44) + (scenario.rain * 0.9)), 1, 100);
    const telcoPercent = clamp(Math.round((hazard * 0.52) + (outagePercent * 0.22)), 1, 100);
    const hospitalSurge = clamp(Math.round((hazard * 0.35) + (scenario.duration * 0.4)), 1, 100);
    const responderCalls = Math.round(hazard * 35 + roadPercent * 12 + hospitalSurge * 18);
    const injuries = Math.round(hazard * 7.5 + roadPercent * 2.5);
    const damage = Math.round(hazard * hazard * 540000);
    const recoveryDays = clamp(Math.round(1 + hazard / 8 + outagePercent / 18 + roadPercent / 25), 1, 45);

    return {
      county: county,
      hazard: hazard,
      outagePercent: outagePercent,
      roadPercent: roadPercent,
      telcoPercent: telcoPercent,
      hospitalSurge: hospitalSurge,
      responderCalls: responderCalls,
      injuries: injuries,
      damage: damage,
      recoveryDays: recoveryDays
    };
  }).sort(function (a, b) {
    return b.hazard - a.hazard;
  });
}

function renderScenario(impacts, scenario) {
  const totals = impacts.reduce(function (acc, item) {
    acc.damage += item.damage;
    acc.responders += item.responderCalls;
    acc.injuries += item.injuries;
    acc.outagePercent += item.outagePercent;
    acc.recovery = Math.max(acc.recovery, item.recoveryDays);
    acc.hospitalStress += item.hospitalSurge >= 70 ? 1 : 0;
    acc.severeRoad += item.roadPercent >= 60 ? 1 : 0;
    return acc;
  }, { damage: 0, responders: 0, injuries: 0, outagePercent: 0, recovery: 0, hospitalStress: 0, severeRoad: 0 });

  const averageOutage = impacts.length ? Math.round(totals.outagePercent / impacts.length) : 0;
  renderCards(totals, averageOutage, scenario);
  renderBars(impacts);
  renderRows(impacts);
}

function renderCards(totals, averageOutage, scenario) {
  const summary = document.getElementById('summaryCards');
  if (!summary) return;
  summary.innerHTML = [
    card('Scenario', scenario.name),
    card('Avg Power Impact', averageOutage + '%'),
    card('Economic Damage', '$' + totals.damage.toLocaleString()),
    card('Responder Calls', totals.responders.toLocaleString()),
    card('Estimated Injuries', totals.injuries.toLocaleString()),
    card('Hospital Stress Counties', totals.hospitalStress.toLocaleString()),
    card('Severe Road Counties', totals.severeRoad.toLocaleString()),
    card('Max Recovery', totals.recovery + ' days')
  ].join('');
}

function card(label, value) {
  return '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
}

function renderBars(impacts) {
  const container = document.getElementById('countyBars');
  if (!container) return;
  container.innerHTML = impacts.slice(0, 12).map(function (item) {
    return '<div class="bar-row"><span>' + item.county + '</span><div class="bar"><div class="fill" style="width:' + item.hazard + '%"></div></div><strong>' + item.hazard + '%</strong></div>';
  }).join('');
}

function renderRows(impacts) {
  const rows = document.getElementById('impactRows');
  if (!rows) return;
  rows.innerHTML = impacts.map(function (item) {
    return '<tr><td>' + item.county + '</td><td>' + item.hazard + '%</td><td>' + item.outagePercent + '%</td><td>' + item.roadPercent + '%</td><td>' + item.telcoPercent + '%</td><td>' + item.hospitalSurge + '%</td><td>$' + item.damage.toLocaleString() + '</td><td>' + item.recoveryDays + 'd</td></tr>';
  }).join('');
}
