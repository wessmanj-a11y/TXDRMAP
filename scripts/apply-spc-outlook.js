const fs = require('fs/promises');

const OUTAGES_FILE = 'outages.json';
const HISTORY_FILE = 'history/outage-history.json';
const SPC_FILE = 'history/spc-outlook.json';

function keyCounty(name) {
  return String(name || '').replace(/ County$/i, '').trim().toLowerCase();
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function applyToCountyRows(rows, spcByCounty) {
  let matched = 0;

  for (const row of rows || []) {
    const countyKey = keyCounty(row.county);
    const spc = spcByCounty[countyKey] || null;

    row.spcRisk = num(spc?.spcRisk);
    row.spcCategory = spc?.spcCategory || 'NONE';

    if (row.spcRisk > 0) matched += 1;

    const baseRisk = num(row.predictedRisk);
    const spcBoost = Math.min(18, row.spcRisk * 0.18);
    row.predictedRisk = Math.round(Math.min(100, baseRisk + spcBoost));
    row.blendedPredictedRisk = row.predictedRisk;
    row.predictedRiskBand = row.predictedRisk >= 75 ? 'High' : row.predictedRisk >= 50 ? 'Elevated' : row.predictedRisk >= 25 ? 'Watch' : 'Low';

    const explanation = String(row.predictionExplanation || '');
    if (row.spcRisk > 0 && !explanation.includes('SPC')) {
      row.predictionExplanation = explanation
        ? `${explanation} + SPC ${row.spcCategory} outlook`
        : `SPC ${row.spcCategory} outlook`;
    }
  }

  return matched;
}

async function main() {
  const outagePayload = await readJson(OUTAGES_FILE, null);
  const historyPayload = await readJson(HISTORY_FILE, { snapshots: [] });
  const spcPayload = await readJson(SPC_FILE, { counties: {} });

  if (!outagePayload) {
    console.log('No outages.json found; skipping SPC merge');
    return;
  }

  const spcByCounty = spcPayload.counties || {};
  const outageMatches = applyToCountyRows(outagePayload.outages || [], spcByCounty);

  if (Array.isArray(historyPayload.snapshots) && historyPayload.snapshots.length) {
    const latest = historyPayload.snapshots[historyPayload.snapshots.length - 1];
    applyToCountyRows(latest.counties || [], spcByCounty);
  }

  outagePayload.spcOutlook = {
    ok: true,
    updated: spcPayload.updated || null,
    source: spcPayload.source || null,
    scope: spcPayload.scope || 'SPC Day 1 Convective Outlook',
    countiesMatched: outageMatches,
    countyCount: spcPayload.countyCount || Object.keys(spcByCounty).length
  };

  outagePayload.sourceStatus = Array.isArray(outagePayload.sourceStatus) ? outagePayload.sourceStatus : [];
  outagePayload.sourceStatus.push({
    name: 'SPC Day 1 Convective Outlook',
    ok: true,
    countiesMatched: outageMatches,
    countyCount: outagePayload.spcOutlook.countyCount
  });

  await fs.writeFile(OUTAGES_FILE, JSON.stringify(outagePayload, null, 2));
  await fs.writeFile(HISTORY_FILE, JSON.stringify(historyPayload, null, 2));

  console.log(`Applied SPC outlook to ${outageMatches} county rows`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
