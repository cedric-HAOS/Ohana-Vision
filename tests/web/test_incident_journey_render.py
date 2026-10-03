"""The dossier summarizes recorded stages without inventing execution or origin."""

import shutil
import subprocess

import pytest


def test_incident_journey_preserves_agent_facts_and_current_assessment():
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
const incident = {assessment: {next_action: 'decisions', decision_current: false}};
const details = {assessment: {next_action: 'diagnose'}, events: [
    {kind: 'action', occurred_at: '2026-10-02T10:04:00Z',
        summary: 'Réparation proposée'},
    {kind: 'investigation', occurred_at: '2026-10-02T10:02:00Z',
        summary: 'Dernière collecte <script>'},
    {kind: 'opened', occurred_at: '2026-10-02T10:00:00Z',
        summary: 'Capacité dégradée'},
    {kind: 'investigation', occurred_at: '2026-10-02T10:01:00Z',
        summary: 'Première collecte'},
]};
const before = JSON.stringify(details);
const html = controller.incidentJourney(incident, details, null);
assert(html.includes('Examiner la demande dans Shizune'));
assert(!html.includes('Actualiser l’analyse'));
assert(html.includes('La décision ne couvre pas'));
assert(html.includes('Origine de l’analyse non renseignée'));
assert(html.includes('Investigation (2)'));
assert(html.includes('Dernière collecte &lt;script>'));
assert(!html.includes('Première collecte'));
assert(html.indexOf('Capacité dégradée') < html.indexOf('Dernière collecte'));
assert(html.indexOf('Dernière collecte') < html.indexOf('Réparation proposée'));
assert(!html.includes('Réparation exécutée'));
assert(!html.includes('Résultat / vérification'));
assert.equal(JSON.stringify(details), before);
assert(controller.evolution(details).includes('Première collecte'));
const ai = controller.incidentJourney(incident, details,
    {payload: {decision_source: 'katsuyu_ai'}});
assert(ai.includes('Analyse Katsuyu'));
assert(!ai.includes('Confirmé'));
assert(controller.incidentJourney({}, null, null).includes('après chargement'));
assert(controller.incidentJourney({}, {events: []}, null)
    .includes('Aucune étape enregistrée'));
assert(controller.incidentJourney({assessment: {next_action: null,
    recommended_action: 'Ancienne recommandation'}}, details, null)
    .includes('Aucune action demandée par Agent'));
assert(!controller.incidentJourney({assessment: {next_action: 'diagnose',
    recommended_action: 'Ancienne recommandation'}}, details, null)
    .includes('Ancienne recommandation'));
details.events.push({kind: 'resolved', occurred_at: '2026-10-02T10:06:00Z',
        summary: 'Rétabli'});
assert(controller.incidentJourney({}, details, null).includes('Résolution'));
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
