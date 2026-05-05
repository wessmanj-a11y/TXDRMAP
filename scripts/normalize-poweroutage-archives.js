#!/usr/bin/env node

/**
 * normalize-poweroutage-archives.js
 *
 * Usage:
 *   node scripts/normalize-poweroutage-archives.js
 *   node scripts/normalize-poweroutage-archives.js data/poweroutage-history/raw data/poweroutage-history/normalized
 *
 * Purpose:
 * Finds PowerOutage historical CSV files or ZIP archives in the raw directory,
 * normalizes each CSV, and writes compact normalized CSV outputs.
 *
 * ZIP handling uses the system `unzip` command, which is available on GitHub Actions Ubuntu runners.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const RAW_DIR = process.argv[2] || 'data/poweroutage-history/raw';
const OUT_DIR = process.argv[3] || 'data/poweroutage-history/normalized';
const NORMALIZER = 'scripts/normalize-poweroutage-history.js';

function inferYear(fileName) {
  const base = path.basename(fileName);
  const fullYear = base.match(/(20\d{2})/);
  if (fullYear) return fullYear[1];

  const shortYear = base.match(/(?:Outag|outag|TX_Outag|tx_outag)[_ -]?(\d{2})/);
  if (shortYear) return `20${shortYear[1]}`;

  const anyTwoDigit = base.match(/(?:^|\D)(\d{2})(?:\D|$)/);
  if (anyTwoDigit) return `20${anyTwoDigit[1]}`;

  return base.replace(/\W+/g, '_').toLowerCase();
}

function normalizedOutputPath(sourceName, suffix = '') {
  const year = inferYear(sourceName);
  const safeSuffix = suffix ? `_${suffix.replace(/\W+/g, '_').toLowerCase()}` : '';
  return path.join(OUT_DIR, `tx_poweroutage_${year}${safeSuffix}_normalized.csv`);
}

function runNormalizer(inputCsv, outputCsv) {
  const result = spawnSync('node', [NORMALIZER, inputCsv, outputCsv], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Normalizer failed for ${inputCsv}`);
  }
}

function requireUnzip() {
  const result = spawnSync('unzip', ['-v'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('The `unzip` command is required but was not found. GitHub Actions Ubuntu runners include it by default.');
  }
}

function listZipEntries(zipPath) {
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Could not list ZIP entries for ${zipPath}: ${result.stderr}`);
  }

  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(entry => entry.toLowerCase().endsWith('.csv'));
}

async function extractZipEntry(zipPath, entry, tempCsv) {
  await fsp.mkdir(path.dirname(tempCsv), { recursive: true });

  const result = spawnSync('unzip', ['-p', zipPath, entry], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`Could not extract ${entry} from ${zipPath}: ${result.stderr?.toString?.() || ''}`);
  }

  await fsp.writeFile(tempCsv, result.stdout);
}

async function normalizeCsvFile(csvPath) {
  const outputCsv = normalizedOutputPath(csvPath);
  console.log(`Normalizing CSV: ${csvPath} -> ${outputCsv}`);
  runNormalizer(csvPath, outputCsv);
}

async function normalizeZipFile(zipPath) {
  requireUnzip();
  const entries = listZipEntries(zipPath);

  if (!entries.length) {
    console.warn(`No CSV entries found in ${zipPath}`);
    return;
  }

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'txdrmap-poweroutage-'));

  try {
    for (const entry of entries) {
      const tempCsv = path.join(tempRoot, path.basename(entry));
      const suffix = entries.length > 1 ? path.basename(entry, path.extname(entry)) : '';
      const outputCsv = normalizedOutputPath(zipPath, suffix);

      console.log(`Extracting ZIP entry: ${zipPath} :: ${entry}`);
      await extractZipEntry(zipPath, entry, tempCsv);

      console.log(`Normalizing ZIP entry -> ${outputCsv}`);
      runNormalizer(tempCsv, outputCsv);
    }
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  await fsp.mkdir(RAW_DIR, { recursive: true });
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const files = await fsp.readdir(RAW_DIR);
  const candidates = files
    .filter(file => file.toLowerCase().endsWith('.csv') || file.toLowerCase().endsWith('.zip'))
    .sort();

  if (!candidates.length) {
    console.log(`No CSV or ZIP files found in ${RAW_DIR}`);
    return;
  }

  for (const file of candidates) {
    const fullPath = path.join(RAW_DIR, file);
    if (file.toLowerCase().endsWith('.zip')) {
      await normalizeZipFile(fullPath);
    } else {
      await normalizeCsvFile(fullPath);
    }
  }

  console.log('PowerOutage historical normalization complete.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
