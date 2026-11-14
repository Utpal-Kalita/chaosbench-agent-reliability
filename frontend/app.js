'use strict';
/* ChaosBench dashboard — contract v1.
 * Pure data functions are exported for node-based verification
 * (see verify.js). DOM boot only runs in a browser.
 */

/* ---------- honesty helpers ---------- */
function isMissing(v) {
  return v === null || v === undefined || v === '' || v === 'unavailable';
}
function fmtPct(v) {           // rate 0..1 -> "40.0%" or "n/a"
  return isMissing(v) ? 'n/a' : (Number(v) * 100).toFixed(1) + '%';
}
function fmtTokens(v) {        // null / "unavailable" -> "n/a", never 0
  return isMissing(v) ? 'n/a' : String(v);
}
function fmtLatency(v) {       // ms -> "0.0 ms" or "n/a"
  return isMissing(v) ? 'n/a' : Number(v).toFixed(1) + ' ms';
}
function fmtAvg(v, digits) {
  return isMissing(v) ? 'n/a' : Number(v).toFixed(digits === undefined ? 1 : digits);
}
function fmtInt(v) {
  return isMissing(v) ? 'n/a' : String(Math.trunc(Number(v)));
}
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- pure data functions ---------- */
function agentSummary(data, agent) {
  return (data.summary.agents || []).find(function (a) { return a.agent === agent; }) || null;
}
function passKCount(data, agent) {
  // scenarios where pass^k held for this agent (all reps passed)
  return (data.summary.pass_k || []).filter(function (p) { return p[agent] === true; }).length;
}
function passKTotal(data) {
  return (data.summary.pass_k || []).length;
}
function scenarioStats(data) {
  // per scenario, per agent: passes, reps, faults injected/recovered
  var out = {};
  (data.scenarios || []).forEach(function (sc) {
    out[sc.id] = {
      scenario: sc,
      baseline: { pass: 0, total: 0, inj: 0, rec: 0 },
      resilient: { pass: 0, total: 0, inj: 0, rec: 0 }
    };
  });
  (data.runs || []).forEach(function (r) {
    var slot = out[r.scenario_id];
    if (!slot || !slot[r.agent]) return;
    var a = slot[r.agent];
    a.total += 1;
    if (r.passed) a.pass += 1;
    a.inj += r.faults_injected || 0;
    a.rec += r.faults_recovered || 0;
  });
  return out;
}
function recoveryText(inj, rec) {
  // recovery only defined where faults were injected
  if (!inj) return 'n/a';
  return Math.round((rec / inj) * 100) + '%';
}
function findRun(data, scenarioId, agent, rep) {
  return (data.runs || []).find(function (r) {
    return r.scenario_id === scenarioId && r.agent === agent && r.rep === rep;
  }) || null;
}
function findDetail(data, runId) {
  // INTEGRATION PATCH (ChaosBench backend): live mode ships a trace for every run in data.run_details
  if (data.run_details && data.run_details[runId]) return data.run_details[runId];
  var d = data.run_detail_example;
  return (d && d.run_id === runId) ? d : null;
}
function eventClass(ev) {
  if (ev.error || ev.status === 'error') return 'fault';
  if ((ev.detail || '').toLowerCase().indexOf('retry') !== -1) return 'retry';
  if (ev.status === 'ok') return 'ok';
  return '';
}
function modeBadge(data) {
  return data.summary.mode === 'mock'
    ? { text: 'MOCK MODE', cls: 'mock' }
    : { text: 'REAL LLM — ' + (data.summary.model || 'unknown model'), cls: 'llm' };
}

var METRICS = [
  { key: 'success',  label: 'Task success',    get: function (a) { return fmtPct(a.success_rate); },        better: 'high' },
  { key: 'recovery', label: 'Recovery rate',   get: function (a) { return fmtPct(a.recovery_rate); },       better: 'high' },
  { key: 'passk',    label: 'pass^3 scenarios (all 3 reps pass)', get: function (a, d) { return passKCount(d, a.agent) + '/' + passKTotal(d); }, better: 'high' },
  { key: 'tools',    label: 'Avg tool calls',  get: function (a) { return fmtAvg(a.avg_tool_calls); },      better: null },
  { key: 'tokens',   label: 'Total tokens',    get: function (a) { return fmtTokens(a.total_tokens); },     better: null },
  { key: 'latency',  label: 'Avg latency',     get: function (a) { return fmtLatency(a.avg_latency_ms); },   better: null },
  { key: 'viol',     label: 'Policy violations', get: function (a) { return fmtInt(a.policy_violations); },  better: 'low' },
  { key: 'dupes',    label: 'Duplicate refunds', get: function (a) { return fmtInt(a.duplicate_refunds); }, better: 'low' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isMissing: isMissing, fmtPct: fmtPct, fmtTokens: fmtTokens,
    fmtLatency: fmtLatency, fmtAvg: fmtAvg, fmtInt: fmtInt,
    agentSummary: agentSummary, passKCount: passKCount, passKTotal: passKTotal,
    scenarioStats: scenarioStats, recoveryText: recoveryText,
    findRun: findRun, findDetail: findDetail, eventClass: eventClass,
    modeBadge: modeBadge, METRICS: METRICS
  };
}

