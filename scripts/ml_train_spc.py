import json
from pathlib import Path
from datetime import datetime, timezone

import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split

TRAINING_FILE = Path('history/training-data.json')
MODEL_FILE = Path('history/ml-risk-model.joblib')
METADATA_FILE = Path('history/ml-risk-metadata.json')
ACCURACY_HISTORY_FILE = Path('history/ml-accuracy-history.json')

FEATURES = [
    'customersOut', 'percentCustomersOut', 'incidents', 'maxSingleOutage',
    'weatherAlerts', 'weatherRisk', 'alertWarningCount', 'alertWatchCount',
    'alertAdvisoryCount', 'tornadoWarningCount', 'tornadoWatchCount',
    'severeThunderstormWarningCount', 'severeThunderstormWatchCount',
    'flashFloodWarningCount', 'floodWarningCount', 'winterStormWarningCount',
    'highWindWarningCount', 'maxAlertSeverityScore', 'maxAlertUrgencyScore',
    'maxAlertCertaintyScore', 'spcRisk', 'forecastWindMax6h',
    'forecastWindMax12h', 'forecastPrecipChanceMax12h', 'forecastStormRisk',
    'roadClosures', 'roadClosureRisk', 'femaRiskScore',
    'baselineCountyFragility', 'femaExpectedAnnualLoss',
    'femaSocialVulnerability', 'femaCommunityResilience',
    'femaStrongWindRisk', 'femaTornadoRisk',
    'historicalAvgPercentOut', 'historicalP95PercentOut', 'historicalP99PercentOut',
    'historicalMonthlyAvgPercentOut', 'historicalMonthlyP95PercentOut',
    'historicalOutageVolatilityScore', 'outageVsHistoricalAvg',
    'outageVsHistoricalP95', 'outageVsHistoricalP99', 'outageVsHistoricalMonthlyP95',
    'percentOutMinusHistoricalAvg', 'percentOutMinusHistoricalMonthlyP95',
    'historicalPercentileRank', 'volatilityAdjustedAnomaly', 'historicalAnomalyScore',
    'trend6h', 'trend12h', 'trend24h', 'trendVelocity',
    'decayedSevenDayPeak', 'sevenDayPeak'
]

TARGET = 'worsened'
MIN_RECALL_TARGET = 0.60
PRECISION_TARGET = 0.55
DEFAULT_THRESHOLD = 0.50
THRESHOLD_MIN = 0.40
THRESHOLD_MAX = 0.90
THRESHOLD_STEP = 0.01

def now():
    return datetime.now(timezone.utc).isoformat()

def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))

def read_json(path, fallback):
    try:
        return json.loads(path.read_text())
    except Exception:
        return fallback

def calc_f1(p, r):
    try:
        p = float(p)
        r = float(r)
        return 0.0 if p <= 0 or r <= 0 else round(2 * p * r / (p + r), 4)
    except Exception:
        return None

def append_history(entry):
    history = read_json(ACCURACY_HISTORY_FILE, {'points': []})
    points = history.get('points', [])
    for point in points:
        if point.get('f1') is None and point.get('precision') is not None and point.get('recall') is not None:
            point['f1'] = calc_f1(point.get('precision'), point.get('recall'))
    points.append(entry)
    write_json(ACCURACY_HISTORY_FILE, {'updated': now(), 'source': 'scripts/ml_train_spc.py', 'points': points[-500:]})

def not_ready(reason, rows=0, positives=0):
    ts = now()
    payload = {
        'ok': False,
        'reason': reason,
        'updated': ts,
        'rows': rows,
        'positiveExamples': positives,
        'features': FEATURES,
        'target': TARGET,
        'calibration': {
            'selectedThreshold': DEFAULT_THRESHOLD,
            'minRecallTarget': MIN_RECALL_TARGET,
            'precisionTarget': PRECISION_TARGET,
            'status': 'not-ready'
        }
    }
    write_json(METADATA_FILE, payload)
    append_history({'timestamp': ts, 'ok': False, 'reason': reason, 'rows': rows, 'positiveExamples': positives, 'accuracy': None, 'precision': None, 'recall': None, 'f1': None, 'selectedThreshold': DEFAULT_THRESHOLD})
    print(reason)

