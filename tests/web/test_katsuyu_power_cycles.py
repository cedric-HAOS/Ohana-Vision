"""Ohana view: why Katsuyu was woken, what it ran and how the cycle ended."""

# ruff: noqa: E501 (the embedded script keeps one journal event per line)

import shutil
import subprocess

import pytest

SCRIPT = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/ohana_vision/web/static/ohana.js', 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export (async )?function/gm, '$1function')
    .replace(/^export (const|class)/gm, '$1');
const context = vm.createContext({
    escapeHtml: value => String(value), API: {}, fetchJson: async () => ({}),
    Intl, Date, Object, Number, Math, String, Array,
});
vm.runInContext(source + '\nglobalThis.rows = katsuyuPowerRows; globalThis.stats = katsuyuWakeStatsRow;', context);
const rows = context.rows;
const at = (hour, minute, second = 0) =>
    `2026-09-29T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+02:00`;
const now = Date.parse(at(4, 0));

// newest first, like the Agent lists them
const finished = {power_events: [
    {kind: 'shutdown_started', occurred_at: at(3, 9, 5), detail: {}},
    {kind: 'shutdown_granted', occurred_at: at(3, 9), detail: {executed: {'logs.health_check': 3}, failed: 0}},
    {kind: 'worker_online', occurred_at: at(3, 1, 4), detail: {after_seconds: 64}},
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', pending_jobs: {'logs.health_check': 3}, timeout_seconds: 180}},
]};
let [row] = rows(finished, now);
assert.equal(row.state, 'healthy');
assert.equal(row.value, 'Cycle terminé');
assert.match(row.detail, /travaux en attente \(Contrôle des journaux ×3\)/);
assert.match(row.detail, /en ligne après 64 s/);
assert.match(row.detail, /exécuté : Contrôle des journaux ×3/);
assert.match(row.detail, /PC éteint/);

const vetoed = {power_events: [
    {kind: 'shutdown_vetoed', occurred_at: at(3, 9, 5), detail: {reason: 'interactive_session', sessions: 1}},
    {kind: 'shutdown_granted', occurred_at: at(3, 9), detail: {executed: {'system.health': 1}, failed: 0}},
    {kind: 'worker_online', occurred_at: at(3, 1), detail: {after_seconds: 50}},
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'manual', pending_jobs: {}, timeout_seconds: 180}},
]};
[row] = rows(vetoed, now);
assert.equal(row.value, 'PC laissé allumé');
assert.match(row.detail, /test manuel depuis Vision \(aucun travail en attente\)/);
assert.match(row.detail, /session Windows ouverte/);

const silent = {power_events: [
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', pending_jobs: {'ai.inference': 1}, timeout_seconds: 180}},
]};
[row] = rows(silent, now);
assert.equal(row.state, 'degraded');
assert.equal(row.value, 'Sans réponse');
[row] = rows(silent, Date.parse(at(3, 1)));
assert.equal(row.state, 'unknown');
assert.equal(row.value, 'En attente de connexion');

