const fs = require('fs');
const path = require('path');
const https = require('https');

const sourceUrl = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const outputPath = path.join(process.cwd(), 'public', 'data', 'geo', 'texas_counties.geojson');

function downloadJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error('Download failed with status ' + res.statusCode));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

async function buildTexasCountyGeojson() {
  const national = await downloadJson(sourceUrl);
  const features = (national.features || []).filter(feature => {
    const id = String(feature.id || feature.properties?.GEOID || '');
    return id.startsWith('48');
  }).map(feature => {
    const id = String(feature.id || feature.properties?.GEOID || '');
    return {
      type: 'Feature',
      id,
      properties: {
        STATEFP: '48',
        COUNTYFP: id.slice(2),
        GEOID: id,
        NAME: feature.properties?.NAME || feature.properties?.name || '',
        NAMELSAD: (feature.properties?.NAME || feature.properties?.name || '') + ' County'
      },
      geometry: feature.geometry
    };
  });

  const output = { type: 'FeatureCollection', features };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log('Wrote ' + outputPath + ' with ' + features.length + ' Texas counties');
}

buildTexasCountyGeojson().catch(error => {
  console.error(error);
  process.exit(1);
});
