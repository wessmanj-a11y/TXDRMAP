const fs = require("fs");
const { spawnSync } = require("child_process");

const OUT = "outages.json";
const BACKUP = "outages.json.last-good";

function hasUsableOutagesFile(path) {
  try {
    const payload = JSON.parse(fs.readFileSync(path, "utf8"));
    return Array.isArray(payload.outages) && payload.outages.length > 0;
  } catch {
    return false;
  }
}

if (hasUsableOutagesFile(OUT)) {
  fs.copyFileSync(OUT, BACKUP);
}

const result = spawnSync(process.execPath, ["scripts/fetch-outages.js"], {
  stdio: "inherit",
  env: process.env
});

if (result.status === 0 && hasUsableOutagesFile(OUT)) {
  try { fs.unlinkSync(BACKUP); } catch {}
  process.exit(0);
}

if (hasUsableOutagesFile(BACKUP)) {
  fs.copyFileSync(BACKUP, OUT);
  try { fs.unlinkSync(BACKUP); } catch {}
  console.warn("WARNING: Live outage collection failed; restored the last committed good outages.json so downstream enrichment and ML steps can continue.");
  process.exit(0);
}

console.error("Live outage collection failed and no usable last-good outages.json was available.");
process.exit(result.status || 1);
