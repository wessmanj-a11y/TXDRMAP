import json
from pathlib import Path
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

TRAINING_FILE = Path('history/training-data.json')
MODEL_FILE = Path('history/ml-risk-model.joblib')
METADATA_FILE = Path('history/ml-risk-metadata.json')
ACCURACY_HISTORY_FILE = Path('history/ml-accuracy-history.json')

FEATURES = [
    'customersOut', 'percentCustomersOut', 'incidents', 'maxSingleOutage',
    'weatherAlerts', 'weatherRisk', 'forecastWindMax6h', 'forecastWindMax12h',
    'forecastPrecipChanceMax12h', 'forecastStormRisk', 'roadClosures',
    'roadClosureRisk', 'trend6h', 'trend12h', 'trend24h', 'trendVelocity',
    'sevenDayPeak'
]

TARGET = 'worsened'
MIN_ROWS = 200
MIN_POSITIVES = 10
MAX_HISTORY_POINTS = 500


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def read_json(path, fallback):
    try:
        return json.loads(path.read_text())
    except Exception:
        return fallback


def write_metadata(payload):
    write_json(METADATA_FILE, payload)


def append_accuracy_history(entry):
    history = read_json(ACCURACY_HISTORY_FILE, {'updated': None, 'points': []})
    points = history.get('points', [])
    points.append(entry)
    points = points[-MAX_HISTORY_POINTS:]
    write_json(ACCURACY_HISTORY_FILE, {
        'updated': utc_now(),
        'source': 'scripts/ml_train.py',
        'points': points
    })


def not_ready(reason, rows=0, positives=0):
    timestamp = utc_now()
    payload = {
        'ok': False,
        'reason': reason,
        'updated': timestamp,
        'rows': rows,
        'positiveExamples': positives,
        'features': FEATURES,
        'target': TARGET
    }
    write_metadata(payload)
    append_accuracy_history({
        'timestamp': timestamp,
        'ok': False,
        'reason': reason,
        'rows': rows,
        'positiveExamples': positives,
        'accuracy': None,
        'precision': None,
        'recall': None
    })
    print(reason)


def main():
    if not TRAINING_FILE.exists():
        not_ready('training-data.json does not exist yet')
        return

    raw = json.loads(TRAINING_FILE.read_text())
    rows = raw.get('rows', [])
    if len(rows) < MIN_ROWS:
        not_ready('not enough rows yet: ' + str(len(rows)) + ' / ' + str(MIN_ROWS), len(rows), 0)
        return

    df = pd.DataFrame(rows)
    for col in FEATURES + [TARGET]:
        if col not in df.columns:
            df[col] = 0

    df = df[FEATURES + [TARGET]].fillna(0)
    positives = int(df[TARGET].sum())

    if positives < MIN_POSITIVES:
        not_ready('not enough worsening examples yet: ' + str(positives) + ' / ' + str(MIN_POSITIVES), len(df), positives)
        return

    X = df[FEATURES]
    y = df[TARGET].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
        stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=10,
        min_samples_leaf=4,
        random_state=42,
        class_weight='balanced'
    )
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE)

    metrics = {
        'accuracy': round(float(accuracy_score(y_test, preds)), 4),
        'precision': round(float(precision_score(y_test, preds, zero_division=0)), 4),
        'recall': round(float(recall_score(y_test, preds, zero_division=0)), 4)
    }

    timestamp = utc_now()
    metadata = {
        'ok': True,
        'updated': timestamp,
        'rows': len(df),
        'positiveExamples': positives,
        'features': FEATURES,
        'target': TARGET,
        'modelFile': str(MODEL_FILE),
        'metrics': metrics,
        'featureImportance': sorted([
            {'feature': f, 'importance': round(float(i), 5)}
            for f, i in zip(FEATURES, model.feature_importances_)
        ], key=lambda x: x['importance'], reverse=True)
    }

    write_metadata(metadata)
    append_accuracy_history({
        'timestamp': timestamp,
        'ok': True,
        'rows': len(df),
        'positiveExamples': positives,
        **metrics
    })

    print('Trained ML model on ' + str(len(df)) + ' rows')
    print(metrics)


if __name__ == '__main__':
    main()
