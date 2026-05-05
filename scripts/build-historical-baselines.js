#!/usr/bin/env node

/**
 * build-historical-baselines.js
 *
 * Usage:
 *   node scripts/build-historical-baselines.js
 *   node scripts/build-historical-baselines.js data/poweroutage-history/normalized history/historical-county-baselines.json
 *
 * Purpose:
 * Reads normalized PowerOutage historical CSV files and builds compact county baseline features.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const readline = require('readline');

const IN_DIR = process.argv[2] || 'data/poweroutage-history/normalized';
const OUT_FILE = process.argv[3] || 'history/historical-county-baselines.json';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function num(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function keyCounty(name) {
  return String(name || '').replace(/ County$/i, '').trim().toLowerCase();
}

function percentile(values, p) {
  const clean = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const idx = (clean.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return clean[lo];
  return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
}

function average(values) {
  const clean = values.filter(v => Number.isFinite(v));
  return clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : 0;
}

function stddev(values) {
  const avg = average(values);
  const clean = values.filter(v => Number.isFinite(v));
  if (!clean.length) return 0;
  return Math.sqrt(clean.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / clean.length);
}

function round(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function blankCountyAccumulator(county, countyFips) {
  return {
    county,
    key: keyCounty(county),
    countyFips,
    rows: 0,
    years: new Set(),
    valuesPct: [],
    valuesCustomersOut: [],
    monthly: {},
    utilityTotals: {},
    maxObservedCustomersOut: 0,
    maxObservedPercentOut: 0,
  };
}

function getMonthBucket(acc, month) {
  const key = String(month).padStart(2, '0');
  if (!acc.monthly[key]) {
    acc.monthly[key] = {
      valuesPct: [],
      valuesCustomersOut: [],
      rows: 0,
    };
  }
  return acc.monthly[key];
}

async function processNormalizedCsv(file, byCounty) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let headerMap = null;
  let rowCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headerMap) {
      const headers = parseCSVLine(line);
      headerMap = {};
      headers.forEach((h, idx) => {
        headerMap[h.trim()] = idx;
      });
      continue;
    }

    const row = parseCSVLine(line);
    const county = (row[headerMap.county] || '').trim();
    if (!county) continue;

    const countyFips = (row[headerMap.countyFips] || '').trim();
    const key = keyCounty(county);
    const year = num(row[headerMap.year]);
    const month = num(row[headerMap.month]);
    const utility = (row[headerMap.utility] || 'Unknown').trim() || 'Unknown';
    const maxCustomersOut = num(row[headerMap.maxCustomersOut]);
    const customersTracked = num(row[headerMap.customersTracked]);
    const percentCustomersOut = num(row[headerMap.percentCustomersOut]);

    if (!byCounty[key]) byCounty[key] = blankCountyAccumulator(county, countyFips);
    const acc = byCounty[key];

    acc.rows += 1;
    if (year) acc.years.add(year);
    acc.valuesPct.push(percentCustomersOut);
    acc.valuesCustomersOut.push(maxCustomersOut);
    acc.maxObservedCustomersOut = Math.max(acc.maxObservedCustomersOut, maxCustomersOut);
    acc.maxObservedPercentOut = Math.max(acc.maxObservedPercentOut, percentCustomersOut);
    acc.utilityTotals[utility] = (acc.utilityTotals[utility] || 0) + customersTracked;

    if (month >= 1 && month <= 12) {
      const monthBucket = getMonthBucket(acc, month);
      monthBucket.rows += 1;
      monthBucket.valuesPct.push(percentCustomersOut);
      monthBucket.valuesCustomersOut.push(maxCustomersOut);
    }

    rowCount += 1;
  }

  console.log(`Processed ${rowCount} rows from ${file}`);
  return rowCount;
}

function buildCountyPayload(acc) {
  const monthly = {};
  for (const [month, bucket] of Object.entries(acc.monthly)) {
    monthly[month] = {
      rows: bucket.rows,
      avgPercentOut: round(average(bucket.valuesPct), 6),
      p50PercentOut: round(percentile(bucket.valuesPct, 0.5), 6),
      p90PercentOut: round(percentile(bucket.valuesPct, 0.9), 6),
      p95PercentOut: round(percentile(bucket.valuesPct, 0.95), 6),
      p99PercentOut: round(percentile(bucket.valuesPct, 0.99), 6),
      avgCustomersOut: round(average(bucket.valuesCustomersOut), 2),
      p95CustomersOut: round(percentile(bucket.valuesCustomersOut, 0.95), 2),
    };
  }

  const utilityEntries = Object.entries(acc.utilityTotals).sort((a, b) => b[1] - a[1]);
  const totalTrackedUtilityRows = utilityEntries.reduce((s, [, v]) => s + v, 0);
  const topUtility = utilityEntries[0]?.[0] || null;
  const topUtilityShare = totalTrackedUtilityRows > 0 && utilityEntries[0]
    ? utilityEntries[0][1] / totalTrackedUtilityRows
    : 0;

  return {
    county: acc.county,
    key: acc.key,
    countyFips: acc.countyFips,
    rows: acc.rows,
    years: [...acc.years].sort(),
    avgPercentOut: round(average(acc.valuesPct), 6),
    p50PercentOut: round(percentile(acc.valuesPct, 0.5), 6),
    p90PercentOut: round(percentile(acc.valuesPct, 0.9), 6),
    p95PercentOut: round(percentile(acc.valuesPct, 0.95), 6),
    p99PercentOut: round(percentile(acc.valuesPct, 0.99), 6),
    stddevPercentOut: round(stddev(acc.valuesPct), 6),
    avgCustomersOut: round(average(acc.valuesCustomersOut), 2),
    p50CustomersOut: round(percentile(acc.valuesCustomersOut, 0.5), 2),
    p90CustomersOut: round(percentile(acc.valuesCustomersOut, 0.9), 2),
    p95CustomersOut: round(percentile(acc.valuesCustomersOut, 0.95), 2),
    p99CustomersOut: round(percentile(acc.valuesCustomersOut, 0.99), 2),
    maxObservedCustomersOut: round(acc.maxObservedCustomersOut, 2),
    maxObservedPercentOut: round(acc.maxObservedPercentOut, 6),
    outageVolatilityScore: round(Math.min(100, stddev(acc.valuesPct) * 20), 2),
    topUtility,
    topUtilityShare: round(topUtilityShare, 4),
    monthly,
  };
}

async function main() {
  await fsp.mkdir(path.dirname(OUT_FILE), { recursive: true });

  let files;
  try {
    files = (await fsp.readdir(IN_DIR))
      .filter(file => file.toLowerCase().endsWith('.csv'))
      .map(file => path.join(IN_DIR, file))
      .sort();
  } catch {
    files = [];
  }

  if (!files.length) {
    console.error(`No normalized CSV files found in ${IN_DIR}`);
    process.exit(1);
  }

  const byCounty = {};
  let totalRows = 0;

  for (const file of files) {
    totalRows += await processNormalizedCsv(file, byCounty);
  }

  const counties = {};
  for (const [key, acc] of Object.entries(byCounty)) {
    counties[key] = buildCountyPayload(acc);
  }

  const payload = {
    updated: new Date().toISOString(),
    source: IN_DIR,
    normalizedFiles: files.map(file => path.basename(file)),
    totalRows,
    countyCount: Object.keys(counties).length,
    fields: [
      'avgPercentOut',
      'p50PercentOut',
      'p90PercentOut',
      'p95PercentOut',
      'p99PercentOut',
      'stddevPercentOut',
      'avgCustomersOut',
      'p95CustomersOut',
      'maxObservedCustomersOut',
      'outageVolatilityScore',
      'monthly'
    ],
    counties,
  };

  await fsp.writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_FILE} with ${payload.countyCount} counties and ${payload.totalRows} historical rows`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
