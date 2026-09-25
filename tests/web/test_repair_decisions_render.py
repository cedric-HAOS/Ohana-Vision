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
    expected_result: 'L’aller-retour MQTT réussit de nouveau.',
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
// The risk and consequences are readable before authorizing, on the card.
assert(html.includes('Risque faible</strong> · Résultat attendu : L’aller'));
assert(html.includes('<li>Clients MQTT déconnectés.</li>'));
assert(html.includes('data-repair-risk="low"'));

repair.deferred_until = '2026-09-25T15:52:00+02:00';
html = controller.incidentCard(incident);
assert(html.includes('reportée jusqu’à date(2026-09-25T15:52:00+02:00)'));
assert(!html.includes('data-tsunade-repair-decision="defer"'));
assert(html.includes('data-tsunade-repair-decision="refuse"'));

repair.status = 'verifying';
repair.deferred_until = null;
repair.verification_deadline = '2026-09-25T15:00:00+02:00';
html = controller.incidentCard(incident);
assert(html.includes('vérification attendue avant date(2026-09-25T15:00:00+02:00)'));

repair.status = 'refused';
repair.deferred_until = null;
repair.authorization_source = 'vision';
html = controller.incidentCard(incident);
assert(!html.includes('data-tsunade-repair-authorize='));
assert(!html.includes('data-tsunade-repair-decision='));
assert(html.includes('Refusée, aucune action exécutée · refusée depuis vision'));
assert(!html.includes('incident-card__repair-risk'));
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_riskier_repairs_need_an_explicit_confirmation():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    script = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/ohana_vision/web/static/incidents.js', 'utf8')
    .replace(/^import .*;$/gm, '').replace('export class', 'class');
const requests = [];
const confirmations = [];
const context = vm.createContext({
    escapeHtml: value => String(value),
    formatDate: value => String(value),
    API: {tsunadeRepairAuthorize: id => `/authorize/${id}`},
    requestJson: async (url) => { requests.push(url); return {}; },
    window: {confirm: message => { confirmations.push(message); return false; }},
});
vm.runInContext(source + '\nglobalThis.Controller = IncidentsController;', context);
const controller = Object.create(context.Controller.prototype);
controller.details = new Map();
controller.expandedDetails = new Set();
controller.showError = () => {};
controller.showCommandStatus = () => {};
controller.load = async () => {};
(async () => {
    const button = {disabled: false};
    await controller.authorizeRepair('case', 'repair-1', button, 'medium');
    assert.equal(confirmations.length, 1);
    assert.deepEqual(requests, []);
    await controller.authorizeRepair('case', 'repair-2', button, 'low');
    assert.equal(confirmations.length, 1);
    assert.deepEqual(requests, ['/authorize/case']);
})().catch(error => { console.error(error); process.exit(1); });
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