const failed = {power_events: [
    {kind: 'wake_failed', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', error: 'network unreachable'}},
]};
[row] = rows(failed, now);
assert.equal(row.state, 'degraded');
assert.equal(row.value, 'Réveil non envoyé');
assert.match(row.detail, /network unreachable/);

const running = {power_events: [
    {kind: 'worker_online', occurred_at: at(3, 1), detail: {after_seconds: 50}},
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', pending_jobs: {'system.health': 1}, timeout_seconds: 180}},
]};
[row] = rows(running, now);
assert.equal(row.value, 'Travail en cours');

const failedJobs = {power_events: [
    {kind: 'shutdown_started', occurred_at: at(3, 9, 5), detail: {}},
    {kind: 'shutdown_granted', occurred_at: at(3, 9), detail: {executed: {'system.health': 2}, failed: 1}},
    {kind: 'worker_online', occurred_at: at(3, 1), detail: {after_seconds: 50}},
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', pending_jobs: {'system.health': 2}, timeout_seconds: 180}},
]};
[row] = rows(failedJobs, now);
assert.equal(row.state, 'degraded');
assert.match(row.detail, /1 en échec/);

// several cycles: newest first, at most three shown
const many = {power_events: []};
for (let day = 5; day >= 1; day -= 1) {
    many.power_events.push(
        {kind: 'shutdown_started', occurred_at: `2026-09-2${day}T03:09:05+02:00`, detail: {}},
        {kind: 'shutdown_granted', occurred_at: `2026-09-2${day}T03:09:00+02:00`, detail: {executed: {}, failed: 0}},
        {kind: 'worker_online', occurred_at: `2026-09-2${day}T03:01:00+02:00`, detail: {after_seconds: 60}},
        {kind: 'wake_sent', occurred_at: `2026-09-2${day}T03:00:00+02:00`, detail: {trigger: 'queued_jobs', pending_jobs: {}, timeout_seconds: 180}},
    );
}
const listed = rows(many, now);
assert.equal(listed.length, 3);
assert.match(listed[0].detail, /Réveil 2[^ ]* /);

assert.equal(rows({}, now).length, 0);

// unanswered wake, retried, then abandoned explicitly (one cycle, three tries)
const wakeSent = (minute, trigger, attempt) => ({kind: 'wake_sent', occurred_at: at(5, minute), detail: {trigger, attempt, pending_jobs: {'logs.health_check': 1}, timeout_seconds: 180}});
const abandoned = {power_events: [
    {kind: 'wake_abandoned', occurred_at: at(5, 32), detail: {attempts: 3, pending_jobs: {'logs.health_check': 1}}},
    {kind: 'wake_timeout', occurred_at: at(5, 32), detail: {attempt: 3}},
    wakeSent(29, 'retry', 3),
    {kind: 'wake_timeout', occurred_at: at(5, 16), detail: {attempt: 2}},
    wakeSent(13, 'retry', 2),
    {kind: 'wake_timeout', occurred_at: at(5, 3), detail: {attempt: 1}},
    wakeSent(0, 'queued_jobs', 1),
]};
const listedAbandoned = rows(abandoned, now);
assert.equal(listedAbandoned.length, 1);
assert.equal(listedAbandoned[0].state, 'degraded');
assert.equal(listedAbandoned[0].value, 'Réveil abandonné');
assert.match(listedAbandoned[0].detail, /3 tentatives/);
assert.match(listedAbandoned[0].detail, /suivent leur délai/);

const manualCheck = {power_events: [
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'manual_check', pending_jobs: {'logs.health_check': 1}, timeout_seconds: 180}},
]};
[row] = rows(manualCheck, Date.parse(at(3, 1)));
assert.match(row.detail, /contrôle demandé depuis Vision \(Contrôle des journaux ×1\)/);

const oneTimeout = {power_events: [
    {kind: 'wake_timeout', occurred_at: at(5, 3), detail: {attempt: 1}},
    wakeSent(0, 'queued_jobs', 1),
]};
[row] = rows(oneTimeout, now);
assert.equal(row.value, 'Sans réponse');
assert.match(row.detail, /aucune connexion après 180 s/);

const late = {power_events: [
    {kind: 'worker_online', occurred_at: at(5, 4), detail: {late: true, after_seconds: 240}},
    {kind: 'wake_timeout', occurred_at: at(5, 3), detail: {attempt: 1}},
    wakeSent(0, 'queued_jobs', 1),
]};
[row] = rows(late, now);
assert.equal(row.value, 'Connecté en retard');
assert.match(row.detail, /en retard/);

const manual = {power_events: [
    {kind: 'worker_online', occurred_at: at(9, 0), detail: {manual: true}},
    {kind: 'wake_timeout', occurred_at: at(5, 3), detail: {attempt: 1}},
    wakeSent(0, 'queued_jobs', 1),
]};
[row] = rows(manual, now);
assert.equal(row.value, 'PC démarré à la main');

