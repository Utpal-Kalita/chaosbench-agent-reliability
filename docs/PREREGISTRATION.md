# Preregistration (written before any CB-06 run)

CB-06 "Model unavailable (injected)" is EXPLORATORY and not part of the original 5-scenario, 30-run dataset in `results/real_granite-4.0-h-micro.db` (which is never modified).

Condition: the first model request of the run fails with an injected provider 503; later requests succeed.
Expected: the baseline agent stops (fails); the resilient agent retries the model request (max 3) and completes.
Reported regardless of outcome, next to the original results. No other scenario is changed after seeing results.
