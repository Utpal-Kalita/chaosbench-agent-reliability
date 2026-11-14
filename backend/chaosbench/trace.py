import time, datetime
from .llm import LLMError

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds")

class Trace:
    def __init__(self, chaos):
        self.events, self.step, self.chaos = [], 0, chaos
        self.tool_calls = self.retries = self.model_calls = 0
        self.tokens_in = self.tokens_out = 0; self.tokens_known = True
        self.faults_injected = 0; self.t0 = time.time(); self.final_text = ""; self.error = None
    def _add(self, event, **kw):
        self.step += 1
        e = {"step": self.step, "ts": now(), "event": event, "tool": None, "status": None, "error": None,
             "detail": "", "tokens_in": None, "tokens_out": None, "latency_ms": None}; e.update(kw); self.events.append(e)
    def model_call(self, client, msgs):
        self.model_calls += 1
        if self.chaos.intercept_model():
            self.faults_injected += 1
            self._add("fault_injected", detail="chaos engine injected model_unavailable (provider 503)")
            self._add("model_request", status="failed", error="HTTP_503", detail="injected model outage")
            return {"content": "", "tool_calls": [], "injected_failure": True}
        try: r = client.chat(msgs, __import__("chaosbench.sim", fromlist=["x"]).TOOL_SPECS)
        except LLMError as ex:
            self.error = str(ex); self._add("model_request", status="error", error="model_unavailable", detail=str(ex)[:200])
            return {"content": "model_unavailable", "tool_calls": []}
        if r["tokens_in"] is None: self.tokens_known = False
        else: self.tokens_in += r["tokens_in"]; self.tokens_out += r["tokens_out"] or 0
        names = ",".join(t["function"]["name"] for t in r["tool_calls"]) or "final_answer"
        self._add("model_request", status="ok", detail=f"model chose: {names}", tokens_in=r["tokens_in"], tokens_out=r["tokens_out"], latency_ms=r["latency_ms"])
        return r
    def tool(self, name, args, status, text, injected, note=None):
        self.tool_calls += 1
        if injected:
            self.faults_injected += 1
            self._add("fault_injected", tool=name, detail=f"chaos engine injected {injected}")
        self._add("tool_call", tool=name, detail=str(args))
        ok = status == 200 and "error" not in text[:20]
        self._add("tool_response", tool=name, status="ok" if status == 200 else "failed",
                  error=None if status == 200 else f"HTTP_{status}", detail=(note + ": " if note else "") + text[:300])
    def retry(self, name, n): self.retries += 1; self._add("retry", tool=name, detail=f"attempt {n}")
    def note(self, kind, detail): self._add("guard", status=kind, detail=detail)
    def final(self, text): self.final_text = text; self._add("final", detail=text[:300])
    def latency_ms(self): return int((time.time() - self.t0) * 1000)
