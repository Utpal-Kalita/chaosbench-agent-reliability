import json, sqlite3, threading
class Store:
    def __init__(self, path="results.db"):
        self.db = sqlite3.connect(path, check_same_thread=False); self.lock = threading.Lock()
        self.db.execute("CREATE TABLE IF NOT EXISTS runs(run_id TEXT PRIMARY KEY, scenario_id TEXT, agent TEXT, rep INTEGER, mode TEXT, seq INTEGER, body TEXT)")
        self.db.execute("CREATE TABLE IF NOT EXISTS excluded_attempts(run_id TEXT PRIMARY KEY, scenario_id TEXT, agent TEXT, rep INTEGER, reason TEXT, body TEXT)")
        self.db.commit()
    def save_excluded(self, run):
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO excluded_attempts VALUES(?,?,?,?,?,?)", (run["run_id"], run["scenario_id"], run["agent"], run["rep"], run["excluded_reason"], json.dumps(run))); self.db.commit()
    def excluded(self):
        return [json.loads(r[0]) for r in self.db.execute("SELECT body FROM excluded_attempts")]
    def save(self, run):
        with self.lock:
            seq = (self.db.execute("SELECT COALESCE(MAX(seq),0)+1 FROM runs").fetchone()[0])
            self.db.execute("INSERT OR REPLACE INTO runs VALUES(?,?,?,?,?,?,?)", (run["run_id"], run["scenario_id"], run["agent"], run["rep"], run["mode"], seq, json.dumps(run))); self.db.commit()
    def all(self, scenario=None, agent=None, mode=None):
        q, a = "SELECT body FROM runs WHERE 1=1", []
        for col, v in (("scenario_id", scenario), ("agent", agent), ("mode", mode)):
            if v: q += f" AND {col}=?"; a.append(v)
        return [json.loads(r[0]) for r in self.db.execute(q + " ORDER BY seq", a)]
    def get(self, run_id):
        r = self.db.execute("SELECT body FROM runs WHERE run_id=?", (run_id,)).fetchone(); return json.loads(r[0]) if r else None
    def clear(self, mode=None):
        self.db.execute("DELETE FROM runs" + (" WHERE mode=?" if mode else ""), (mode,) if mode else ()); self.db.commit()