/* ---------- browser boot ---------- */
if (typeof document !== 'undefined') {
  var DATASETS = ['sample_results.json', 'real_results_granite.json'];
  var state = { data: null, file: 'sample_results.json', apiBase: null, source: '' };

  function params() { return new URLSearchParams(window.location.search); }

  function loadData(file) {
    state.file = file;
    var embedded = (window.CHAOSBENCH_EMBEDDED || {})[file];
    if (window.location.protocol.indexOf('http') === 0) {
      return fetch(file).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) { state.source = 'fetched over HTTP'; return j; })
      .catch(function () {
        if (!embedded) throw new Error('fetch failed and no embedded copy for ' + file);
        state.source = 'embedded fallback (fetch failed)';
        return embedded;
      });
    }
    if (!embedded) return Promise.reject(new Error('no embedded copy for ' + file));
    state.source = 'embedded copy (file:// — fetch unavailable)';
    return Promise.resolve(embedded);
  }

  function renderMeta() {
    var s = state.data.summary;
    var badge = modeBadge(state.data);
    var el = document.getElementById('mode-badge');
    el.textContent = badge.text;
    el.className = 'badge ' + badge.cls;
    document.getElementById('meta').innerHTML =
      'Mode <b>' + esc(s.mode) + '</b> &nbsp;·&nbsp; Model <b>' + esc(s.model || 'n/a') + '</b>' +
      ' &nbsp;·&nbsp; Total runs <b>' + esc(s.total_runs) + '</b>' +
      ' &nbsp;·&nbsp; Source <b>' + esc(state.file) + '</b> (' + esc(state.source) + ')';
  }

  function renderCards() {
    var d = state.data;
    var html = '';
    ['baseline', 'resilient'].forEach(function (agent) {
      var a = agentSummary(d, agent);
      if (!a) return;
      html += '<div class="card"><h3>' + esc(agent) + ' <span class="' +
        (a.success_rate >= 0.8 ? 'win' : 'lose') + '">' + fmtPct(a.success_rate) + ' success</span></h3><div class="metrics">';
      METRICS.forEach(function (m) {
        var val = m.get(a, d);
        var cls = val === 'n/a' ? 'na' : '';
        html += '<div class="metric"><div class="label">' + esc(m.label) + '</div>' +
          '<div class="value ' + cls + '">' + esc(val) + '</div></div>';
      });
      html += '</div></div>';
    });
    document.getElementById('cards').innerHTML = html;
  }

  function renderCompare() {
    var d = state.data;
    var b = agentSummary(d, 'baseline');
    var r = agentSummary(d, 'resilient');
    var html = '<tr><th>Metric</th><th class="num">Baseline</th><th class="num">Resilient</th></tr>';
    METRICS.forEach(function (m) {
      var bv = b ? m.get(b, d) : 'n/a';
      var rv = r ? m.get(r, d) : 'n/a';
      var bCls = '', rCls = '';
      if (m.better && b && r) {
        var bn = Number(m.key === 'passk' ? passKCount(d, 'baseline') : b[{ success: 'success_rate', recovery: 'recovery_rate', viol: 'policy_violations', dupes: 'duplicate_refunds' }[m.key]]);
        var rn = Number(m.key === 'passk' ? passKCount(d, 'resilient') : r[{ success: 'success_rate', recovery: 'recovery_rate', viol: 'policy_violations', dupes: 'duplicate_refunds' }[m.key]]);
        if (m.better === 'high') { if (rn > bn) rCls = 'pass'; else if (bn > rn) bCls = 'pass'; }
        if (m.better === 'low') { if (rn < bn) rCls = 'pass'; else if (bn < rn) bCls = 'pass'; }
      }
      html += '<tr><td>' + esc(m.label) + '</td>' +
        '<td class="num ' + bCls + (bv === 'n/a' ? ' na' : '') + '">' + esc(bv) + '</td>' +
        '<td class="num ' + rCls + (rv === 'n/a' ? ' na' : '') + '">' + esc(rv) + '</td></tr>';
    });
    document.getElementById('compare-table').innerHTML = html;
  }

  function renderScenarios() {
    var d = state.data;
    var stats = scenarioStats(d);
    var html = '<tr><th>Scenario</th><th>Fault</th>' +
      '<th class="num">Baseline</th><th class="num">Resilient</th>' +
      '<th class="num">Recovery (base)</th><th class="num">Recovery (res)</th>' +
      '<th>pass^k</th></tr>';
    (d.scenarios || []).forEach(function (sc) {
      var st = stats[sc.id];
      var pk = (d.summary.pass_k || []).find(function (p) { return p.scenario_id === sc.id; }) || {};
      html += '<tr><td><b>' + esc(sc.id) + '</b> — ' + esc(sc.name) +
        '<br><span class="note">' + esc(sc.description || '') + '</span></td>' +
        '<td><code>' + esc(sc.fault) + '</code></td>' +
        '<td class="num ' + (st.baseline.pass === st.baseline.total ? 'pass' : 'fail') + '">' + st.baseline.pass + '/' + st.baseline.total + '</td>' +
        '<td class="num ' + (st.resilient.pass === st.resilient.total ? 'pass' : 'fail') + '">' + st.resilient.pass + '/' + st.resilient.total + '</td>' +
        '<td class="num">' + esc(recoveryText(st.baseline.inj, st.baseline.rec)) + '</td>' +
        '<td class="num">' + esc(recoveryText(st.resilient.inj, st.resilient.rec)) + '</td>' +
        '<td>' + (pk.baseline ? '<span class="pass">B ✓</span> ' : '<span class="fail">B ✗</span>') +
        (pk.resilient ? '<span class="pass">R ✓</span>' : '<span class="fail">R ✗</span>') + '</td></tr>';
    });
    document.getElementById('scenario-table').innerHTML = html;
  }

  function renderRun() {
    var d = state.data;
    var scId = document.getElementById('run-scenario').value;
    var agent = document.getElementById('run-agent').value;
    var rep = parseInt(document.getElementById('run-rep').value, 10);
    var run = findRun(d, scId, agent, rep);
    var sumEl = document.getElementById('run-summary');
    var tlEl = document.getElementById('timeline');
    var evEl = document.getElementById('evaluation');
    var btn = document.getElementById('replay-btn');
    var note = document.getElementById('replay-note');
    if (!run) { sumEl.textContent = 'No such run in this dataset.'; tlEl.innerHTML = ''; evEl.innerHTML = ''; return; }
    var verdict = run.passed
      ? '<span class="verdict-pass">PASS</span>'
      : '<span class="verdict-fail">FAIL</span>';
    sumEl.innerHTML =
      '<b>' + esc(run.run_id) + '</b> — ' + esc(run.scenario_id) + ' · ' + esc(run.agent) +
      ' · rep ' + esc(run.rep) + ' · ' + verdict +
      '<br>Outcome: ' + esc(run.outcome_reason || 'n/a') +
      ' · Tool calls ' + esc(run.tool_calls) + ' · Steps ' + esc(run.steps) +
      ' · Retries ' + esc(run.retries) +
      ' · Faults ' + esc(run.faults_recovered) + '/' + esc(run.faults_injected) + ' recovered' +
      ' · Tokens ' + esc(fmtTokens(run.tokens_in === null && run.tokens_out === null ? null : (run.tokens_in || 0) + (run.tokens_out || 0))) +
      ' · Latency ' + esc(fmtLatency(run.latency_ms)) +
      (run.final_message ? '<br>Final: ' + esc(run.final_message) : '') +
      (run.model_error ? '<br>Model error: ' + esc(run.model_error) : '');
    var detail = findDetail(d, run.run_id);
    if (detail && detail.events) {
      var th = '';
      detail.events.forEach(function (ev) {
        var cls = eventClass(ev);
        th += '<div class="event"><div class="step">step ' + esc(ev.step) +
          (ev.ts ? ' · ' + esc(ev.ts) : '') + '</div>' +
          '<div class="kind ' + cls + '">' + esc(ev.event) +
          (ev.tool ? ' · ' + esc(ev.tool) : '') +
          (ev.status ? ' · ' + esc(ev.status) : '') +
          (ev.error ? ' · ERROR: ' + esc(ev.error) : '') + '</div>' +
          (ev.detail ? '<div class="detail">' + esc(ev.detail) + '</div>' : '') + '</div>';
      });
      tlEl.innerHTML = th;
      if (detail.evaluation && detail.evaluation.checks) {
        var eh = '<h3>Ground-truth evaluation</h3><table><tr><th>Check</th><th>Result</th><th>Expected</th><th>Actual</th></tr>';
        detail.evaluation.checks.forEach(function (c) {
          eh += '<tr><td><code>' + esc(c.name) + '</code></td><td class="' +
            (c.passed ? 'pass' : 'fail') + '">' + (c.passed ? 'PASS' : 'FAIL') + '</td>' +
            '<td>' + esc(c.name === 'no_duplicate_refund' ? '<= 1 (no duplicates; existence is checked separately)' : JSON.stringify(c.expected)) + '</td>' +
            '<td>' + esc(JSON.stringify(c.actual)) + '</td></tr>';
        });
        evEl.innerHTML = eh + '</table>';
      } else { evEl.innerHTML = ''; }
    } else {
      tlEl.innerHTML = '<p class="note">Event-level trace is not included for this run in ' +
        'this fixture — the contract ships one detailed example run only ' +
        '(see CONTRACT.md). A live backend serves full traces via ' +
        '<code>GET /api/runs/{run_id}</code>.</p>';
      evEl.innerHTML = '';
    }
    if (state.apiBase) {
      btn.disabled = false;
      note.textContent = 'Replay will POST to ' + state.apiBase + '/api/runs/' + run.run_id + '/replay';
    } else {
      btn.disabled = true;
      note.textContent = 'No live backend connected — open with ?api=<base-url> to enable Replay.';
    }
    btn.onclick = function () {
      if (!state.apiBase) return;
      var resEl = document.getElementById('replay-result');
      resEl.innerHTML = '<p class="note">Replaying ' + esc(run.run_id) + '…</p>';
      fetch(state.apiBase + '/api/runs/' + encodeURIComponent(run.run_id) + '/replay', { method: 'POST' })
        .then(function (r) { return r.text().then(function (t) { return { status: r.status, body: t }; }); })
        .then(function (x) {
          var j = null; try { j = JSON.parse(x.body); } catch (e) {}
          resEl.innerHTML = '<p>Replay response (HTTP ' + esc(x.status) + ')' + (j && j.run_id ? ': new run <code>' + esc(j.run_id) + '</code> replays <code>' + esc(j.replay_of) + '</code> with seed ' + esc(j.seed) + ' - <b class="' + (j.passed ? 'pass' : 'fail') + '">' + (j.passed ? 'PASS' : 'FAIL') + '</b>. A real model can behave differently on replay; replays never enter the benchmark summary.' : '') + '</p><details><summary>Raw response</summary><pre class="detail" style="white-space:pre-wrap;word-break:break-all">' + esc(x.body) + '</pre></details>';
        })
        .catch(function (e) {
          resEl.innerHTML = '<p class="note">Replay failed: ' + esc(e.message) + '</p>';
        });
    };
  }

  function renderAll() {
    renderMeta();
    renderCards();
    renderCompare();
    renderScenarios();
    var sel = document.getElementById('run-scenario');
    var cur = sel.value;
    sel.innerHTML = (state.data.scenarios || []).map(function (sc) {
      return '<option value="' + esc(sc.id) + '">' + esc(sc.id) + ' — ' + esc(sc.name) + '</option>';
    }).join('');
    if (cur) sel.value = cur;
    renderRun();
  }

  function init() {
    var p = params();
    state.apiBase = p.get('api') || null;
    var file = p.get('data') || (state.apiBase ? 'real_results_granite.json' : 'sample_results.json');  // INTEGRATION PATCH: live mode defaults to the live dataset
    if (DATASETS.indexOf(file) === -1) file = 'sample_results.json';
    document.getElementById('dataset-select').value = file;
    document.getElementById('dataset-select').addEventListener('change', function (e) {
      loadData(e.target.value).then(function (j) { state.data = j; renderAll(); });
    });
    ['run-scenario', 'run-agent', 'run-rep'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', renderRun);
    });
    loadData(file).then(function (j) {
      state.data = j;
      // default the timeline to the detailed example run when present
      var ex = j.run_detail_example;
      if (ex) {
        document.getElementById('run-agent').value = ex.agent;
        document.getElementById('run-rep').value = String(ex.rep);
      }
      renderAll();
      if (ex) document.getElementById('run-scenario').value = ex.scenario_id;
      renderRun();
    }).catch(function (e) {
      document.getElementById('meta').textContent = 'Failed to load dataset: ' + e.message;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
               }
