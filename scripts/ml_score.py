import json
from pathlib import Path
from datetime import datetime, timezone

OUTAGES_FILE = Path('outages.json')
METADATA_FILE = Path('history/ml-risk-metadata.json')


def band(score):
    if score >= 75:
        return 'High'
    if score >= 50:
        return 'Elevated'
    if score >= 25:
        return 'Watch'
    return 'Low'


def num(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def fallback_score(row):
    rule_score = num(row.get('predictedRisk'))
    forecast = num(row.get('forecastStormRisk'))
    trend = max(0, num(row.get('trend6h')))
    trend_boost = min(15, trend ** 0.5)
    return round(min(100, (rule_score * 0.75) + (forecast * 0.15) + trend_boost))


def main():
    if not OUTAGES_FILE.exists():
        print('No outages.json found')
        return

    payload = json.loads(OUTAGES_FILE.read_text())
    rows = payload.get('outages', [])

    metadata = {}
    if METADATA_FILE.exists():
        metadata = json.loads(METADATA_FILE.read_text())

    for row in rows:
        score = fallback_score(row)
        row['mlRiskProbability'] = round(score / 100, 4)
        row['mlRiskScore'] = score
        row['mlRiskBand'] = band(score)
        row['blendedPredictedRisk'] = round((num(row.get('predictedRisk')) * 0.6) + (score * 0.4))

    payload['mlRisk'] = {
        'ok': True,
        'mode': 'fallback-scoring-until-trained-model-is-ready',
        'updated': datetime.now(timezone.utc).isoformat(),
        'rowsScored': len(rows),
        'metadataOk': bool(metadata.get('ok')),
        'note': 'Stable TXDRMAP scoring scaffold. Can be upgraded to joblib model once enough training history exists.'
    }

    OUTAGES_FILE.write_text(json.dumps(payload, indent=2))
    print(f'Scored {len(rows)} outage rows')


if __name__ == '__main__':
    main()
