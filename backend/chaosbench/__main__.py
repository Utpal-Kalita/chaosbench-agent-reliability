import argparse, os
from .store import Store
from .runner import run_benchmark, make_client
from .chaos import BY_ID
p = argparse.ArgumentParser(description="Run the ChaosBench suite")
p.add_argument("--mode", default=os.environ.get("CB_MODE", "mock"), choices=["mock", "llm"])
p.add_argument("--reps", type=int, default=3); p.add_argument("--scenario", action="append"); p.add_argument("--db", default=os.environ.get("CB_DB", "results.db"))
p.add_argument("--fresh", action="store_true", help="delete previous runs of this mode first")
p.add_argument("--resume", action="store_true"); p.add_argument("--workers", type=int, default=3)
a = p.parse_args()
st = Store(a.db)
if a.fresh: st.clear(a.mode)
run_benchmark(st, make_client(a.mode), a.reps, a.scenario, resume=a.resume, workers=a.workers)
