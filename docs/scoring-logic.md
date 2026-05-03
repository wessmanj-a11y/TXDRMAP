# TXDRMAP Scoring Logic

This document explains how TXDRMAP calculates outage severity, predicted risk, restoration difficulty, FEMA fragility adjustment, and ML risk scoring.

## 1. Current Severity

`currentSeverity` is a rule-based score from 0 to 100 that describes what is happening now in a county.

It is primarily based on:

- Percent of estimated customers currently out
- Number of outage incidents
- Largest single outage cluster
- Current weather risk modifier

High current severity means the county already has meaningful outage impact.

### Main intent

Current severity answers:

> How bad is the outage situation right now?

It should not be treated as a prediction by itself.

---

## 2. Predicted Risk

`predictedRisk` is a rule-based forward-looking risk score from 0 to 100.

It considers:

- Current outage load
- Current incident count
- Weather alert pressure
- Structured warning pressure
- Forecast storm risk
- SPC outlook risk
- Short-term worsening trends
- FEMA fragility boost

### Main intent

Predicted risk answers:

> How likely is this county to worsen or become operationally important soon?

---

## 3. Weather and Alert Intelligence

TXDRMAP ingests National Weather Service alert data and converts it into structured operational features.

Examples include:

- `weatherAlerts`
- `weatherRisk`
- `alertWarningCount`
- `alertWatchCount`
- `tornadoWarningCount`
- `severeThunderstormWarningCount`
- `flashFloodWarningCount`
- `highWindWarningCount`
- `maxAlertSeverityScore`
- `maxAlertUrgencyScore`
- `maxAlertCertaintyScore`

These features are intended to distinguish between general weather awareness and higher-impact active warnings.

A tornado warning, severe thunderstorm warning, high wind warning, or winter storm warning should create more risk pressure than a generic advisory.

---

## 4. Forecast Weather Intelligence

TXDRMAP uses county-level forecast data from the National Weather Service hourly forecast API.

Important forecast features include:

- `forecastWindMax6h`
- `forecastWindMax12h`
- `forecastPrecipChanceMax12h`
- `forecastStormRisk`
- `forecastSummary12h`

These features help identify risk before warnings are active.

### Main intent

Forecast features answer:

> Is weather likely to create new outage pressure soon?

---

## 5. SPC Outlook Risk

TXDRMAP ingests Storm Prediction Center convective outlook data and maps it into county-level risk.

Fields include:

- `spcRisk`
- `spcCategory`

SPC risk is intended to be an early severe-weather signal before local warnings are issued.

### Main intent

SPC risk answers:

> Is this county in a broader severe weather risk area before storms arrive?

SPC should influence predictions, but it should not dominate scoring by itself because it is broad and event-level rather than outage-specific.

---

## 6. FEMA County Fragility

TXDRMAP uses FEMA National Risk Index county data as a static baseline vulnerability layer.

Fields include:

- `femaRiskScore`
- `femaExpectedAnnualLoss`
- `femaSocialVulnerability`
- `femaCommunityResilience`
- `femaStrongWindRisk`
- `femaTornadoRisk`
- `femaLightningRisk`
- `femaIceStormRisk`
- `femaWildfireRisk`
- `baselineCountyFragility`

FEMA does not represent real-time conditions. It represents structural county vulnerability.

### Main intent

FEMA fragility answers:

> If stress occurs, how vulnerable is this county likely to be?

---

## 7. FEMA Fragility Boost

FEMA is used as a conditional modifier, not as the basis of risk.

The current logic is:

```text
fragilityBoost = baselineCountyFragility × totalStress × 0.001
```

The boost is capped at 8 points.

`totalStress` is based on outage stress plus weather stress.

This means:

- A quiet but fragile county should not look dangerous by default.
- A fragile county under weather or outage stress gets a modest risk increase.
- Real-time conditions remain the primary driver.

### Main intent

FEMA should modify risk when pressure exists. It should not create high risk alone.

---

## 8. Restoration Difficulty

`restorationDifficulty` estimates how difficult recovery may be once outages exist.

It considers:

- Current outage load
- Number of incidents
- Weather/access pressure

### Main intent

Restoration difficulty answers:

> If this county has outages, how hard might restoration be?

This is different from predicted risk. A county can have high restoration difficulty because it already has large outages, even if future worsening risk is moderate.

---

## 9. ML Risk Scoring

TXDRMAP trains a Random Forest model using historical county snapshots.

The target is:

```text
worsened
```

A county is labeled as worsened when future outage load increases enough over the lookahead window.

The model outputs:

- `mlRiskProbability`
- `mlRiskScore`
- `mlRiskBand`
- `mlScoringMode`

The model uses features such as:

- Current outages
- Percent customers out
- Incidents
- Trends
- Forecast weather
- NWS alerts
- SPC risk
- FEMA fragility
- Restoration-related signals

### Main intent

ML scoring answers:

> Based on historical patterns, how likely is this county to worsen?

---

## 10. Blended Predicted Risk

TXDRMAP keeps both rule-based and ML-based scoring.

The rule score provides operational consistency and explainability.

The ML score provides learned historical pattern recognition.

The blended score is intended to combine both.

Current blend concept:

```text
blendedPredictedRisk = ruleRisk × 0.45 + mlRiskScore × 0.55
```

This gives the trained model more influence while keeping the score anchored to deterministic logic.

---

## 11. Risk Bands

Risk scores are converted into simple bands:

```text
0–24   = Low
25–49  = Watch
50–74  = Elevated
75–100 = High
```

These bands are designed for dashboard interpretation and quick operational awareness.

---

## 12. Important Design Principles

### Live conditions should dominate

Current outages, trends, warnings, and forecasts should drive the majority of risk.

### Static vulnerability should modify, not dominate

FEMA fragility should raise concern only when stress exists.

### Sparse features should be monitored

SPC and alert subtype fields may have low importance if they are rarely populated. This does not necessarily mean they are useless; it may mean more data cycles are needed or feature engineering should improve.

### Model quality should be evaluated with F1

Accuracy alone can be misleading. Precision, recall, and F1 should be tracked over time.

- Precision asks: When the model predicts worsening, how often is it right?
- Recall asks: Of the counties that worsened, how many did the model catch?
- F1 balances precision and recall.

---

## 13. Current Feature Engineering Priorities

Near-term improvements to consider:

1. Add interaction features such as `baselineCountyFragility × forecastWindMax12h`.
2. Improve SPC county matching and risk distribution.
3. Add road closure data as a restoration/access complexity signal.
4. Add vegetation/tree canopy as a line-strike and wind-damage vulnerability layer.
5. Add rainfall/soil saturation because wet soil plus wind increases tree-fall risk.

---

## 14. Summary

TXDRMAP scoring is designed as a layered system:

```text
Current outage impact
+ Weather and forecast pressure
+ Severe weather outlook
+ County vulnerability
+ Historical ML pattern recognition
= Operational outage risk intelligence
```

The goal is not just to show where outages are happening.

The goal is to identify where outage conditions may worsen, where restoration may become difficult, and where pre-event action may be justified.
