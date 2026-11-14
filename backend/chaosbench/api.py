import os, threading, dataclasses
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .store import Store
from .chaos import SCENARIOS
from .metrics import summarize
from .runner import run_one, make_client

app = FastAPI(title="ChaosBench")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_db = os.environ.get("CB_DB", "results.db")
if os.environ.get("CB_MODE", "mock") != "mock" and not os.path.exists(_db):
    raise RuntimeError(f"CB_MODE={os.environ['CB_MODE']} needs an existing results database, but CB_DB={_db!r} does not exist. "
                       "Restore one first, e.g. sqlite3 restored.db < results/real_granite-4.0-h-micro.sql")
store = Store(_db)
LIGHT = lambda r: {k: v for k, v in r.items() if k not in ("events", "evaluation")}

def _mode(): return os.environ.get("CB_MODE", "mock")

@app.get("/api/summary")
def summary(mode: str | None = None):
    mode = mode or _mode()
    runs = [r for r in store.all(mode=mode) if not r.get("replay_of")]   # replays are shown in /api/runs but never counted in the benchmark
    s = summarize(runs, SCENARIOS)
    models = sorted({r["model"] for r in runs if r.get("model")})
    return {"mode": mode, "model": models[0] if models else None, "total_runs": len(runs), **s}

@app.get("/api/scenarios")
def scenarios(): return [{"id": s.id, "name": s.name, "fault": s.fault, "description": s.description} for s in SCENARIOS]

@app.get("/api/runs")
def runs(scenario: str | None = None, agent: str | None = None, mode: str | None = None):
    return [LIGHT(r) for r in store.all(scenario, agent, mode or _mode())]

@app.get("/api/runs/{run_id}")
def run(run_id: str):
    r = store.get(run_id)
    if not r: raise HTTPException(404, "run not found")
    return r

@app.post("/api/runs/{run_id}/replay")
def replay(run_id: str):
    r = store.get(run_id)
    if not r: raise HTTPException(404, "run not found")
    new = run_one(r["scenario_id"], r["agent"], r["rep"], make_client(r["mode"]), seed=r["seed"], replay_of=run_id)
    store.save(new); return new


@app.get("/", include_in_schema=False)
def index(): return FileResponse(os.path.join(os.path.dirname(__file__), "static", "index.html"))

_fe = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.isdir(_fe):   # Muse's standalone dashboard, served at /ui/?api=<this server>
    app.mount("/ui", StaticFiles(directory=_fe, html=True), name="ui")
