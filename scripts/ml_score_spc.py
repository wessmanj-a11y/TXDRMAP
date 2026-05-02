import json
from pathlib import Path
from datetime import datetime, timezone

import joblib
import pandas as pd

OUTAGES_FILE = Path('outages.json')
METADATA_FILE = Path('history/ml-risk-metadata.json')
MODEL_FILE = Path('history/ml-risk-model.joblib')

FEATURES = [
    'customersOut', 'percentCustomersOut', 'incidents', 'maxSingleOutage',
    'weatherAlerts', 'weatherRisk', 'alertWarningCount', 'alertWatchCount',
    'alertAdvisoryCount', 'tornadoWarningCount', 'tornadoWatchCount',
    'severeThunderstormWarningCount', 'severeThunderstormWatchCount',
    'flashFloodWarningCount', 'floodWarningCount', 'winterStormWarningCount',
    'highWindWarningCount', 'maxAlertSeverityScore', 'maxAlertUrgencyScore',
    'maxAlertCertaintyScore', 'spcRisk', 'forecastWindMax6h',
    'forecastWindMax12h', 'forecastPrecipChanceMax12h', 'forecastStormRisk',
    'roadClosures', 'roadClosureRisk', 'trend6h', 'trend12h', 'trend24h',
    'trendVelocity', 'sevenDayPeak'
]


def now():
    return datetime.now(timezone.utc).isoformat()


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


def load_metadata():
    try:
        return json.loads(METADATA_FILE.read_text()) if METADATA_FILE.exists() else {}
    except Exception:
        return {}


def build_frame(rows, features):
    return pd.DataFrame([{f: num(row.get(f)) for f in features} for row in rows], columns=features).fillna(0)


def fallback_score(row):
    base = num(row.get('predictedRisk'))
    forecast = num(row.get('forecastStormRisk'))
    spc = num(row.get('spcRisk'))
    pressure = min(18,
        num(row.get('tornadoWarningCount')) * 12 +
        num(row.get('severeThunderstormWarningCount')) * 9 +
        num(row.get('highWindWarningCount')) * 10 +
        num(row.get('winterStormWarningCount')) * 10 +
        num(row.get('flashFloodWarningCount')) * 4 +
        num(row.get('maxAlertSeverityScore')) * 2 +
        num(row.get('maxAlertUrgencyScore')) * 2
    )
    trend_boost = min(15, max(0, num(row.get('trend6h'))) ** 0.5)
    return round(min(100, (base * 0.6) + (forecast * 0.1) + (spc * 0.12) + pressure + trend_boost))


def score_model(rows, metadata):
    if not MODEL_FILE.exists() or not metadata.get('ok'):
        raise RuntimeError('model unavailable')
    features = metadata.get('features') or FEATURES
    model = joblib.load(MODEL_FILE)
    probs = model.predict_proba(build_frame(rows, features))[:, 1]
    return [round(float(p), 4) for p in probs]


def main():
    if not OUTAGES_FILE.exists():
        print('No outages.json found')
        return
    payload = json.loads(OUTAGES_FILE.read_text())
    rows = payload.get('outages', [])
    metadata = load_metadata()
    mode = 'trained-model'
    fallback_reason = None
    try:
        probs = score_model(rows, metadata)
    except Exception as e:
        mode = 'fallback-scoring'
        fallback_reason = str(e)
        probs = [round(fallback_score(row) / 100, 4) for row in rows]

    for row, prob in zip(rows, probs):
        ml = round(prob * 100)
        rule = num(row.get('predictedRisk'))
        row['mlRiskProbability'] = prob
        row['mlRiskScore'] = ml
        row['mlRiskBand'] = band(ml)
        row['blendedPredictedRisk'] = round((rule * 0.45) + (ml * 0.55))
        row['predictedRiskBand'] = band(row['blendedPredictedRisk'])
        row['mlScoringMode'] = mode

    payload['mlRisk'] = {
        'ok': True,
        'mode': mode,
        'updated': now(),
        'rowsScored': len(rows),
        'metadataOk': bool(metadata.get('ok')),
        'modelFile': str(MODEL_FILE),
        'features': metadata.get('features') or FEATURES,
        'metrics': metadata.get('metrics'),
        'fallbackReason': fallback_reason
    }
    OUTAGES_FILE.write_text(json.dumps(payload, indent=2))
    print(f'Scored {len(rows)} rows using {mode}')


if __name__ == '__main__':
    main()
