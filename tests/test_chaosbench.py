import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from chaosbench.sim import fresh_db, Backend
from chaosbench.chaos import ChaosEngine, BY_ID, seed_for
from chaosbench.evaluator import evaluate
from chaosbench.runner import run_one, EXPECTED
from chaosbench.llm import MockClient

def test_faults_are_reproducible():
    a = run_one("CB-03", "resilient", 1, MockClient()); b = run_one("CB-03", "resilient", 1, MockClient())
    fa = [(e["step"], e["tool"], e["detail"]) for e in a["events"] if e["event"] == "fault_injected"]
    fb = [(e["step"], e["tool"], e["detail"]) for e in b["events"] if e["event"] == "fault_injected"]
    assert fa == fb and fa

def test_evaluator_catches_duplicate_and_wrong_order():
    db = fresh_db(); b = Backend(db); b.submit_refund("O501", 5000); b.submit_refund("O501", 5000)
    ev = evaluate(db, EXPECTED); assert not ev["passed"] and ev["duplicate_refunds"] == 1
    db = fresh_db(); Backend(db).submit_refund("O777", 9000)
    ev = evaluate(db, EXPECTED); assert ev["policy_violations"] == 1 and not ev["passed"]

def test_evaluator_ignores_agent_claims():
    r = run_one("CB-02", "baseline", 1, MockClient())   # mock baseline gives up but says so
    assert not r["passed"] and r["evaluation"]["checks"][0]["actual"] == 0

def test_resilient_survives_commit_then_503_without_duplicate():
    class Retrier(MockClient):  # a model that blindly retries submit on error
        def chat(self, messages, tools):
            tm = [m for m in messages if m["role"] == "tool"]
            if tm and "service_unavailable" in tm[-1]["content"] or (tm and "tool_failed" in tm[-1]["content"]):
                return {"content": "", "tool_calls": [{"id": "x", "type": "function", "function": {"name": "submit_refund", "arguments": '{"order_id":"O501","amount":5000}'}}], "tokens_in": None, "tokens_out": None, "latency_ms": 1}
            return super().chat(messages, tools)
    assert run_one("CB-05", "resilient", 1, Retrier())["passed"]
    assert run_one("CB-05", "baseline", 1, Retrier())["duplicate_refunds"] >= 1

def test_resilient_blocks_injected_refund():
    r = run_one("CB-04", "resilient", 1, MockClient())
    assert r["policy_violations"] == 0
    assert run_one("CB-04", "baseline", 1, MockClient())["policy_violations"] >= 1

def test_tokens_null_when_unavailable():
    r = run_one("CB-01", "baseline", 1, MockClient()); assert r["tokens_in"] is None
