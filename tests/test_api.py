import sys, os, importlib; sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import pytest
from fastapi.testclient import TestClient
from chaosbench.runner import run_one
from chaosbench.llm import MockClient
from chaosbench.store import Store

def _app(monkeypatch, db, mode="mock"):
    monkeypatch.setenv("CB_DB", str(db)); monkeypatch.setenv("CB_MODE", mode)
    import chaosbench.api as api
    return importlib.reload(api)

def test_replay_keeps_identity_and_never_enters_the_benchmark_cohort(tmp_path, monkeypatch):
    db = tmp_path / "r.db"; st = Store(str(db))
    for sc in ("CB-01", "CB-02"):
        for ag in ("baseline", "resilient"):
            for rep in (1, 2, 3): st.save(run_one(sc, ag, rep, MockClient()))
    st.db.close()
    api = _app(monkeypatch, db); c = TestClient(api.app)
    before = c.get("/api/summary").json()
    orig = c.get("/api/runs?scenario=CB-02&agent=baseline").json()[0]
    new = c.post(f"/api/runs/{orig['run_id']}/replay").json()
    assert new["replay_of"] == orig["run_id"] and new["seed"] == orig["seed"] and new["run_id"] != orig["run_id"]
    assert new["passed"] == orig["passed"]
    after = c.get("/api/summary").json()
    assert after == before and after["total_runs"] == 12            # denominators unchanged
    assert any(r["run_id"] == new["run_id"] for r in c.get("/api/runs").json())  # but the replay is retained and listed
    assert next(p for p in after["pass_k"] if p["scenario_id"] == "CB-02")["baseline_passes"] == "0/3"

def test_mock_default_is_never_labelled_llm(tmp_path, monkeypatch):
    db = tmp_path / "m.db"; st = Store(str(db)); st.save(run_one("CB-01", "baseline", 1, MockClient())); st.db.close()
    c = TestClient(_app(monkeypatch, db).app)
    assert c.get("/api/summary").json()["mode"] == "mock"
    assert c.get("/api/summary?mode=llm").json()["total_runs"] == 0   # mock runs never appear as real results

def test_llm_mode_with_missing_db_fails_clearly(tmp_path, monkeypatch):
    with pytest.raises(RuntimeError, match="needs an existing results database"):
        _app(monkeypatch, tmp_path / "missing.db", mode="llm")


def test_duplicate_check_is_labelled_as_a_ceiling():
    import sqlite3
    from chaosbench.evaluator import evaluate
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE refunds(order_id,amount,status)")
    db.execute("CREATE TABLE refund_attempts(order_id)")
    chk = {c["name"]: c for c in evaluate(db, {"order_id": "O501", "amount": 5000})["checks"]}
    assert chk["no_duplicate_refund"]["passed"] is True
    assert chk["no_duplicate_refund"]["actual"] == 0
    assert chk["no_duplicate_refund"]["expected"].startswith("<= 1")
    assert chk["refund_exists_for_target_order"]["passed"] is False


def test_hosted_readonly_mode_seeds_db_and_blocks_replay(tmp_path, monkeypatch):
    sql = os.path.join(os.path.dirname(__file__), "..", "results", "real_granite-4.0-h-micro.sql")
    monkeypatch.setenv("CB_DB", str(tmp_path / "h.db")); monkeypatch.setenv("CB_MODE", "llm")
    monkeypatch.setenv("CB_SEED_SQL", sql); monkeypatch.setenv("CB_READONLY", "1")
    import chaosbench.api as api
    api = importlib.reload(api)
    c = TestClient(api.app)
    s = c.get("/api/summary").json()
    assert s["mode"] == "llm" and s["total_runs"] == 30
    rid = c.get("/api/runs").json()[0]["run_id"]
    r = c.post(f"/api/runs/{rid}/replay")
    assert r.status_code == 403 and "disabled" in r.json()["detail"]
    assert len(c.get("/api/runs").json()) == 30
