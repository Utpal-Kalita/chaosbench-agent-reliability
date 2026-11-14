/* Live-backend adapter (added by the ChaosBench backend integration; not part of the original standalone archive).
   Active only when the page is opened with ?api=<base-url>. It answers the dashboard's request for
   real_results_granite.json from the live API (summary, scenarios, runs, and the full trace of EVERY run),
   so nothing is read from a fixture. Replays are excluded from the dataset, matching the backend summary. */
(function () {
  var api = new URLSearchParams(window.location.search).get('api');
  if (!api && /^\/ui(\/|$)/.test(window.location.pathname)) api = window.location.origin;   // served by the backend itself (same origin)
  if (!api || window.location.protocol.indexOf('http') !== 0) return;
  api = api.replace(/\/+$/, '');
  var realFetch = window.fetch.bind(window);
  var get = function (u) { return realFetch(api + u).then(function (r) { if (!r.ok) throw new Error(u + ' HTTP ' + r.status); return r.json(); }); };
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input === 'real_results_granite.json') {
      return Promise.all([get('/api/summary'), get('/api/scenarios'), get('/api/runs')]).then(function (x) {
        var runs = x[2].filter(function (r) { return !r.replay_of; });
        return Promise.all(runs.map(function (r) { return get('/api/runs/' + encodeURIComponent(r.run_id)); })).then(function (details) {
          var byId = {}; details.forEach(function (d) { byId[d.run_id] = d; });
          // only scenarios that are part of the benchmark cohort (listed in the summary's pass^k); exploratory scenarios such as CB-06 live in a separate dataset
          var core = {}; (x[0].pass_k || []).forEach(function (p) { core[p.scenario_id] = true; });
          var data = { summary: x[0], scenarios: x[1].filter(function (sc) { return core[sc.id]; }), runs: runs, run_details: byId };
          return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
      });
    }
    return realFetch(input, init);
  };
})();
