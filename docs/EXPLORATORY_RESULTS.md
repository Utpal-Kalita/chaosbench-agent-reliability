# Exploratory result: CB-06 (injected model outage)

Preregistered in `PREREGISTRATION.md` before the run. Reported next to, not merged into, the original 30-run dataset.

Model: `@cf/ibm-granite/granite-4.0-h-micro` on Cloudflare Workers AI (free plan), 3 reps x 2 agents = 6 runs, all attempts retained, 0 excluded provider errors.
Raw data: `results/exploratory_cb06_granite-4.0-h-micro.sql`.

| Agent | pass | note |
|---|---|---|
| baseline | 0/3 | stops after the injected model error, no refund recorded |
| resilient | 3/3 | retries the model request and completes |

Matches the preregistered expectation. Caveat: the outage is injected by the harness and the resilient agent has explicit model-retry logic, so this shows the recovery path works. It is not evidence about any provider's real reliability, and n=3 per cell is small.
