# Metric definitions

All values come from executed runs. `null` means unavailable (never 0).

| Metric | Definition |
|---|---|
| success_rate | passed runs / valid runs. A run passes only if the deterministic evaluator (database state) says so. The agent's final message is ignored. |
| recovery_rate | faults_recovered / faults_injected, where a fault counts as recovered if the run containing it passed. `null` when no fault was injected. |
| pass^k (k=3) | a scenario passes for an agent only if all 3 repetitions pass. Reported as `n/3` too. |
| tool_calls / steps | tool executions (incl. retries) / model requests |
| tokens | provider-reported prompt+completion tokens summed over the run. `null` if the provider did not report them. |
| latency_ms | wall clock for the run |
| policy_violations | refunds recorded on the wrong order or with a wrong amount |
| duplicate_refunds | refunds beyond the first on the target order |
| ineligible_attempts | informational: submit_refund calls against orders that were never refundable (O777 over limit, O888 outside window) |

Seeds: `int(sha256("<scenario>:<rep>")[:8], 16)`. The seed fixes which malformed payload is served. Replay re-runs the same scenario, agent, rep and seed.
The model runs at temperature 0, but hosted models are not guaranteed bit-for-bit deterministic, so repeated runs can still differ.

## Run validity
Provider outages are infrastructure, not agent behaviour. Runs that hit a genuine provider error are NOT counted, are stored in the `excluded_attempts` table with the reason, and are retried up to 3 times. Faults injected on purpose by the chaos engine (including CB-06, model unavailable) are part of the experiment and are always counted.
