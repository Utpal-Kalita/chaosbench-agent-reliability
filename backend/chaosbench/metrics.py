"""Metric definitions (also in docs/METRICS.md). Null = unavailable, never 0."""
def _avg(xs): xs = [x for x in xs if x is not None]; return round(sum(xs) / len(xs), 2) if xs else None
def summarize(runs, scenarios):
    out = {"agents": [], "pass_k": []}
    for ag in ("baseline", "resilient"):
        rs = [r for r in runs if r["agent"] == ag]
        if not rs: continue
        inj = sum(r["faults_injected"] for r in rs); rec = sum(r["faults_recovered"] for r in rs)
        tok = [None if r["tokens_in"] is None else r["tokens_in"] + (r["tokens_out"] or 0) for r in rs]
        out["agents"].append({"agent": ag, "runs": len(rs), "success_rate": round(sum(r["passed"] for r in rs) / len(rs), 3),
          "recovery_rate": round(rec / inj, 3) if inj else None, "avg_tool_calls": _avg([r["tool_calls"] for r in rs]),
          "avg_steps": _avg([r["steps"] for r in rs]), "total_tokens": None if any(t is None for t in tok) else sum(tok),
          "avg_latency_ms": _avg([r["latency_ms"] for r in rs]), "policy_violations": sum(r["policy_violations"] for r in rs),
          "duplicate_refunds": sum(r["duplicate_refunds"] for r in rs)})
    for s in scenarios:
        if not any(r['scenario_id'] == s.id for r in runs): continue
        row = {"scenario_id": s.id}
        for ag in ("baseline", "resilient"):
            rs = [r for r in runs if r["agent"] == ag and r["scenario_id"] == s.id]
            row[ag] = bool(rs) and all(r["passed"] for r in rs)   # pass^k: all k repetitions must pass
            row[ag + "_passes"] = f"{sum(r['passed'] for r in rs)}/{len(rs)}"
        out["pass_k"].append(row)
    return out
