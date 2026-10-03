"""Evidence provenance and repair dates must not invent certainty or execution."""

import shutil
import subprocess

import pytest


def test_evidence_and_repair_audit_rendering():
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
const c = Object.create(context.Controller.prototype);
const record = {occurredAt: '2026-10-02T10:00:00Z',
    payload: {conclusion: 'Conclusion actuelle'}};
const dossier = {events: [
    {kind: 'diagnostic', occurred_at: '2026-10-02T09:00:00Z',
        payload: {facts: ['Ancien fait']}},
    {kind: 'diagnostic', occurred_at: '2026-10-02T12:00:00+02:00',
        payload: {facts: ['Fait actuel'], conclusion: 'Version du dossier'}},
]};
const completed = c.completeDecisionRecord(record, dossier);
assert.equal(completed.payload.facts[0], 'Fait actuel');
assert.equal(completed.payload.conclusion, 'Conclusion actuelle');
assert.equal(c.completeDecisionRecord({...record,
    occurredAt: '2026-10-02T11:00:00Z'}, dossier).payload.facts, undefined);
assert.equal(record.payload.facts, undefined);
const decision = {
    facts: ['Capacité dégradée <script>'], origin: 'katsuyu_ai',
    verdict: 'INSUFFICIENT_CONTEXT',
    confirmation_gap: ['Configuration inconnue'], missing_context: ['Journaux'],
    failed_investigations: ['dns.query'],
    collection_facts: {source: 'investigation.followup', matched_lines: 73,
        anomaly_count: 0, truncated: true},
};
let html = c.decisionEvidence(decision);
for (const text of ['Capacité dégradée &lt;script>', 'Analyse Katsuyu',
    'Configuration inconnue', 'Contexte manquant', 'dns.query',
    'Lignes correspondantes : 73', 'Anomalies relevées : 0',
    'Collecte tronquée', 'Analyse non concluante', 'ne prouve la résolution']) {
    assert(html.includes(text), text);
}
assert(!html.includes('<script>'));
html = c.decisionEvidence({});
assert(html.includes('Origine non renseignée'));
assert(html.includes('Aucun fait détaillé'));
assert(!html.includes('Analyse déterministe'));
const unknown = {latest_decision: {hypotheses: [{statement: 'Piste possible'}]}};
html = c.tsunadeExpertise(unknown);
assert(html.includes('Hypothèses à confirmer'));
assert(!html.includes('Analyse Katsuyu'));
assert(!html.includes('Analyse déterministe'));
html = c.expertiseDetails({epistemic_status: 'hypothesis',
    hypotheses: [{statement: 'DNS', supporting_evidence: ['Latence'],
        contradicting_evidence: ['Réponse valide']} ]});
assert(html.includes('cause non confirmée'));
assert(html.includes('Indices contradictoires'));
assert(html.includes('Réponse valide'));
assert(!html.includes('Analyse Katsuyu'));
assert.equal(c.tsunadeExpertise({latest_decision: null,
    events: [{payload: unknown.latest_decision}]}), '');
html = c.investigationEvidence({events: [{kind: 'investigation',
    occurred_at: '2026-10-02', summary: 'Collecte impossible', payload: {
        operation: 'dns.query', status: 'TIMEOUT', error: '<timeout>',
        result: {truncated: true, reason: 'Limite atteinte'}}}]});
assert(html.includes('dns.query'));
assert(html.includes('&lt;timeout>'));
assert(html.includes('Limite atteinte'));
assert(html.includes('ne qualifie pas la santé'));
html = c.investigationEvidence({events: [{kind: 'investigation',
    occurred_at: '2026-10-02', summary: 'Supervisor', payload: {
        source: 'supervisor.teleinformation', configuration_inspection: {
            remote: {addons: [{addon: 'teleinfo2mqtt', state: 'stopped'}]}}}}]});
assert(html.includes('supervisor.teleinformation'));
assert(html.includes('teleinfo2mqtt'));
assert(html.includes('stopped'));
assert(c.expertiseDetails({epistemic_status: 'confirmed_by_supervisor'})
    .includes('Confirmé par investigation déterministe'));
const repair = {operation: 'restart_addon', action: 'Redémarrage',
    proposed_at: '2026-10-02T10:00', authorization_source: 'shizune',
    authorized_by: '<opérateur>', authorized_at: '2026-10-02T10:01'};
html = c.repairJourney({...repair, status: 'refused'});
assert(html.includes('<strong>Refus</strong>'));
assert(!html.includes('<strong>Autorisation</strong>'));
assert(html.includes('&lt;opérateur>'));
assert(html.includes('Aucune exécution enregistrée'));
html = c.repairJourney({...repair, status: 'proposed', authorized_at: null,
    deferred_until: '2026-10-02T12:00'});
assert(html.includes('Report — échéance'));
assert(!html.includes('Exécution / tentative'));
for (const [status, expected] of [['succeeded', 'Vérification Shikamaru réussie'],
    ['failed', 'Échec enregistré'], ['unverified', 'Résultat non confirmé'],
    ['expired', 'Expiration de la proposition']]) {
    html = c.repairJourney({...repair, status,
        executed_at: status === 'expired' ? null : '2026-10-02T10:02',
        verified_at: '2026-10-02T10:03', result: 'Résultat <script>'});
    assert(html.includes(expected));
    assert(html.includes('Résultat &lt;script>'));
    if (status !== 'succeeded') assert(!html.includes('vérification réussie'));
}
html = c.repairJourney({...repair, status: 'verifying',
    executed_at: '2026-10-02T10:02', verification_deadline: '2026-10-02T10:08'});
assert(html.includes('Vérification Shikamaru attendue avant'));
assert(!html.includes('Vérification Shikamaru réussie'));
"""
    result = subprocess.run([node, "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
