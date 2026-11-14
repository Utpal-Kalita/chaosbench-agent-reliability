# Reference: earlier prototype snapshot

Provenance note. A separate mock-mode prototype of ChaosBench was built on 2026-11-14 (archive `chaosbench-snapshot-2026-11-14-796da498.zip`). It has 25 passing tests, a deck builder and `TRACE_SCHEMA.md`, and all of its results are mock.
The implementation in `/backend` is the integrated foundation: it exposes the contract-v1 API, speaks the OpenAI-compatible protocol and has been run against real models.
Ported from the snapshot: attempt-level ineligible-refund counting, and simulator, evaluator and chaos checks (now in `tests/test_ported_checks.py`).
The snapshot's source tree and its mock result artifacts are not duplicated here.
