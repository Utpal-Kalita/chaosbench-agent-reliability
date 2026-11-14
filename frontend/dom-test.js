// End-to-end render test: runs the real app.js boot path against a minimal
// DOM shim in node, using the embedded datasets (file:// mode).
// Asserts the rendered HTML contains the fixture's actual values.
// Run: node dom-test.js
const fs = require('fs');
const assert = require('assert');

class El {
  constructor(id) {
    this.id = id;
    this._html = '';
    this.textContent = '';
    this.className = '';
    this.value = '';
    this.disabled = false;
    this.onclick = null;
    this._listeners = {};
  }
  set innerHTML(v) {
    this._html = String(v);
    // emulate a <select>: value becomes the first option's value
    const m = this._html.match(/<option value="([^"]+)"/);
    if (m) this.value = m[1];
  }
  get innerHTML() { return this._html; }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
}

const els = {};
global.document = {
  getElementById: (id) => (els[id] = els[id] || new El(id)),
  addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') fn(); },
};
global.window = {
  location: { protocol: 'file:', search: process.env.QS || '' },
  CHAOSBENCH_EMBEDDED: null,
};
// load data.js into this context (it sets window.CHAOSBENCH_EMBEDDED)
const dataSrc = fs.readFileSync('./data.js', 'utf8');
eval(dataSrc.replace('window.CHAOSBENCH_EMBEDDED', 'global.window.CHAOSBENCH_EMBEDDED'));
global.window.CHAOSBENCH_EMBEDDED = global.window.CHAOSBENCH_EMBEDDED;

// load app.js (boot runs via DOMContentLoaded shim; data load is async)
require('./app.js');

setTimeout(() => {
const html = (id) => els[id] ? els[id].innerHTML : '';
const txt = (id) => els[id] ? els[id].textContent : '';

const REAL = (process.env.QS || '').includes('real_results_granite');
const EXP = REAL ? {
  badge: 'REAL LLM — @cf/ibm-granite/granite-4.0-h-micro',
  badgeCls: 'badge llm',
  model: '@cf/ibm-granite/granite-4.0-h-micro',
  baseSuccess: '80.0%', resSuccess: '100.0%',
  baseRecovery: '75.0%', resRecovery: '100.0%',
  basePassK: '4/5', resPassK: '5/5',
  tokens: '54632',
  cb02Base: '0/3', cb02Res: '3/3', cb04Res: '3/3', cb05Base: '3/3',
  exampleRun: JSON.parse(require('fs').readFileSync('./real_results_granite.json','utf8')).run_detail_example.run_id,
  exampleVerdict: JSON.parse(require('fs').readFileSync('./real_results_granite.json','utf8')).run_detail_example.passed ? 'PASS' : 'FAIL',
} : {
  badge: 'MOCK MODE',
  badgeCls: 'badge mock',
  model: 'scripted-mock-v1',
  baseSuccess: '40.0%', resSuccess: '80.0%',
  baseRecovery: '25.0%', resRecovery: '75.0%',
  basePassK: '2/5', resPassK: '4/5',
  tokens: 'n/a',
  cb02Base: '0/3', cb02Res: '3/3', cb04Res: '0/3', cb05Base: '3/3',
  exampleRun: 'RUN_a1f3da14',
  exampleVerdict: 'PASS',
};

let n = 0;
function has(id, needle, name) {
  n += 1;
  assert.ok(html(id).includes(needle) || txt(id).includes(needle),
    name + ': ' + id + ' does not contain ' + JSON.stringify(needle));
  console.log('ok -', name);
}

// mode badge + meta (mock fixture is the default dataset)
assert.strictEqual(txt('mode-badge'), EXP.badge, 'badge text');
assert.strictEqual(els['mode-badge'].className, EXP.badgeCls, 'badge class');
has('meta', EXP.model, 'meta shows model');
has('meta', 'Total runs <b>30</b>', 'meta shows 30 runs');

// overview cards: fixture values
has('cards', EXP.baseSuccess, 'card: baseline success');
has('cards', EXP.resSuccess, 'card: resilient success');
has('cards', EXP.baseRecovery, 'card: baseline recovery');
has('cards', EXP.resRecovery, 'card: resilient recovery');
has('cards', EXP.tokens, 'card: tokens');
has('cards', EXP.basePassK, 'card: baseline pass^k');
has('cards', EXP.resPassK, 'card: resilient pass^k');

// comparison table
has('compare-table', 'Policy violations', 'compare table has violations row');
has('compare-table', '3', 'compare table shows baseline 3 violations');

// scenario table
has('scenario-table', 'CB-02', 'scenario table has CB-02');
has('scenario-table', '0/3', 'scenario table shows 0/3');
has('scenario-table', 'api_503', 'scenario table shows fault code');
has('scenario-table', 'n/a', 'scenario table shows n/a recovery for CB-01');

// trace timeline defaults to the detailed example run (RUN_a1f3da14)
has('run-summary', EXP.exampleRun, 'timeline defaults to example run');
has('run-summary', EXP.exampleVerdict, 'example run verdict ' + EXP.exampleVerdict);
has('timeline', 'get_order', 'timeline shows tool_call get_order');
has('timeline', 'submit_refund', 'timeline shows submit_refund');
has('timeline', 'model_request', 'timeline shows model_request events');
has('evaluation', 'refund_amount_correct', 'evaluation checks rendered');
has('evaluation', 'no_duplicate_refund', 'evaluation checks rendered');

// replay is disabled with no live backend
assert.strictEqual(els['replay-btn'].disabled, true, 'replay disabled without ?api=');
has('replay-note', 'No live backend connected', 'replay note explains why');

// switch to a non-example run (CB-03 resilient rep 2 has no detail in either dataset):
// summary shows, timeline honestly says no events
els['run-scenario'].value = 'CB-03';
els['run-agent'].value = 'resilient';
els['run-rep'].value = '2';
els['run-scenario']._listeners.change.forEach(fn => fn());
const fixtureFile = REAL ? './real_results_granite.json' : './sample_results.json';
const fixture = JSON.parse(require('fs').readFileSync(fixtureFile, 'utf8'));
const expectedRun = fixture.runs.find(r => r.scenario_id === 'CB-03' && r.agent === 'resilient' && r.rep === 2);
has('run-summary', expectedRun.run_id, 'selected CB-03 resilient rep2 run');
has('run-summary', expectedRun.passed ? 'PASS' : 'FAIL', 'selected run verdict');
has('timeline', 'not included for this run', 'timeline states event trace unavailable');

console.log('\n' + n + ' render checks passed (plus badge/replay assertions).');
}, 100);
