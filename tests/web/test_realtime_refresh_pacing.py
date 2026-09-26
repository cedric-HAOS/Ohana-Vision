"""Pages reload costly views on a status change, not on every observation.

Reloading the 24 h timeline on every observation, from every open page, kept
Vision at full CPU on INFRA-01 on 26 September.
"""

import shutil
import subprocess

import pytest

SCRIPT = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/ohana_vision/web/static/application.js', 'utf8')
    .replace(/^import[\s\S]*?;$/gm, '')
    .replace(/^export /gm, '');
const context = vm.createContext({window: {setTimeout: () => 1}, Date});
vm.runInContext(source + '\nglobalThis.Controller = ApplicationController;', context);
const app = Object.create(context.Controller.prototype);
Object.assign(app, {
    observationRefreshInFlight: false,
    observationRefreshPending: false,
    observationRefreshTimer: null,
    observationStatusChanged: false,
    observationDataIntervalMs: 5000,
    observationDataLoadedAt: 0,
    incidentsRefreshIntervalMs: 15000,
    incidentsLoadedAt: 0,
    navigation: {activeView: 'services'},
});
const calls = [];
app.setRefreshing = () => {};
app.renderLastRefresh = () => {};
app.scheduleObservationRefresh = () => {};
app.loadTimeline = (options) => { calls.push(['timeline', options.force]); };
app.loadObservations = () => { calls.push(['observations']); };
app.incidents = {load: () => { calls.push(['incidents']); }};
app.topology = {refreshStatus: () => { calls.push(['topology']); }};

(async () => {
    const accepted = (extra) => app.handleRealtimeMessage(
        {type: 'observation.accepted', ...extra},
    );

    accepted({status_changed: false});
    await app.refreshObservationState();
    assert.deepEqual(calls, [['observations']]);

    calls.length = 0;
    accepted({status_changed: false});
    await app.refreshObservationState();
    assert.deepEqual(calls, [], 'a repeated status within 5 s reloads nothing');

    accepted({status_changed: true});
    await app.refreshObservationState();
    assert.deepEqual(calls, [['observations'], ['timeline', true]]);

    calls.length = 0;
    accepted({});
    await app.refreshObservationState();
    assert(
        calls.some((call) => call[0] === 'timeline'),
        'older Vision: assume a change',
    );

    calls.length = 0;
    app.navigation.activeView = 'incidents';
    app.incidentsLoadedAt = Date.now();
    accepted({status_changed: false});
    await app.refreshObservationState();
    assert.deepEqual(calls, [], 'Tsunade incidents reload at most every 15 s');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
"""


def test_realtime_refresh_reloads_timeline_only_on_status_change() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript behaviour check")
    result = subprocess.run([node, "-e", SCRIPT], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
