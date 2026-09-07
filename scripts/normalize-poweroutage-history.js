#!/usr/bin/env node

/**
 * normalize-poweroutage-history.js
 *
 * Usage:
 *   node scripts/normalize-poweroutage-history.js data/poweroutage-history/raw/TX_Outag17.csv data/poweroutage-history/normalized/tx_poweroutage_2017_normalized.csv
 *
 * Purpose:
 * Converts raw PowerOutage historical CSV exports into a normalized schema for baseline generation + ML expansion.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  console.error('Usage: node scripts/normalize-poweroutage-history.js <input.csv> <output.csv>');
  process.exit(1);
}

if (!fs.existsSync(input)) {
  console.error(`Input file not found: ${input}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(output), { recursive: true });

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

function safeNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

(async () => {
  const rl = readline.createInterface({
    input: fs.createReadStream(input),
    crlfDelay: Infinity,
  });

  const out = fs.createWriteStream(output);

  let headerMap = null;

  out.write([
    'recordDate',
    'year',
    'month',
    'county',
    'countyFips',
    'utility',
    'customersTracked',
    'maxCustomersOut',
    'percentCustomersOut',
    'customerHoursOut',
    'customerHoursTracked',
    'lat',
    'lon'
  ].join(',') + '\n');

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

    const recordDate = row[headerMap['RecordDate']] || '';
    if (!recordDate) continue;

    const date = new Date(recordDate);
    const year = date.getUTCFullYear() || safeNumber(row[headerMap['POWERYEAR']]);
    const month = (date.getUTCMonth() + 1) || 0;

    const county = (row[headerMap['CountyName']] || '').trim();
    const countyFips = (row[headerMap['GEOID']] || '').trim();
    const utility = (row[headerMap['UtilityName']] || '').trim();

    const customersTracked = safeNumber(row[headerMap['CustomersTracked']]);
    const maxCustomersOut = safeNumber(row[headerMap['MaxCustomersOut']]);
    const customerHoursOut = safeNumber(row[headerMap['CustomerHoursOutTotal']]);
    const customerHoursTracked = safeNumber(row[headerMap['CustomerHoursTrackedTotal']]);

    const percentCustomersOut = customersTracked > 0
      ? ((maxCustomersOut / customersTracked) * 100)
      : 0;

    const lat = safeNumber(row[headerMap['INTPTLAT']]);
    const lon = safeNumber(row[headerMap['INTPTLONG']]);

    out.write([
      recordDate,
      year,
      month,
      county,
      countyFips,
      utility,
      customersTracked,
      maxCustomersOut,
      percentCustomersOut.toFixed(6),
      customerHoursOut,
      customerHoursTracked,
      lat,
      lon
    ].join(',') + '\n');
  }

  out.end();

  out.on('finish', () => {
    console.log(`Normalized file written to ${output}`);
  });
})();
