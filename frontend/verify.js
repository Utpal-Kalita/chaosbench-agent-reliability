// Verification for the ChaosBench dashboard (node, no browser needed).
// Exercises the pure data functions in app.js against the two real fixture
// files and asserts the values the page is supposed to render.
// Run: node verify.js
const fs = require('fs');
const assert = require('assert');
const app = require('./app.js');

const mock = JSON.parse(fs.readFileSync('./sample_results.json', 'utf8'));
const real = JSON.parse(fs.readFileSync('./real_results_granite.json', 'utf8'));

let n = 0;
function check(name, actual, expected) {
  n += 1;
  assert.strictEqual(actual, expected, name + ': got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
  console.log('ok -', name, '=', JSON.stringify(actual));
}

// --- honesty helpers ---
check('mock tokens null -> n/a', app.fmtTokens(null), 'n/a');
check('tokens string "unavailable" -> n/a', app.fmtTokens('unavailable'), 'n/a');
check('real tokens render as number', app.fmtTokens(54632), '54632');
check('null pct -> n/a', app.fmtPct(null), 'n/a');
check('pct 0.4 -> 40.0%', app.fmtPct(0.4), '40.0%');
check('null latency -> n/a', app.fmtLatency(null), 'n/a');
check('recovery with no faults -> n/a', app.recoveryText(0, 0), 'n/a');
check('recovery 3/3 -> 100%', app.recoveryText(3, 3), '100%');

// --- mock fixture (contract v1) ---
check('mock mode badge', app.modeBadge(mock).text, 'MOCK MODE');
check('mock badge class', app.modeBadge(mock).cls, 'mock');
check('mock baseline success', app.fmtPct(app.agentSummary(mock, 'baseline').success_rate), '40.0%');
check('mock resilient success', app.fmtPct(app.agentSummary(mock, 'resilient').success_rate), '80.0%');
check('mock baseline recovery', app.fmtPct(app.agentSummary(mock, 'baseline').recovery_rate), '25.0%');
check('mock resilient recovery', app.fmtPct(app.agentSummary(mock, 'resilient').recovery_rate), '75.0%');
check('mock baseline pass^k count', app.passKCount(mock, 'baseline'), 2);
check('mock resilient pass^k count', app.passKCount(mock, 'resilient'), 4);
check('mock baseline tokens', app.fmtTokens(app.agentSummary(mock, 'baseline').total_tokens), 'n/a');
check('mock baseline violations', app.agentSummary(mock, 'baseline').policy_violations, 3);
check('mock resilient violations', app.agentSummary(mock, 'resilient').policy_violations, 0);
const ms = app.scenarioStats(mock);
check('mock CB-02 baseline passes', ms['CB-02'].baseline.pass + '/' + ms['CB-02'].baseline.total, '0/3');
check('mock CB-02 resilient passes', ms['CB-02'].resilient.pass + '/' + ms['CB-02'].resilient.total, '3/3');
check('mock CB-04 resilient passes', ms['CB-04'].resilient.pass + '/' + ms['CB-04'].resilient.total, '0/3');
check('mock CB-05 baseline passes', ms['CB-05'].baseline.pass + '/' + ms['CB-05'].baseline.total, '3/3');
check('mock CB-02 baseline recovery', app.recoveryText(ms['CB-02'].baseline.inj, ms['CB-02'].baseline.rec), '0%');
check('mock CB-01 recovery is n/a (no faults)', app.recoveryText(ms['CB-01'].baseline.inj, ms['CB-01'].baseline.rec), 'n/a');
const run = app.findRun(mock, 'CB-02', 'baseline', 1);
check('find run CB-02 baseline rep1', run.run_id, 'RUN_5a3accf5');
check('failing run is not passed', run.passed, false);
const det = app.findDetail(mock, 'RUN_a1f3da14');
check('detail example found', det !== null, true);
check('detail example has 11 events', det.events.length, 11);
check('detail example checks all pass', det.evaluation.checks.every(c => c.passed), true);
check('no detail for other runs', app.findDetail(mock, 'RUN_5a3accf5'), null);
check('event class ok', app.eventClass({ event: 'tool_response', status: 'ok', detail: '' }), 'ok');
check('event class fault on error', app.eventClass({ event: 'tool_response', status: 'error', error: 'HTTP 503', detail: '' }), 'fault');

// --- real granite dataset ---
check('real mode badge is not MOCK', app.modeBadge(real).text.startsWith('REAL LLM'), true);
check('real baseline success', app.fmtPct(app.agentSummary(real, 'baseline').success_rate), '80.0%');
check('real resilient success', app.fmtPct(app.agentSummary(real, 'resilient').success_rate), '100.0%');
check('real baseline tokens present', app.fmtTokens(app.agentSummary(real, 'baseline').total_tokens), '54632');
check('real resilient tokens present', app.fmtTokens(app.agentSummary(real, 'resilient').total_tokens), '55834');
check('real baseline latency', app.fmtLatency(app.agentSummary(real, 'baseline').avg_latency_ms), '7638.7 ms');
const rs = app.scenarioStats(real);
check('real CB-02 baseline passes', rs['CB-02'].baseline.pass + '/' + rs['CB-02'].baseline.total, '0/3');
check('real CB-02 resilient passes', rs['CB-02'].resilient.pass + '/' + rs['CB-02'].resilient.total, '3/3');
check('real CB-03 baseline passes', rs['CB-03'].baseline.pass + '/' + rs['CB-03'].baseline.total, '3/3');
check('real total runs', real.summary.total_runs, 30);

console.log('\n' + n + ' checks passed.');
