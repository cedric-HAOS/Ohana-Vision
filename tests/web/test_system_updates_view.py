"""System update view: verdict, pending packages and stale package lists."""

# ruff: noqa: E501 (the embedded script keeps one fixture per line)

import shutil
import subprocess

import pytest

SCRIPT = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/ohana_vision/web/static/system_updates.js', 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export (async )?function/gm, '$1function')
    .replace(/^export (const|class)/gm, '$1');
const context = vm.createContext({
    escapeHtml: value => String(value), API: {}, fetchJson: async () => ({}),
    formatParis: value => (value ? `Paris ${value}` : '—'),
    Intl, Date, Object, Number, Math, String, Array,
});
vm.runInContext(source + '\nglobalThis.summary = summaryCard; globalThis.packages = packagesCard; globalThis.availability = actionAvailability; globalThis.confirmation = upgradeConfirmation; globalThis.actions = actionsCard;', context);

const base = {
    status: 'up_to_date', message: 'Le système est à jour.', pending_count: 0,
    security_count: 0, packages: [], packages_truncated: false, held_back: [],
    reboot_required: false, reboot_packages: [], lists_stale: false,
    lists_refreshed_at: '2026-11-04T06:00:00+01:00', lists_age_days: 0.4,
    last_apt_run: null, read_at: '2026-11-04T09:00:00+01:00',
};

let card = context.summary(base);
assert.equal(card.state, 'healthy');
assert.equal(card.summary, 'Le système est à jour.');
assert.equal(card.facts.find(([label]) => label === 'Listes de paquets')[1], 'Paris 2026-11-04T06:00:00+01:00 (Moins d’un jour)');
assert.equal(card.facts.find(([label]) => label === 'Dernière opération apt')[1], 'Aucune opération apt récente');

// stale lists are a warning, never a reassuring zero
const stale = {...base, status: 'stale_lists', lists_stale: true, lists_age_days: 26,
    message: 'Les listes de paquets sont périmées.'};
card = context.summary(stale);
assert.equal(card.state, 'degraded');
assert.match(card.facts.find(([label]) => label === 'Listes de paquets')[1], /26 jour/);
assert.match(context.packages(stale).summary, /incomplète/);

// security fixes come first and flag the card
const security = {...base, status: 'security_updates', pending_count: 2, security_count: 1,
    packages: [
        {name: 'libssl3t64', installed_version: '3.5.1-1', candidate_version: '3.5.1-1+deb13u1', origin: 'Debian-Security:13', security: true, new_package: false},
        {name: 'linux-image-6.12', installed_version: null, candidate_version: '6.12.48', origin: 'Raspberry Pi', security: false, new_package: true},
    ],
    held_back: ['raspi-firmware'], reboot_required: true, reboot_packages: ['libc6'],
    last_apt_run: {started_at: '2026-10-09  16:58:47', command: 'apt-get install -y dnsutils', changes: {Install: 2}}};
assert.equal(context.summary(security).state, 'degraded');
assert.match(context.summary(security).facts.find(([label]) => label === 'Dernière opération apt')[1], /apt-get install -y dnsutils \(Install ×2\)/);
const packagesCard = context.packages(security);
assert.equal(packagesCard.state, 'degraded');
assert.equal(packagesCard.rows[0].label, 'libssl3t64');
assert.equal(packagesCard.rows[0].state, 'degraded');
assert.match(packagesCard.rows[0].detail, /sécurité · installée 3\.5\.1-1/);
assert.match(packagesCard.rows[1].detail, /nouveau paquet/);
assert.equal(packagesCard.rows.find((row) => row.label === 'raspi-firmware').value, 'Retenu');
assert.equal(packagesCard.rows.find((row) => row.label === 'libc6').value, 'Redémarrage');

// a truncated list says how many packages there really are
const long = {...base, pending_count: 90, packages_truncated: true,
    packages: [{name: 'a', installed_version: '1', candidate_version: '2', origin: 'Debian', security: false, new_package: false}]};
assert.equal(context.packages(long).rows.at(-1).value, '90 au total');

// the buttons: nothing offered without helpers, update only on fresh lists with work to do
assert.equal(context.availability(base).available, false);
assert.match(context.availability({...base, helper: {installed: false}}).reason, /Ohana-Installer/);
const idle = {refresh: {state: 'succeeded'}, upgrade: {state: 'never'}};
let access = context.availability({...base, helper: {installed: true, ...idle}});
assert.equal(access.refreshDisabled, false);
assert.equal(access.upgradeDisabled, true);
assert.match(access.reason, /Aucune mise à jour en attente/);
access = context.availability({...security, helper: {installed: true, ...idle}});
assert.equal(access.upgradeDisabled, false);
access = context.availability({...security, lists_stale: true, helper: {installed: true, ...idle}});
assert.equal(access.upgradeDisabled, true);
assert.match(access.reason, /Actualisez d’abord/);
access = context.availability({...security, helper: {installed: true, refresh: {state: 'never'}, upgrade: {state: 'running'}}});
assert.equal(access.running, true);
assert.equal(access.refreshDisabled, true);
assert.equal(access.upgradeDisabled, true);
assert.match(context.confirmation(security), /Installer 2 mise\(s\) à jour sur INFRA-01 \(dont 1 de sécurité\)/);
assert.match(context.confirmation(security), /ne redémarre pas/);
const failedAction = context.actions({...security, helper: {installed: true, refresh: {state: 'never'},
    upgrade: {state: 'failed', finished_at: '2026-11-04T10:00:00+01:00', result: 'exit-code', exit_status: '100'}}});
assert.equal(failedAction.state, 'degraded');
assert.match(failedAction.rows[1].detail, /exit-code, code 100/);
"""


def test_system_update_cards_show_verdict_packages_and_stale_lists():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript rendering regression")
    result = subprocess.run(  # noqa: S603
        [node, "-e", SCRIPT], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr or result.stdout
