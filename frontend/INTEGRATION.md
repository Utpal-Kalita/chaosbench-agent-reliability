# Integration notes (backend side)

`frontend/` is a standalone HTML/CSS/JS dashboard (no framework, no build step, no external scripts). It is not a Next.js app.

Changes made when integrating with the real backend (everything else is her original):
1. `live.js` (new). Active only with `?api=<base-url>`. It answers the dashboard's dataset request from the live API: summary, scenarios, runs and the full trace of every run. Replays are excluded from the dataset.
2. `index.html`: one `<script src="live.js">` line, and the replay note no longer says "static build".
3. `app.js`: `findDetail` also reads `data.run_details[run_id]` (live mode); live mode defaults to the live dataset; the overview label reads "pass^3 scenarios (all 3 reps pass)"; the replay result shows the new run id, seed and PASS/FAIL in words before the raw JSON.
Her fixture mode (`sample_results.json`, `real_results_granite.json`) still works without `?api=`; the mock fixture stays labelled MOCK.

Run with the backend: `CB_DB=restored.db CB_MODE=llm uvicorn chaosbench.api:app --port 8000`, then open `http://localhost:8000/ui/?api=http://localhost:8000` (the backend serves this folder at `/ui`). Her `verify.js` and `dom-test.js` still pass (`cd frontend && node verify.js && node dom-test.js`).
