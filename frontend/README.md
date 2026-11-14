# ChaosBench — standalone frontend dashboard

Static HTML/CSS/JS dashboard for the ChaosBench contract-v1 backend.
No build step, no frameworks, no CDN dependencies. Dark developer-tool
aesthetic matching the project (`#0D1310` background, `#2FBF71` accent).

## Run it

```sh
# served over HTTP (fetch path; both datasets loadable)
python3 -m http.server 8000
# then open http://127.0.0.1:8000/

# or open index.html directly from file:// (embedded data fallback)
```

- Dataset switch (top right): **Mock fixture** (`sample_results.json`, default)
  or **Real LLM — Granite 4.0 H micro** (`real_results_granite.json`).
  Also selectable via `?data=real_results_granite.json`.
- **Failure Replay** needs a live backend: open with
  `?api=<base-url>` (e.g. `?api=http://127.0.0.1:8000`) and the Replay button
  POSTs to `{base}/api/runs/{run_id}/replay`. Without `?api=` the button is
  disabled with an explicit note — nothing is simulated client-side.

## Files

| File | What it is |
|---|---|
| `index.html` | Page structure (cards, tables, timeline, replay section) |
| `style.css` | Dark dev-tool styling |
| `app.js` | Data loading + rendering. Pure data functions are exported for node testing (`module.exports`) and guarded so the file also loads in a browser |
| `data.js` | Embedded fallback copies of both datasets (verbatim, generated — see below) |
| `sample_results.json` | Mock fixture (scripted agents, mock mode) |
| `real_results_granite.json` | Real-LLM dataset (granite-4.0-h-micro, 30 runs) |
| `CONTRACT.md` | Contract v1 fields, sources, honesty rules, gaps/assumptions |
| `verify.js` | Node checks of the data functions against both fixtures (43 checks) |
| `dom-test.js` | End-to-end render test: boots the real `app.js` against a minimal DOM shim and asserts rendered values for both datasets (26 checks each) |

## Regenerating data.js

`data.js` is generated verbatim from the two JSON files (never hand-edited):

```sh
python3 - <<'EOF'
import json
mock = json.load(open('sample_results.json'))
real = json.load(open('real_results_granite.json'))
out = ['// Embedded fallback copies of the datasets, generated verbatim from',
       '// sample_results.json and real_results_granite.json (same folder).',
       '// Used when the page is opened from file:// (fetch is blocked there).',
       '// Regenerate with: python3 -c ... (see README.md).',
       'window.CHAOSBENCH_EMBEDDED = {',
       '  "sample_results.json": ' + json.dumps(mock) + ',',
       '  "real_results_granite.json": ' + json.dumps(real),
       '};']
open('data.js','w').write('\n'.join(out) + '\n')
EOF
```

## Verification (all executed 2026-11-14)

- `node verify.js` → **43 checks passed** (honesty helpers, mock + real
  headline numbers, per-scenario pass counts, run lookup, detail lookup,
  event classification).
- `node dom-test.js` → **26 render checks passed** (mock dataset: MOCK badge,
  cards, comparison table, scenario table, timeline of the example run,
  evaluation checks, disabled Replay, honest "no event trace" for other runs).
- `QS='?data=real_results_granite.json' node dom-test.js` → **26 render checks
  passed** (REAL LLM badge with model name, 80.0%/100.0% success, tokens
  54632/55834, real example run timeline).
- `python3 -m http.server` + curl → all 7 served files return **HTTP 200**.
- Embedded copies in `data.js` verified **byte-identical in content** to the
  two JSON files.

## What was NOT verified

No headless browser is available on this machine, so the page was not
screenshot-verified in a real browser. Rendering was verified instead by
booting the actual `app.js` against a minimal DOM shim in node and asserting
the rendered HTML strings (`dom-test.js`). Open `index.html` in a real browser
before presenting it — the layout is plain CSS grid/tables and should render
as designed, but that step is still open.

## Constraints honoured

- Backend untouched: nothing in `~/workspace/chaosbench/chaosbench/` or the
  existing FastAPI viewer was modified. Deck untouched. Nothing pushed to
  any repo; nobody emailed.
- Honesty: mock data always shows a MOCK MODE badge; null/`"unavailable"`
  metrics render **n/a**, never 0; recovery is n/a where no faults were
  injected; the trace timeline states plainly when a run has no event-level
  detail in the fixture.
- Known gap: the fixture ships exactly one detailed run (`run_detail_example`);
  every other run's timeline shows its summary fields plus that notice.
  See `CONTRACT.md` for the full gap list.
