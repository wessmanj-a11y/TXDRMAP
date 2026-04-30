const fs = require("fs/promises");

async function main() {
  await fs.mkdir("history", { recursive: true });
  const payload = {
    updated: new Date().toISOString(),
    source: "NWS county forecast placeholder - upgradeable",
    count: 0,
    errorCount: 0,
    forecasts: [],
    errors: []
  };
  await fs.writeFile("history/county-weather-forecast.json", JSON.stringify(payload, null, 2));
  console.log("Initialized county-weather-forecast.json");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