// smart plug: switched on before the packet, cut after the shutdown, one cycle
const plugged = {power_events: [
    {kind: 'plug_off', occurred_at: at(3, 14, 30), detail: {reason: 'shutdown_started', watts: 0.8, idle_seconds: 40, after_seconds: 325}},
    {kind: 'shutdown_started', occurred_at: at(3, 9, 5), detail: {}},
    {kind: 'shutdown_granted', occurred_at: at(3, 9), detail: {executed: {'logs.health_check': 3}, failed: 0}},
    {kind: 'worker_online', occurred_at: at(3, 1, 20), detail: {after_seconds: 80}},
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', pending_jobs: {'logs.health_check': 3}, timeout_seconds: 180, plug: 'turned_on', wol_delay_seconds: 15}},
    {kind: 'plug_on', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs'}},
]};
const pluggedRows = rows(plugged, now);
assert.equal(pluggedRows.length, 1);
assert.equal(pluggedRows[0].state, 'healthy');
assert.equal(pluggedRows[0].value, 'Cycle terminé');
assert.match(pluggedRows[0].detail, /prise allumée .*réveil 15 s après/);
assert.match(pluggedRows[0].detail, /prise coupée .*PC éteint, consommation 0,8 W/);

// two plugged cycles stay two rows (the plug events open no cycle of their own)
const twoDays = {power_events: [
    {kind: 'plug_off', occurred_at: '2026-09-30T03:14:00+02:00', detail: {reason: 'shutdown_started', waited_seconds: 310}},
    {kind: 'shutdown_started', occurred_at: '2026-09-30T03:09:00+02:00', detail: {}},
    {kind: 'worker_online', occurred_at: '2026-09-30T03:01:00+02:00', detail: {after_seconds: 60}},
    {kind: 'wake_sent', occurred_at: '2026-09-30T03:00:00+02:00', detail: {trigger: 'queued_jobs', pending_jobs: {}, timeout_seconds: 180, plug: 'turned_on', wol_delay_seconds: 15}},
    {kind: 'plug_on', occurred_at: '2026-09-30T03:00:00+02:00', detail: {}},
    ...plugged.power_events,
]};
const twoRows = rows(twoDays, now);
assert.equal(twoRows.length, 2);
assert.match(twoRows[0].detail, /310 s après l'arrêt/);

// a plug that cannot be cut is a degraded cycle, a plug that could not be
// switched on is told but the wake outcome decides the state
const stuck = {power_events: [
    {kind: 'plug_failed', occurred_at: at(3, 15), detail: {action: 'off', reason: 'shutdown_started', error: 'Home Assistant answered HTTP 500'}},
    {kind: 'shutdown_started', occurred_at: at(3, 9, 5), detail: {}},
    {kind: 'worker_online', occurred_at: at(3, 1), detail: {after_seconds: 50}},
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', pending_jobs: {}, timeout_seconds: 180, plug: 'failed'}},
    {kind: 'plug_failed', occurred_at: at(3, 0), detail: {action: 'on', error: 'Home Assistant unreachable (down)'}},
]};
const [stuckRow] = rows(stuck, now);
assert.equal(stuckRow.state, 'degraded');
assert.match(stuckRow.detail, /prise : allumage impossible \(Home Assistant unreachable \(down\)\)/);
assert.match(stuckRow.detail, /prise : coupure impossible \(Home Assistant answered HTTP 500\)/);

const alreadyOff = {power_events: [
    {kind: 'plug_off', occurred_at: at(3, 15), detail: {reason: 'shutdown_started', already_off: true}},
    {kind: 'shutdown_started', occurred_at: at(3, 9, 5), detail: {}},
    {kind: 'wake_sent', occurred_at: at(3, 0), detail: {trigger: 'queued_jobs', pending_jobs: {}, timeout_seconds: 180}},
]};
assert.match(rows(alreadyOff, now)[0].detail, /prise coupée .*déjà coupée/);

// reliability row
assert.equal(context.stats({}).length, 0);
assert.equal(context.stats({wake_stats: {attempts: 0}}).length, 0);
const [reliable] = context.stats({wake_stats: {attempts: 10, on_time: 9, late: 1, unanswered: 0, abandoned: 0, send_failures: 0, median_seconds: 61, max_seconds: 140, since: at(1, 0)}});
assert.equal(reliable.state, 'healthy');
assert.equal(reliable.value, "10/10 réveils suivis d'une connexion");
assert.match(reliable.detail, /médiane 61 s, maximum 140 s/);
const [shaky] = context.stats({wake_stats: {attempts: 10, on_time: 5, late: 0, unanswered: 4, abandoned: 1, send_failures: 1, median_seconds: 90, max_seconds: 170, since: null}});
assert.equal(shaky.state, 'degraded');
assert.match(shaky.detail, /4 sans réponse/);
assert.match(shaky.detail, /1 abandonné/);
assert.match(shaky.detail, /1 envoi/);
"""


def test_power_cycles_explain_wake_work_and_shutdown():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    result = subprocess.run(  # noqa: S603
        [node, "-e", SCRIPT], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr or result.stdout
