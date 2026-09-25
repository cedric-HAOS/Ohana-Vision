"""Render repair decisions: Vision can authorize, defer or refuse a proposal."""

import shutil
import subprocess

import pytest


def test_proposed_repair_offers_authorize_defer_and_refuse():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    script = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/ohana_vision/web/static/incidents.js', 'utf8')
    .replace(/^import .*;$/gm, '').replace('export class', 'class');
const context = vm.createContext({
    escapeHtml: value => String(value).replaceAll('<', '&lt;'),
    formatDate: value => `date(${value})`,
});
vm.runInContext(source + '\nglobalThis.Controller = IncidentsController;', context);
const controller = Object.create(context.Controller.prototype);
controller.details = new Map();
// Collapsed card: the repair state must be readable without the dossier.
controller.expandedDetails = new Set();
controller.expandedLogAnomalies = new Set();
controller.state = {topology: {devices: []}};
controller.equipmentLabel = value => value;
const repair = {
    repair_id: 'repair-1', operation: 'restart_addon', target: 'core_mosquitto',
    risk: 'low', status: 'proposed', consequences: ['Clients MQTT déconnectés.'],
    action: 'le redémarrage supervisé de l’add-on Mosquitto',
};
const incident = {
    incident_id: 'case', state: 'active', node_id: 'ha-01',
    capability_id: 'mqtt.roundtrip',
    expertise_state: 'deterministic', context: {}, events: [], repairs: [repair],
    latest_decision: {decision: 'action_required',
        epistemic_status: 'confirmed_by_probe',
        occurred_at: '2026-09-25T14:52:00+02:00'},
    assessment: {state: 'awaiting_authorization', next_action: 'decisions'},
};
let html = controller.incidentCard(incident);
assert(html.includes('data-tsunade-repair-authorize="repair-1"'));
assert(html.includes('data-tsunade-repair-decision="defer"'));
assert(html.includes('data-tsunade-repair-decision="refuse"'));
assert(html.includes('add-on Mosquitto</strong> · En attente de validation'));

repair.deferred_until = '2026-09-25T15:52:00+02:00';
html = controller.incidentCard(incident);
assert(html.includes('reportée jusqu’à date(2026-09-25T15:52:00+02:00)'));
assert(!html.includes('data-tsunade-repair-decision="defer"'));
assert(html.includes('data-tsunade-repair-decision="refuse"'));

repair.status = 'refused';
repair.deferred_until = null;
repair.authorization_source = 'vision';
html = controller.incidentCard(incident);
assert(!html.includes('data-tsunade-repair-authorize='));
assert(!html.includes('data-tsunade-repair-decision='));
assert(html.includes('Refusée, aucune action exécutée · refusée depuis vision'));
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
