"""The Tsunade triage table: problem, specific cause, certainty and action per row."""

import shutil
import subprocess

import pytest


def test_triage_table_rows_grouping_search_and_selection():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    script = r"""
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = require('./tests/web/incidents_source.js')();
const fetched = [];
let olderPage = {has_more: true, incidents: []};
const context = vm.createContext({
    API: {tsunadeOlderIncidents: id => `/older/${id}`},
    fetchJson: async url => { fetched.push(url); return olderPage; },
    escapeHtml: value => String(value).replaceAll('<', '&lt;'),
    formatDate: value => `date(${value})`,
    window: {clearTimeout: () => {}, setTimeout: () => 1, sessionStorage: {getItem: () => null, setItem: () => {}}},
});
vm.runInContext(source + '\nglobalThis.Controller = IncidentsController;', context);
const controller = Object.create(context.Controller.prototype);
Object.assign(controller, {
    details: new Map(), expandedDetails: new Set(), expandedLogAnomalies: new Set(),
    manualForms: new Set(), manualDrafts: new Map(), similar: new Map(),
    filter: 'all', query: '', groupBy: 'equipment', selectedIncident: null, loaded: true,
    olderIncidents: [], olderExhausted: false, summary: {incident_count: 185},
    elements: {filters: [], groupings: [], rows: {innerHTML: ''}, detail: {innerHTML: ''}},
    state: {topology: {
        devices: [{node: 'linky-01', label: 'LINKY-01'}, {node: 'zwave-01', label: 'ZWAVE-01'}],
        nodes: [
            {id: 'linky-01', services: [{id: 'dns-secondaire', name: 'DNS secondaire'}]},
            {id: 'zwave-01', services: [{id: 'zwave', name: 'Z-Wave JS'}]},
        ],
    }},
});
const now = new Date();
const minutesAgo = minutes => new Date(now.getTime() - minutes * 60000).toISOString();

// A resolved DNS outage: its last message says the resolution succeeded.
const dns = {
    incident_id: 'dns', state: 'resolved', workflow_state: 'resolved', severity: 'critical',
    node_id: 'linky-01', service_id: 'dns-secondaire', capability_id: 'dns.resolve',
    message: 'DNS resolution succeeded for example.com.',
    started_at: '2026-11-15T10:56:44+01:00', ended_at: '2026-11-15T11:09:52+01:00',
    repairs: [], assessment: {state: 'resolved', priority: 7},
    latest_decision: {
        decision: 'investigate', confidence: 0.8, diagnostic_level: 'PROBABLE',
        conclusion: 'Des pistes de diagnostic nécessitent une vérification.',
        interpretation: 'Échecs répétés de résolution DNS sur le serveur secondaire.',
        recommended_action: 'Consulter les journaux du serveur DNS secondaire.',
        occurred_at: '2026-11-15T10:58:00+01:00',
    },
};
// An active Z-Wave outage whose supervised restart waits for authorization.
const zwave = {
    incident_id: 'zw', state: 'active', workflow_state: 'in_progress', severity: 'critical',
    node_id: 'zwave-01', service_id: 'zwave', capability_id: 'zwave.status',
    message: 'Z-Wave JS Server version (3.11.0) is incompatible',
    started_at: minutesAgo(125), ended_at: null, last_observed_at: minutesAgo(1),
    repairs: [{repair_id: 'r1', status: 'proposed', risk: 'medium',
        action: 'le redémarrage supervisé de l’add-on Z-Wave JS'}],
    assessment: {state: 'action_required', priority: 1},
    latest_decision: {
        decision: 'action_required', confidence: 1, diagnostic_level: 'CONFIRMED',
        conclusion: 'Le pilote Z-Wave JS configuré échoue à une vérification déterministe.',
        occurred_at: minutesAgo(2), basis_observed_at: minutesAgo(1),
    },
};
// Never analysed.
const silent = {
    incident_id: 'quiet', state: 'resolved', workflow_state: 'resolved', severity: 'degraded',
    node_id: 'zwave-01', service_id: 'dns-primary', capability_id: 'dns.resolve',
    message: 'DNS resolution succeeded.', started_at: minutesAgo(60 * 30),
    ended_at: minutesAgo(60 * 30 - 2), repairs: [], latest_decision: null,
    assessment: {state: 'resolved', priority: 7},
};
controller.incidents = [dns, silent, zwave];

// 1. Rows name the service, show the specific cause, its certainty and the action.
controller.renderIncidentList();
let rows = controller.elements.rows.innerHTML;
assert(rows.includes('</strong><span>DNS secondaire</span>'), rows);
assert(!rows.includes('DNS resolution succeeded'), 'the recovery message is not the problem');
assert(rows.includes('Échecs répétés de résolution DNS'), 'interpretation shown');
assert(!rows.includes('Des pistes de diagnostic'), 'generic conclusion hidden');
assert(rows.includes('incident-certainty--probable">Probable · 80 %'));
assert(rows.includes('incident-certainty--confirmed">Confirmée · 100 %'));
assert(rows.includes('incident-certainty--none">Pas d’analyse'));
assert(rows.includes('Pas encore analysé'));
assert(rows.includes('</strong><span>Résolution DNS · dns primary</span>'), 'unknown service named by its check');
assert(rows.includes('À autoriser :</strong> Le redémarrage supervisé'), rows);
assert(rows.includes('Consulter les journaux du serveur DNS secondaire.'));
assert(rows.includes('depuis 2 h 05'), rows);
assert(rows.includes('<span>13 min</span>'), rows);

// 2. Grouped by equipment, the active incident's equipment comes first.
const zwaveGroup = rows.indexOf('ZWAVE-01 <span>2 incidents · 1 actif</span>');
const linkyGroup = rows.indexOf('LINKY-01 <span>1 incident</span>');
assert(zwaveGroup >= 0 && linkyGroup > zwaveGroup, rows);

// 3. The first row is selected and its card is shown beside the table.
assert.equal(controller.selectedIncident, 'zw');
assert(rows.includes('data-tsunade-select="zw" tabindex="0" aria-current="true"'));
assert(controller.elements.detail.innerHTML.includes('data-tsunade-repair-authorize="r1"'));

// 4. By day, today's incident leads; without grouping there is no heading row.
controller.groupBy = 'day';
controller.renderIncidentList();
rows = controller.elements.rows.innerHTML;
assert(rows.indexOf('Aujourd’hui · ') >= 0, rows);
assert(rows.indexOf('Aujourd’hui · ') < rows.indexOf(controller.dayLabel(dns.started_at)), rows);
// Day labels are Paris days, named relative to the current day.
const sunday = '2026-11-15T23:30:00+01:00';
assert.equal(controller.dayLabel(sunday, new Date('2026-11-16T09:00:00+01:00')), 'Hier · 15/11/2026');
assert.equal(controller.dayLabel(sunday, new Date('2026-11-20T09:00:00+01:00')), 'Dimanche 15 novembre 2026');
assert.equal(controller.dayLabel('2026-11-15T23:30:00Z', new Date('2026-11-16T09:00:00+01:00')), 'Aujourd’hui · 16/11/2026');
controller.groupBy = 'none';
controller.renderIncidentList();
assert(!controller.elements.rows.innerHTML.includes('incidents-table__group'));

// 4b. A resolved incident keeps its opening symptom for the search and the card.
const healed = {...silent, incident_id: 'healed', opening_message: 'disk_critical on root'};
controller.incidents = [dns, silent, zwave, healed];
controller.groupBy = 'none';
controller.query = 'disk';
controller.renderIncidentList();
rows = controller.elements.rows.innerHTML;
assert(rows.includes('data-tsunade-select="healed"') && !rows.includes('data-tsunade-select="quiet"'), rows);
assert(rows.includes('Pas encore analysé · constat : disk_critical on root'), rows);
assert(controller.elements.detail.innerHTML.includes('À l’ouverture : disk_critical on root'));
controller.incidents = [dns, silent, zwave];
controller.query = '';

// 5. The search ignores accents and case, every word must match.
controller.query = 'ECHECS dns';
controller.renderIncidentList();
rows = controller.elements.rows.innerHTML;
assert(rows.includes('data-tsunade-select="dns"') && !rows.includes('data-tsunade-select="zw"'), rows);
assert.equal(controller.selectedIncident, 'dns', 'selection follows the visible rows');
controller.query = 'add-on z-wave';
controller.renderIncidentList();
assert(controller.elements.rows.innerHTML.includes('data-tsunade-select="zw"'));
controller.query = 'portail';
controller.renderIncidentList();
assert(controller.elements.rows.innerHTML.includes('Aucun incident ne correspond à la recherche.'));
assert(controller.elements.detail.innerHTML.includes('Sélectionnez un incident'));

// 6. The state filters still apply.
controller.query = '';
controller.filter = 'active';
controller.renderIncidentList();
rows = controller.elements.rows.innerHTML;
assert(rows.includes('data-tsunade-select="zw"') && !rows.includes('data-tsunade-select="dns"'));
assert(!rows.includes('data-tsunade-older'), 'no history offer among active incidents');

// 7. The footer says how much is searchable and loads the older resolved page
//    before the oldest resolved incident held, without duplicates.
(async () => {
    controller.filter = 'all';
    controller.renderIncidentList();
    rows = controller.elements.rows.innerHTML;
    assert(rows.includes('3 incidents chargés sur 185'), rows);
    assert(rows.includes('data-tsunade-older'));
    const older = {...dns, incident_id: 'old', started_at: '2026-10-01T08:00:00+02:00',
        ended_at: '2026-10-01T08:10:00+02:00', node_id: 'linky-01'};
    olderPage = {has_more: false, incidents: [older, {...dns}]};
    await controller.loadOlderIncidents({disabled: false, textContent: ''});
    assert.deepEqual(fetched, ['/older/quiet'], 'anchored on the oldest resolved incident held');
    assert.equal(controller.tableIncidents().length, 4);
    rows = controller.elements.rows.innerHTML;
    assert(rows.includes('data-tsunade-select="old"'));
    assert(rows.includes('4 incidents chargés sur 185'));
    assert(!rows.includes('data-tsunade-older'), 'history exhausted');
    // A reload of the latest 100 keeps the older page.
    controller.incidents = [dns, silent, zwave];
    controller.renderIncidentList();
    assert(controller.elements.rows.innerHTML.includes('data-tsunade-select="old"'));

    // 8. The card names the incident's own cause, not the generic reason.
    const card = controller.incidentCard({...dns, state: 'active', assessment: {
        state: 'investigation_exhausted', label: 'Investigation terminée',
        reason: 'L’analyse corrélée met en évidence des éléments.',
        followup: {status: 'completed'}}});
    assert(card.includes('Échecs répétés de résolution DNS'), card);
    assert(!card.includes('L’analyse corrélée'), card);
})().catch(error => { console.error(error); process.exit(1); });
"""
    result = subprocess.run(
        [node, "-e", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert result.returncode == 0, result.stderr