def metrics_for_threshold(y_true, probs, threshold):
    preds = (probs >= threshold).astype(int)
    return {
        'threshold': round(float(threshold), 2),
        'accuracy': round(float(accuracy_score(y_true, preds)), 4),
        'precision': round(float(precision_score(y_true, preds, zero_division=0)), 4),
        'recall': round(float(recall_score(y_true, preds, zero_division=0)), 4),
        'f1': round(float(f1_score(y_true, preds, zero_division=0)), 4),
        'predictedPositiveRate': round(float(preds.mean()), 4)
    }

def choose_threshold(y_true, probs):
    sweep = []
    for threshold in np.arange(THRESHOLD_MIN, THRESHOLD_MAX + 0.0001, THRESHOLD_STEP):
        sweep.append(metrics_for_threshold(y_true, probs, threshold))

    viable = [m for m in sweep if m['recall'] >= MIN_RECALL_TARGET]
    precision_viable = [m for m in viable if m['precision'] >= PRECISION_TARGET]

    if precision_viable:
        selected = sorted(
            precision_viable,
            key=lambda m: (m['precision'], m['f1'], m['recall'], m['threshold']),
            reverse=True
        )[0]
        reason = 'met precision and recall targets'
    elif viable:
        selected = sorted(
            viable,
            key=lambda m: (m['precision'], m['f1'], m['threshold']),
            reverse=True
        )[0]
        reason = 'best precision while keeping recall target'
    else:
        selected = sorted(
            sweep,
            key=lambda m: (m['f1'], m['precision'], m['recall']),
            reverse=True
        )[0]
        reason = 'fallback to best f1 because no threshold met recall target'

    compact_sweep = [m for m in sweep if round((m['threshold'] * 100) % 5, 6) == 0]
    return selected, compact_sweep, reason

def main():
    if not TRAINING_FILE.exists():
        not_ready('training-data.json does not exist yet')
        return

    rows = read_json(TRAINING_FILE, {'rows': []}).get('rows', [])
    if len(rows) < 200:
        not_ready('not enough rows yet: ' + str(len(rows)) + ' / 200', len(rows), 0)
        return

    df = pd.DataFrame(rows)
    for col in FEATURES + [TARGET]:
        if col not in df.columns:
            df[col] = 0
    df = df[FEATURES + [TARGET]].fillna(0)
    positives = int(df[TARGET].sum())
    if positives < 10:
        not_ready('not enough worsening examples yet: ' + str(positives) + ' / 10', len(df), positives)
        return

    X = df[FEATURES]
    y = df[TARGET].astype(int)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

    model = RandomForestClassifier(n_estimators=500, max_depth=14, min_samples_leaf=3, random_state=42, class_weight='balanced')
    model.fit(X_train, y_train)
    probs = model.predict_proba(X_test)[:, 1]
    selected, threshold_sweep, selection_reason = choose_threshold(y_test, probs)
    preds = (probs >= selected['threshold']).astype(int)

    MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE)

    metrics = {
        'accuracy': round(float(accuracy_score(y_test, preds)), 4),
        'precision': round(float(precision_score(y_test, preds, zero_division=0)), 4),
        'recall': round(float(recall_score(y_test, preds, zero_division=0)), 4),
        'f1': round(float(f1_score(y_test, preds, zero_division=0)), 4)
    }
    ts = now()
    metadata = {
        'ok': True,
        'updated': ts,
        'rows': len(df),
        'positiveExamples': positives,
        'features': FEATURES,
        'target': TARGET,
        'modelFile': str(MODEL_FILE),
        'metrics': metrics,
        'calibration': {
            'selectedThreshold': selected['threshold'],
            'selectedThresholdPct': round(selected['threshold'] * 100),
            'selectionReason': selection_reason,
            'minRecallTarget': MIN_RECALL_TARGET,
            'precisionTarget': PRECISION_TARGET,
            'selectedMetrics': selected,
            'thresholdSweep': threshold_sweep
        },
        'featureImportance': sorted([
            {'feature': f, 'importance': round(float(i), 5)}
            for f, i in zip(FEATURES, model.feature_importances_)
        ], key=lambda item: item['importance'], reverse=True)
    }
    write_json(METADATA_FILE, metadata)
    append_history({
        'timestamp': ts,
        'ok': True,
        'rows': len(df),
        'positiveExamples': positives,
        'selectedThreshold': selected['threshold'],
        'selectionReason': selection_reason,
        **metrics
    })
    print('Trained ML model on ' + str(len(df)) + ' rows')
    print('Selected threshold:', selected['threshold'], selection_reason)
    print(metrics)

if __name__ == '__main__':
    main()
