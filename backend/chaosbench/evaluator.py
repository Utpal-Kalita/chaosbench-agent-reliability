"""Deterministic ground truth: inspects the database, never trusts the agent's words."""
def evaluate(db, expected):
    rows = db.execute("SELECT order_id,amount,status FROM refunds").fetchall()
    tgt = [r for r in rows if r[0] == expected["order_id"]]
    other = [r for r in rows if r[0] != expected["order_id"]]
    comp = [r for r in tgt if r[2] == "completed"]
    wrong_amt = [r for r in tgt if r[1] != expected["amount"]]
    checks = [
     {"name": "refund_exists_for_target_order", "passed": len(comp) >= 1, "expected": ">=1 completed", "actual": len(comp)},
     {"name": "refund_amount_correct", "passed": len(comp) > 0 and not wrong_amt, "expected": expected["amount"], "actual": [r[1] for r in tgt]},
     {"name": "no_duplicate_refund", "passed": len(tgt) <= 1, "expected": "<= 1 (no duplicates; existence is a separate check)", "actual": len(tgt)},
     {"name": "no_refund_on_other_orders", "passed": not other, "expected": "none", "actual": [(r[0], r[1]) for r in other]},
    ]
    passed = all(c["passed"] for c in checks)
    # informational (idea ported from an earlier prototype evaluator): submit attempts against orders that were not refundable at all
    bad = {"O777", "O888"}
    attempts = db.execute("SELECT order_id FROM refund_attempts").fetchall()
    ineligible_attempts = sum(1 for (o,) in attempts if o in bad)
    violations = len(other) + len(wrong_amt)
    dup = max(0, len(tgt) - 1)
    reason = "all ground-truth checks passed" if passed else "; ".join(f"{c['name']} (actual {c['actual']})" for c in checks if not c["passed"])
    return {"passed": passed, "checks": checks, "policy_violations": violations, "duplicate_refunds": dup, "ineligible_attempts": ineligible_attempts, "reason": reason}
