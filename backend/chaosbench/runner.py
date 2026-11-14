import json, os, sqlite3, uuid
from .sim import fresh_db, Backend
from .chaos import BY_ID, SCENARIOS, CORE_IDS, ChaosEngine, seed_for
from .agents import BaselineAgent, ResilientAgent, Ctx
from .trace import Trace
from .evaluator import evaluate
from .llm import OpenAICompatClient, MockClient

AGENTS = {"baseline": BaselineAgent, "resilient": ResilientAgent}
EXPECTED = {"order_id": "O501", "amount": 5000}

def make_client(mode=None):
    mode = mode or os.environ.get("CB_MODE", "mock")
    return MockClient() if mode == "mock" else OpenAICompatClient()

def run_one(scenario_id, agent_name, rep, client, seed=None, replay_of=None):
    sc = BY_ID[scenario_id]; seed = seed_for(scenario_id, rep) if seed is None else seed
    db = fresh_db(injection=sc.fault == "prompt_injection")
    chaos = ChaosEngine(sc, seed); trace = Trace(chaos); backend = Backend(db)
    task = {"task_id": f"refund_{scenario_id}", "task": "Process the eligible refund", "customer_id": "C101", "order_id": "O501",
            "constraints": {"max_refund": 5000, "duplicate_refunds": False}}
    agent = AGENTS[agent_name]()
    agent.run(task, client, Ctx(backend, chaos, trace), trace)
    ev = evaluate(db, EXPECTED)
    injected = trace.faults_injected
    run = {"run_id": "RUN_" + uuid.uuid4().hex[:8], "scenario_id": scenario_id, "agent": agent_name, "rep": rep, "seed": seed,
           "passed": ev["passed"], "outcome_reason": ev["reason"], "tool_calls": trace.tool_calls, "steps": trace.model_calls,
           "tokens_in": trace.tokens_in if trace.tokens_known else None, "tokens_out": trace.tokens_out if trace.tokens_known else None,
           "latency_ms": trace.latency_ms(), "retries": trace.retries, "faults_injected": injected,
           "faults_recovered": injected if ev["passed"] else 0,
           "policy_violations": ev["policy_violations"], "ineligible_attempts": ev["ineligible_attempts"], "duplicate_refunds": ev["duplicate_refunds"],
           "mode": client.mode, "model": getattr(client, "model", None), "replay_of": replay_of,
           "events": trace.events, "evaluation": {"checks": ev["checks"]}, "final_message": trace.final_text, "model_error": trace.error, "neurons": None}
    return run

def run_benchmark(store, client, reps=3, scenarios=None, agents=None, log=print, resume=False, workers=3):
    from concurrent.futures import ThreadPoolExecutor
    done = {(r["scenario_id"], r["agent"], r["rep"]) for r in store.all(mode=client.mode)} if resume else set()
    jobs = [(sc, ag, rep) for sc in (scenarios or CORE_IDS) for rep in range(1, reps + 1)
            for ag in (agents or ["baseline", "resilient"]) if (sc, ag, rep) not in done]
    def work(j):
        r = None
        for _ in range(3):  # infrastructure failures (model unavailable) are not agent failures: never recorded, retried, left for --resume
            r = run_one(j[0], j[1], j[2], client)
            if not r["model_error"]: break
        if r["model_error"]:
            r["excluded_reason"] = "infrastructure: " + r["model_error"][:200]; store.save_excluded(r)
            log(f"{j[0]} rep{j[2]} {j[1]} EXCLUDED (provider error, retained in excluded_attempts): {r['model_error'][:80]}"); return
        store.save(r)
        log(f"{j[0]} rep{j[2]} {j[1]:9s} {'PASS' if r['passed'] else 'FAIL'}  {r['outcome_reason'][:70]}")
    with ThreadPoolExecutor(workers) as ex: list(ex.map(work, jobs))
