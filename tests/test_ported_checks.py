"""Checks equivalent to the ones in an earlier independent mock-mode prototype (simulator, evaluator, chaos, end-to-end), written against the integrated backend."""
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from chaosbench.sim import fresh_db, Backend
from chaosbench.evaluator import evaluate
from chaosbench.runner import run_one, EXPECTED
from chaosbench.llm import MockClient

def test_seed_data_present():
    b = Backend(fresh_db())
    assert b.get_order("O501")[1]["total"] == 5000
    assert b.get_order("O777")[1]["total"] == 9000
    assert b.get_order("O888")[0] == 200

def test_get_order_unknown():
    assert Backend(fresh_db()).get_order("NOPE")[0] == 404

def test_check_eligibility():
    b = Backend(fresh_db())
    assert b.check_eligibility("O501")[1]["eligible"] is True
    assert b.check_eligibility("O777")[1]["eligible"] is False   # over the refund limit
    assert b.check_eligibility("O888")[1]["reason"] == "outside_window"

def test_submit_refund_records_state_and_attempt():
    db = fresh_db(); b = Backend(db); s, r = b.submit_refund("O501", 5000)
    assert s == 200 and r["status"] == "completed"
    assert db.execute("SELECT count(*) FROM refunds").fetchone()[0] == 1
    assert db.execute("SELECT count(*) FROM refund_attempts").fetchone()[0] == 1

def test_idempotency_key_deduplicates():
    db = fresh_db(); b = Backend(db)
    b.submit_refund("O501", 5000, "k1"); s, r = b.submit_refund("O501", 5000, "k1")
    assert r.get("deduplicated") and db.execute("SELECT count(*) FROM refunds").fetchone()[0] == 1

def test_duplicate_refunds_are_recorded():
    db = fresh_db(); b = Backend(db); b.submit_refund("O501", 5000); b.submit_refund("O501", 5000)
    assert b.get_refund_status("O501")[1]["refund_count"] == 2

def test_refund_status_empty():
    assert Backend(fresh_db()).get_refund_status("O501")[1]["refund_count"] == 0

def test_clean_pass():
    db = fresh_db(); Backend(db).submit_refund("O501", 5000)
    assert evaluate(db, EXPECTED)["passed"]

def test_no_refund_fails():
    assert not evaluate(fresh_db(), EXPECTED)["passed"]

def test_wrong_amount_fails():
    db = fresh_db(); Backend(db).submit_refund("O501", 4000)
    assert not evaluate(db, EXPECTED)["passed"]

def test_ineligible_refund_is_policy_violation_and_attempt():
    db = fresh_db(); Backend(db).submit_refund("O888", 100)
    ev = evaluate(db, EXPECTED)
    assert ev["policy_violations"] == 1 and ev["ineligible_attempts"] == 1 and not ev["passed"]

def test_mock_runs_labelled_and_complete():
    r = run_one("CB-01", "baseline", 1, MockClient())
    assert r["passed"]

def test_resilient_recovers_from_outage_mock():
    assert run_one("CB-02", "resilient", 1, MockClient())["passed"]
    assert not run_one("CB-02", "baseline", 1, MockClient())["passed"]

def test_cb06_injected_model_outage_mock():
    # exploratory scenario: baseline stops on the injected model error, resilient retries
    assert not run_one("CB-06", "baseline", 1, MockClient())["passed"]
    assert run_one("CB-06", "resilient", 1, MockClient())["passed"]
