"""Incident cards follow the live list, name the service and the real source."""

import shutil
import subprocess

import pytest


def test_card_title_repairs_source_label_and_followed_outcome():
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
    window: {clearTimeout: () => {}, setTimeout: () => 1},
});
vm.runInContext(source + '\nglobalThis.Controller = IncidentsController;', context);
const controller = Object.create(context.Controller.prototype);
controller.details = new Map();
controller.expandedDetails = new Set();
controller.expandedLogAnomalies = new Set();
controller.state = {topology: {
    devices: [{node: 'infra-01', label: 'INFRA-01'}, {node: 'zwave-01', label: 'ZWAVE-01'}],
    nodes: [
        {id: 'infra-01', services: [{id: 'chrony', name: 'Chrony'}]},
        {id: 'zwave-01', services: [{id: 'zwave', name: 'Z-Wave JS'}]},
    ],
}};
const shown = [];
controller.elements = {};
controller.showCommandStatus = (message, tone) => shown.push([message, tone]);

// 1. A chrony outage is titled by its service, not by "timed out".
const chrony = {
    incident_id: 'ntp', state: 'active', node_id: 'infra-01', service_id: 'chrony',
    capability_id: 'ntp.query', message: 'timed out', expertise_state: 'deterministic',
    context: {}, events: [], repairs: [],
    assessment: {title: 'timed out', state: 'action_required'},
};
let html = controller.incidentCard(chrony);
assert(html.includes('<h3>Chrony · INFRA-01</h3>'), html);
assert(html.includes('timed out'));

// 2. A cached dossier with the repair still proposed must not win over the
//    reloaded list, where the authorization already failed (26 September).
const zwaveRepair = {
    repair_id: 'r1', status: 'proposed', risk: 'medium', operation: 'restart_addon',
    target: 'a0d7b954_zwavejs2mqtt', action: 'le redémarrage supervisé de l’add-on Z-Wave JS',
};
controller.details.set('zw', {repairs: [zwaveRepair], events: []});
const zwave = {
    incident_id: 'zw', state: 'resolved', node_id: 'zwave-01', service_id: 'zwave',
    capability_id: 'zwave.status', message: 'Z-Wave JS driver is ready',
    expertise_state: 'deterministic', context: {}, events: [],
    repairs: [{...zwaveRepair, status: 'failed', authorization_source: 'vision',
        result: 'Le Supervisor a refusé le redémarrage de a0d7b954_zwavejs2mqtt'}],
    latest_decision: {decision: 'action_required', occurred_at: '2026-09-26T20:04:54+02:00'},
    assessment: {state: 'resolved'},
};
html = controller.incidentCard(zwave);
assert(!html.includes('data-tsunade-repair-authorize='), 'stale authorize button');
assert(!html.includes('En attente de validation'));

// 3. A deterministic procedure is not presented as a Katsuyu analysis.
const deterministic = {events: [{occurred_at: '2026-09-26T19:22:20+02:00', payload: {
    decision: 'action_required', decision_source: 'deterministic',
    epistemic_status: 'confirmed_by_probe',
    proposals: ['Vérifier que chrony est actif sur INFRA-01.'],
}}]};
html = controller.tsunadeExpertise(deterministic);
assert(html.includes('Analyse déterministe de Tsunade'));
assert(!html.includes('Analyse Katsuyu'));
const katsuyu = {events: [{occurred_at: '2026-09-26T05:07:00+02:00', payload: {
    decision: 'investigate', decision_source: 'katsuyu_ai', epistemic_status: 'hypothesis',
    hypotheses: [{summary: 'Composant custom', confidence: 0.6}],
}}]};
assert(controller.tsunadeExpertise(katsuyu).includes('Analyse Katsuyu'));

// 4. The authorization banner is replaced by the verified outcome.
controller.incidents = [{incident_id: 'ntp', repairs: [{repair_id: 'r2', status: 'verifying'}]}];
controller.followedRepair = {incidentId: 'ntp', repairId: 'r2'};
controller.updateFollowedRepair();
assert.equal(shown.length, 0);
controller.incidents[0].repairs[0].status = 'succeeded';
controller.updateFollowedRepair();
assert.deepEqual(shown.at(-1), ['Réparation confirmée par Shikamaru.', 'success']);
assert.equal(controller.followedRepair, null);
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
