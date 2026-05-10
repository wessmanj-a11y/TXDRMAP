const fs = require('fs');
const path = require('path');

const outputPath = path.join(process.cwd(), 'public', 'data', 'texas_county_resources.json');

const counties = {
  Harris: { population: 4836637, hospitals: 89, hospitalBeds: 22140, fireStations: 153, emsStations: 82, policeDepartments: 105, cellTowers: 6412, ercotZone: 'Coast' },
  Dallas: { population: 2613539, hospitals: 52, hospitalBeds: 13600, fireStations: 98, emsStations: 61, policeDepartments: 72, cellTowers: 4890, ercotZone: 'North' },
  Tarrant: { population: 2110640, hospitals: 39, hospitalBeds: 9700, fireStations: 87, emsStations: 55, policeDepartments: 64, cellTowers: 4012, ercotZone: 'North' },
  Bexar: { population: 2009324, hospitals: 44, hospitalBeds: 11400, fireStations: 102, emsStations: 58, policeDepartments: 68, cellTowers: 4320, ercotZone: 'South' },
  Travis: { population: 1290188, hospitals: 31, hospitalBeds: 7800, fireStations: 76, emsStations: 42, policeDepartments: 39, cellTowers: 2980, ercotZone: 'Central' },
  Galveston: { population: 350682, hospitals: 8, hospitalBeds: 1550, fireStations: 32, emsStations: 18, policeDepartments: 15, cellTowers: 620, ercotZone: 'Coast' },
  Montgomery: { population: 748000, hospitals: 13, hospitalBeds: 2450, fireStations: 45, emsStations: 24, policeDepartments: 18, cellTowers: 980, ercotZone: 'Coast' },
  Walker: { population: 76000, hospitals: 2, hospitalBeds: 260, fireStations: 12, emsStations: 6, policeDepartments: 6, cellTowers: 130, ercotZone: 'Coast' },
  Collin: { population: 1190000, hospitals: 18, hospitalBeds: 4100, fireStations: 54, emsStations: 28, policeDepartments: 22, cellTowers: 1850, ercotZone: 'North' },
  Denton: { population: 1000000, hospitals: 14, hospitalBeds: 3400, fireStations: 48, emsStations: 25, policeDepartments: 20, cellTowers: 1700, ercotZone: 'North' },
  'Fort Bend': { population: 900000, hospitals: 12, hospitalBeds: 3000, fireStations: 42, emsStations: 23, policeDepartments: 18, cellTowers: 1450, ercotZone: 'Coast' },
  Hidalgo: { population: 888000, hospitals: 17, hospitalBeds: 3600, fireStations: 38, emsStations: 28, policeDepartments: 24, cellTowers: 1350, ercotZone: 'South' },
  'El Paso': { population: 868000, hospitals: 15, hospitalBeds: 3900, fireStations: 36, emsStations: 25, policeDepartments: 15, cellTowers: 1250, ercotZone: 'West' },
  Brazoria: { population: 390000, hospitals: 7, hospitalBeds: 1300, fireStations: 30, emsStations: 18, policeDepartments: 14, cellTowers: 620, ercotZone: 'Coast' },
  Madison: { population: 15000, hospitals: 1, hospitalBeds: 40, fireStations: 5, emsStations: 3, policeDepartments: 3, cellTowers: 35, ercotZone: 'Coast' }
};

function build() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceNote: 'Operational seed model using public county population baselines and modeled emergency resource counts. Replace fields with direct HIFLD/Census/Texas DSHS pulls as ingestion matures.',
    fields: ['population','hospitals','hospitalBeds','fireStations','emsStations','policeDepartments','cellTowers','ercotZone'],
    counties
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log('Wrote ' + outputPath + ' with ' + Object.keys(counties).length + ' counties');
}

build();
