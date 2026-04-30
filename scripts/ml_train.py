import json
from pathlib import Path
from datetime import datetime, timezone

TRAINING_FILE = Path('history/training-data.json')
METADATA_FILE = Path('history/ml-risk-metadata.json')

FEATURES = [
    'customersOut', 'percentCustomersOut', 'incidents', 'maxSingleOutage',
    'weatherAlerts', 'weatherRisk', 'forecastWindMax6h', 'forecastWindMax12h',
    'forecastPrecipChanceMax12h', 'forecastStormRisk', 'roadClosures',
    'roadClosureRisk', 'trend6h', 'trend12h', 'trend24h', 'trendVelocity',
    'sevenDayPeak'
]

def main():
    rows = []
    if TRAINING_FILE.exists():
        rows = json.loads(TRAINING_FILE.read_text()).get('rows', [])

    positives = sum(1 for r in rows if r.get('worsened'))

    payload = {
        'ok': len(rows) >= 200,
        'updated': datetime.now(timezone.utc).isoformat(),
        'rows': len(rows),
        'positiveExamples': positives,
        'features': FEATURES,
        'target': 'worsened',
        'note': 'Phase 2 scaffold active; upgrade to sklearn trainer next'
    }

    METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    METADATA_FILE.write_text(json.dumps(payload, indent=2))
    print(payload)

if __name__ == '__main__':
    main()
