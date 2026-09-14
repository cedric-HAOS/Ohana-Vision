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
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
