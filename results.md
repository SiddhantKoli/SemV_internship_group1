# AquaPulse QA run results

- Base URL: `http://127.0.0.1:8001`
- Started: 2026-11-05T19:44:14.443492+00:00
- Cases: 1 · runs per case: 1
- These are actual recorded responses. Review full requests and raw response bodies in `results.json`.

| Case | Category | HTTP status | Model route | Latency (s) | Auto-check flags | Actual answer preview |
|---|---|---:|---|---:|---|---|
| FIX-FORECAST-7DAY | weather_forecast | 200 | live weather data | 0.80 | none | Open-Meteo's forecast for the Pālghar settlement point for the next 7 days: 06 Nov: 0.0 mm rain, 0% rain probability, max wind 14 km/h, 24.2–34.9°C; 07 Nov: 0.0 mm rain, 0% rain pr… |

## Manual checks still required

See `QA_TESTING.md` for the manual checklist. Automated checks do not replace review of source grounding, safety, and answer quality.
