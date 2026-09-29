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
vm.runInContext(source + '\nglobalThis.rows = katsuyuPowerRows;', context);
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
"""


def test_power_cycles_explain_wake_work_and_shutdown():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    result = subprocess.run(  # noqa: S603
        [node, "-e", SCRIPT], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr or result.stdout
