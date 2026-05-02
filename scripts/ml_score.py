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
    'weatherAlerts', 'weatherRisk',
    'alertWarningCount', 'alertWatchCount', 'alertAdvisoryCount',
    'tornadoWarningCount', 'tornadoWatchCount',
    'severeThunderstormWarningCount', 'severeThunderstormWatchCount',
    'flashFloodWarningCount', 'floodWarningCount',
    'winterStormWarningCount', 'highWindWarningCount',
    'maxAlertSeverityScore', 'maxAlertUrgencyScore', 'maxAlertCertaintyScore',
    'forecastWindMax6h', 'forecastWindMax12h',
    'forecastPrecipChanceMax12h', 'forecastStormRisk',
    'roadClosures', 'roadClosureRisk',
    'trend6h', 'trend12h', 'trend24h', 'trendVelocity',
    'sevenDayPeak'
]


def utc_now():
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


def fallback_score(row):
    rule_score = num(row.get('predictedRisk'))
    forecast = num(row.get('forecastStormRisk'))
    warning_pressure = (
        num(row.get('tornadoWarningCount')) * 12 +
        num(row.get('severeThunderstormWarningCount')) * 9 +
        num(row.get('highWindWarningCount')) * 10 +
        num(row.get('winterStormWarningCount')) * 10 +
        num(row.get('flashFloodWarningCount')) * 4 +
        num(row.get('maxAlertSeverityScore')) * 2 +
        num(row.get('maxAlertUrgencyScore')) * 2
    )
    trend = max(0, num(row.get('trend6h')))
    trend_boost = min(15, trend ** 0.5)
    return round(min(100, (rule_score * 0.65) + (forecast * 0.12) + min(18, warning_pressure) + trend_boost))


def load_metadata():
    if not METADATA_FILE.exists():
        return {}
    try:
        return json.loads(METADATA_FILE.read_text())
    except Exception:
        return {}


def build_feature_frame(rows, feature_list):
    records = []
    for row in rows:
        records.append({feature: num(row.get(feature)) for feature in feature_list})
    return pd.DataFrame(records, columns=feature_list).fillna(0)


def score_with_model(rows, metadata):
    if not MODEL_FILE.exists():
        raise FileNotFoundError(str(MODEL_FILE))
    if not metadata.get('ok'):
        raise RuntimeError('ML metadata is not marked ok')

    trained_features = metadata.get('features') or FEATURES
    model = joblib.load(MODEL_FILE)
    X = build_feature_frame(rows, trained_features)
    probabilities = model.predict_proba(X)[:, 1]
    return [round(float(prob), 4) for prob in probabilities]


def apply_scores(rows, probabilities, mode):
    for row, probability in zip(rows, probabilities):
        ml_score = round(probability * 100)
        rule_score = num(row.get('predictedRisk'))
        row['mlRiskProbability'] = probability
        row['mlRiskScore'] = ml_score
        row['mlRiskBand'] = band(ml_score)
        row['blendedPredictedRisk'] = round((rule_score * 0.45) + (ml_score * 0.55))
        row['predictedRiskBand'] = band(row['blendedPredictedRisk'])
        row['mlScoringMode'] = mode


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
        probabilities = score_with_model(rows, metadata)
    except Exception as error:
        mode = 'fallback-scoring'
        fallback_reason = str(error)
        probabilities = [round(fallback_score(row) / 100, 4) for row in rows]

    apply_scores(rows, probabilities, mode)

    payload['mlRisk'] = {
        'ok': True,
        'mode': mode,
        'updated': utc_now(),
        'rowsScored': len(rows),
        'metadataOk': bool(metadata.get('ok')),
        'modelFile': str(MODEL_FILE),
        'features': metadata.get('features') or FEATURES,
        'metrics': metadata.get('metrics'),
        'fallbackReason': fallback_reason
    }

    OUTAGES_FILE.write_text(json.dumps(payload, indent=2))
    print(f'Scored {len(rows)} rows using {mode}')
    if fallback_reason:
        print('Fallback reason: ' + fallback_reason)


if __name__ == '__main__':
    main()
