"""A verified repair can be saved without searching the resolved dossiers."""

import shutil
import subprocess

import pytest


def test_verified_repair_is_offered_outside_the_resolved_dossier():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    script = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/ohana_vision/web/static/incidents.js', 'utf8')
    .replace(/^import .*;$/gm, '').replace('export class', 'class');
const fetched = [];
const dossiers = new Map();
const context = vm.createContext({
    escapeHtml: value => String(value).replaceAll('<', '&lt;'),
    formatDate: value => `date(${value})`,
    window: {clearTimeout: () => {}, setTimeout: () => 1},
    API: {tsunadeIncident: id => `incident/${id}`},
    fetchJson: async url => { fetched.push(url); return dossiers.get(url); },
});
vm.runInContext(source + '\nglobalThis.Controller = IncidentsController;', context);

function element() {
    const classes = new Set(['hidden']);
    return {
        innerHTML: '',
        classList: {
            toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
            contains: name => classes.has(name),
        },
    };
}

(async () => {
    const controller = Object.create(context.Controller.prototype);
    controller.details = new Map();
    controller.expandedDetails = new Set();
    controller.expandedLogAnomalies = new Set();
    controller.state = {topology: {
        devices: [{node: 'zwave-01', label: 'ZWAVE-01'}],
        nodes: [{id: 'zwave-01', services: [{id: 'zwave', name: 'Z-Wave JS'}]}],
    }};
    controller.elements = {experiencePending: element(), commandStatus: element()};

    const repair = {
        repair_id: 'r1', status: 'succeeded',
        action: 'le redémarrage supervisé de l’add-on Z-Wave JS',
    };
    const zwave = {
        incident_id: 'zw', state: 'resolved', node_id: 'zwave-01', service_id: 'zwave',
        capability_id: 'zwave.status', message: 'Z-Wave JS driver is ready',
        ended_at: '2026-09-26T21:16:35+02:00', expertise_state: 'deterministic',
        context: {}, events: [], repairs: [repair],
        latest_decision: {decision: 'action_required', occurred_at: '2026-09-26T21:15:32+02:00'},
    };
    const candidate = {prompt: 'Enregistrer comme réparation connue ?'};

    // 1. The dossier cached while the incident was active has no candidate:
    //    it is fetched again once the list shows the incident resolved.
    controller.details.set('zw', {state: 'active', repairs: []});
    dossiers.set('incident/zw', {state: 'resolved', experience_candidate: candidate});
    controller.incidents = [zwave, {...zwave, incident_id: 'old', repairs: []}];
    await controller.loadDecisionDetails();
    assert.deepEqual(fetched, ['incident/zw']);

    // 2. The pending section lists it whatever the filter.
    controller.renderExperiencePending();
    const section = controller.elements.experiencePending;
    assert(!section.classList.contains('hidden'));
    assert(section.innerHTML.includes('Z-Wave JS · ZWAVE-01'), section.innerHTML);
    assert(section.innerHTML.includes('data-tsunade-experience="zw"'));

    // 3. The closed card carries the button itself, not a hint to the dossier.
    const card = controller.incidentCard(zwave);
    assert(card.includes('data-tsunade-experience="zw"'), card);
    assert(!card.includes('attend votre confirmation dans le dossier'));

    // 4. The confirmed outcome banner offers the same button.
    controller.followedRepair = {incidentId: 'zw', repairId: 'r1'};
    controller.updateFollowedRepair();
    const banner = controller.elements.commandStatus.innerHTML;
    assert(banner.startsWith('Réparation confirmée par Shikamaru.'), banner);
    assert(banner.includes('data-tsunade-experience="zw"'));

    // 5. Once saved, the dossier has no candidate and the section hides.
    controller.details.set('zw', {state: 'resolved', experience_candidate: null});
    controller.renderExperiencePending();
    assert(section.classList.contains('hidden'));
    await controller.loadDecisionDetails();
    assert.equal(fetched.length, 1, 'a saved dossier is not fetched again');
})().catch(error => { console.error(error); process.exit(1); });
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
