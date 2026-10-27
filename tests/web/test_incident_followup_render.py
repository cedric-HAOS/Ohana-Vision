"""Render expanded incident cards: opening a dossier must not re-enable diagnosis."""

import shutil
import subprocess

import pytest


def test_expanded_completed_followup_has_no_redundant_diagnosis_button():
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
    formatDate: value => String(value),
});
vm.runInContext(source + '\nglobalThis.Controller = IncidentsController;', context);
const controller = Object.create(context.Controller.prototype);
controller.details = new Map();
controller.expandedDetails = new Set(['case']);
controller.expandedLogAnomalies = new Set();
controller.state = {topology: {devices: []}};
controller.equipmentLabel = value => value;
const incident = {
    incident_id: 'case', state: 'active', node_id: 'ha-01',
    capability_id: 'logs.health',
    expertise_state: 'ai_completed', context: {}, events: [],
    latest_decision: {decision: 'investigate',
        occurred_at: '2026-09-14T20:55:00+02:00'},
    assessment: {state: 'investigation_exhausted', label: 'Collecte terminée',
        next_action: 'details', followup: {status: 'completed',
            detail: 'Aucune nouvelle collecte <script>'}},
};
const html = controller.incidentCard(incident);
assert(!html.includes('data-tsunade-diagnose='));
assert(html.includes('Aucune nouvelle collecte &lt;script>'));
incident.assessment = {state: 'awaiting_authorization', next_action: 'decisions'};
assert(controller.incidentCard(incident).includes('Examiner la demande dans Shizune'));
incident.assessment = {state: 'stale', next_action: 'diagnose'};
assert(controller.incidentCard(incident).includes('data-tsunade-diagnose='));
incident.last_observed_at = '2026-09-21T09:34:00+02:00';
incident.latest_decision = {decision: 'watch', decision_source: 'deterministic',
    occurred_at: '2026-09-21T09:35:00+02:00',
    reason: 'Collecte tronquée <script>', conclusion: 'Surveillance actuelle'};
incident.assessment = {state: 'watch', label: 'Sous surveillance',
    next_action: 'details',
    decision_current: true, conclusion: 'Surveillance actuelle',
    reason: 'Collecte tronquée <script>',
    decided_at: '2026-09-21T09:35:00+02:00',
    followup: {status: 'completed', detail: 'Ancienne collecte terminée'}};
const current = controller.incidentCard(incident);
assert.equal(current.split('Sous surveillance').length - 1, 1);
const compact = controller.compactDecision(incident, {
    payload: incident.latest_decision,
    occurredAt: incident.latest_decision.occurred_at});
assert(compact.includes('Collecte tronquée &lt;script>'));
assert(current.includes('Collecte tronquée &lt;script>'));
assert(current.includes('Ancienne collecte terminée'));
assert(current.includes('Suivi précédent terminé'));
incident.assessment.followup = {status: 'failed',
    detail: 'Collecte non aboutie (TIMEOUT).',
    failed_at: '2026-09-21T09:00:00+02:00'};
const failed = controller.incidentCard(incident);
assert(failed.includes('Collecte tronquée &lt;script>'));
assert(failed.includes('Suivi interrompu'));
assert(failed.includes('TIMEOUT'));
assert(!failed.includes('attend votre autorisation'));
incident.assessment.state = 'stale';
incident.assessment.decision_current = false;
incident.last_observed_at = '2026-09-21T10:00:00+02:00';
const stale = controller.incidentCard(incident);
assert(stale.includes('De nouveaux éléments sont disponibles'));
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_window_extension_button_is_offered_once_and_posts_an_explicit_authorization():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    script = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/ohana_vision/web/static/incidents.js', 'utf8')
    .replace(/^import .*;$/gm, '').replace('export class', 'class');
const calls = [];
const context = vm.createContext({
    escapeHtml: value => String(value).replaceAll('<', '&lt;'),
    formatDate: value => String(value),
    API: {tsunadeLogInvestigateExtend: id => `/extend/${id}`},
    requestJson: async (url, options) => { calls.push([url, options]); return {}; },
});
vm.runInContext(source + '\nglobalThis.Controller = IncidentsController;', context);
const controller = Object.create(context.Controller.prototype);
controller.details = new Map();
controller.expandedDetails = new Set();
controller.expandedLogAnomalies = new Set();
controller.state = {topology: {devices: []}};
controller.equipmentLabel = value => value;
const incident = {
    incident_id: 'case', state: 'active', node_id: 'ha-01',
    capability_id: 'logs.health', expertise_state: 'ai_completed',
    context: {}, events: [],
    latest_decision: {decision: 'investigate',
        occurred_at: '2026-10-27T05:18:00+01:00'},
    assessment: {state: 'investigation_exhausted', label: 'Collecte terminée',
        next_action: 'details',
        recommended_action: "Étendre la recherche aux 24 heures précédentes.",
        followup: {status: 'completed', window_hours: 2,
            window_extension_available: true, detail: 'Terminé'}},
};
let html = controller.incidentCard(incident);
assert(html.includes('data-tsunade-log-extend="case"'));
assert(html.includes('mêmes limites de volume, fenêtre portée à 24 heures'));
assert(html.includes('Étendre la recherche aux 24 heures précédentes.'));

incident.assessment.followup.window_extension_available = false;
assert(!controller.incidentCard(incident).includes('data-tsunade-log-extend='));
incident.assessment.followup.window_extension_available = true;
incident.state = 'resolved';
assert(!controller.incidentCard(incident).includes('data-tsunade-log-extend='));

const button = {disabled: false};
controller.showError = () => {};
controller.showCommandStatus = () => {};
controller.load = async () => {};
controller.details.set('case', {});
controller.expandedDetails.add('case');
(async () => {
    await controller.extendLogInvestigation('case', button);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/extend/case');
    assert.equal(calls[0][1].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0][1].body),
        {source: 'vision', authorized_by: 'utilisateur Vision'});
    assert.equal(button.disabled, false);
    assert(!controller.details.has('case'));
    context.requestJson = async () => { throw new Error('refusé'); };
    const errors = [];
    controller.showError = message => errors.push(message);
    controller.errorMessage = error => error.message;
    await controller.extendLogInvestigation('case', button);
    assert(errors.includes('Extension impossible : refusé'));
    assert.equal(button.disabled, false);
})().catch(error => { console.error(error); process.exit(1); });
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
