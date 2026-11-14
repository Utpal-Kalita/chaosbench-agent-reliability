# ChaosBench — Frontend Contract v1

Source: the backend contract notes agreed between the frontend and backend authors on 2026-11-14.

- Contract definition: contract v1 (unchanged), including backend freeze and startup notes.
- Fixture: `sample_results.json` (mock dataset, 24,839 bytes).
- Real dataset: `real_results_granite.json` (granite-4.0-h-micro, 30 runs)
  (30,037 bytes).

## Endpoints (contract v1)

| Endpoint | Fixture key |
|---|---|
| `GET /api/summary` | `summary` |
| `GET /api/scenarios` | `scenarios` |
| `GET /api/runs` | `runs` |
| `GET /api/runs/{run_id}` | `run_detail_example` (one example run only) |

## Data shapes (as shipped in the fixture)

### summary
- `mode`: `"mock"` | `"llm"` — mock data must show a visible MOCK badge.
- `model`: e.g. `"scripted-mock-v1"`, `"@cf/ibm-granite/granite-4.0-h-micro"`.
- `total_runs`: 30.
- `agents[]`: `{agent, runs, success_rate, recovery_rate, avg_tool_calls,
  avg_steps, total_tokens, avg_latency_ms, policy_violations, duplicate_refunds}`
  - `total_tokens` may be `null` → render **n/a**, never 0.
  - Tokens may also surface as the string `"unavailable"` → render **n/a**.
- `pass_k[]`: `{scenario_id, baseline, baseline_passes, resilient,
  resilient_passes}` — `baseline_passes` is a string like `"2/3"`;
  `baseline`/`resilient` are booleans (pass^k met = all reps passed).

### scenarios[]
`{id, name, fault, description}` — fault codes seen: `none`, `api_503`,
`malformed_json`, `prompt_injection`, `duplicate_risk`.

### runs[] — 30 rows (5 scenarios × 2 agents × 3 reps)
`{run_id, scenario_id, agent, rep, seed, passed, outcome_reason, tool_calls,
steps, tokens_in, tokens_out, latency_ms, retries, faults_injected,
faults_recovered, policy_violations, duplicate_refunds, mode, model,
replay_of, final_message, model_error}`.
- `seed`: integer in this fixture (the backend notes said seeds are
  `sha256("CB-0X:rep")[:8]` — the fixture carries integers; the dashboard
  renders whatever the field holds and does not assume a format).
- `replay_of`: `null` for original runs; replay runs are excluded from the
  benchmark summary (per the backend notes).

### run detail (`GET /api/runs/{run_id}`)
Same run fields plus:
- `events[]`: `{step, ts, event, tool, status, error, detail, tokens_in,
  tokens_out, latency_ms}` — event types seen: `model_request`, `tool_call`,
  `tool_response`, `final`. Fault markers come from `status`/`error` on
  `tool_response` events (e.g. a 503) and from `retries` on the run.
- `evaluation`: `{checks[]: {name, passed, expected, actual}}`.

## Honesty rules (project rules)

1. If `mode` is `"mock"`, render a visible **MOCK MODE** badge anywhere the
   data is shown.
2. Null / `"unavailable"` metrics render **n/a** — never 0, never an estimate.
3. Recovery rates where no faults were injected render **n/a**.
4. Deck/dashboard must never overclaim: the real-LLM dataset is a first
   measured data point (30 runs, one model), not a final benchmark.
   Honest story: recovery differs measurably under injected API failure only;
   no broad superiority claim.

## Failure Replay (stretch)

- Endpoint: `POST /api/runs/{run_id}/replay` (exists on the contract-v1
  backend; verified working with same seed+fault; replay runs excluded from
  the benchmark summary).
- This static folder has **no live backend**, so the dashboard exposes Replay
  as a hook only: when opened with `?api=<base-url>` it POSTs to the backend
  and shows the result; without `?api=` the button is disabled with an
  explicit "no live backend connected" note. No replay behaviour is faked
  client-side.

## Gaps / assumptions (nothing invented silently)

1. **Only one run ships event-level detail.** The fixture contains a single
   `run_detail_example` (RUN_a1f3da14, CB-01 resilient rep 2). The trace
   timeline shows full events only for that run; for any other selected run
   it shows the run's summary fields and states plainly that event-level
   trace is not included in this fixture (a live backend would serve it via
   `GET /api/runs/{run_id}`).
2. **Fixture ≠ parent's local snapshot numbers.** The fixture's mock summary
   (baseline success 0.40, resilient 0.80; pass^k CB-04 resilient 0/3) is the
   contract-v1 foundation backend's data. It differs from the parent agent's
   earlier local build (`~/workspace/chaosbench/results/results.json`:
   baseline 0.20, resilient 1.00). This dashboard renders the fixture as
   given; it does not merge or reconcile the two datasets.
3. **No live backend URL is known to this folder.** Data is loaded from the
   bundled JSON files (`sample_results.json` default; `real_results_granite.json`
   via the dataset switch or `?data=real_results_granite.json`). When served
   over HTTP the files are fetched; when opened from `file://` the embedded
   copies in `data.js` are used (generated verbatim from the JSON files).
4. **Latency in the mock fixture is 0.0 ms** (`avg_latency_ms: 0.0`,
   per-run `latency_ms: 0`). Rendered as given; the MOCK badge is the
   context that these are scripted runs, not measured timings.
5. **No Bifrost integration** in either dataset (per the backend notes).
6. **No contract for a "stronger-model check" dataset** (10/10 both agents,
   mentioned in the backend notes) — no file was provided, so it is not
   represented in this dashboard.
