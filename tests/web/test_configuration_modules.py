"""Execute the configuration ES modules in Node, without a browser."""

import shutil
import subprocess
from pathlib import Path

import pytest

STATIC_DIRECTORY = Path("src/ohana_vision/web/static").resolve()


def run_module_script(script: str) -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required for the JavaScript module tests")
    result = subprocess.run(
        [node, "--input-type=module", "-e", script, STATIC_DIRECTORY.as_uri()],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_configuration_mixins_compose_without_collisions() -> None:
    """Each domain module adds its own methods; none silently overrides another."""
    run_module_script(r"""
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = process.argv[1];
const entry = await import(`${root}/configuration.js`);
const directory = new URL(`${root}/configuration/`);
const owners = new Map();
for (const name of Object.getOwnPropertyNames(
    entry.ConfigurationController.prototype)) {
    owners.set(name, ['configuration.js']);
}
for (const file of fs.readdirSync(directory).filter(f => f !== 'shared.js')) {
    const module = await import(new URL(file, directory));
    const mixins = Object.values(module);
    assert.equal(mixins.length, 1, `${file} must export one mixin`);
    for (const name of Object.keys(mixins[0])) {
        owners.get(name)?.push(file) ?? owners.set(name, [file]);
        assert.equal(
            entry.ConfigurationController.prototype[name], mixins[0][name],
            `${file}: ${name} is not installed on the controller`);
    }
}
const collisions = [...owners].filter(([, files]) => files.length > 2
    || (files.length === 2 && files[0] !== 'configuration.js'));
assert.deepEqual(collisions, []);
for (const name of ['load', 'renderDHCP', 'renderArchitecture', 'editDevice',
    'renderPlugins', 'renderWorkers', 'renderCompanions', 'renderNetwork']) {
    assert.equal(typeof entry.ConfigurationController.prototype[name],
        'function', name);
}
""")


def test_adguard_sync_editor_submits_only_supported_configuration() -> None:
    run_module_script(r"""
import assert from 'node:assert/strict';
const {PluginsMethods} = await import(`${process.argv[1]}/configuration/plugins.js`);
globalThis.document = {createElement: () => ({textContent: '',
    get innerHTML() { return this.textContent
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('"', '&quot;'); }})};
const plugin = {id: 'adguard_sync', enabled: false, configuration: {
    interval_seconds: 60, timeout: 2, maximum_age_seconds: 900,
    dns_probe_name: 'infra-01.ohana.lan',
    sync_config_path: '/etc/ohana-agent/adguardhome-sync.yaml'}};
const editor = Object.assign({}, PluginsMethods, {
    value: id => ({'plugin-interval-seconds': '120', 'plugin-timeout': '3',
        'plugin-adguard-maximum-age': '600'})[id],
    checked: id => id === 'plugin-enabled',
});
const html = editor.pluginConfigurationFields(plugin);
assert.ok(html.includes('plugin-adguard-maximum-age'));
assert.ok(!html.includes('plugin-adguard-probe-name'));
assert.ok(html.includes('Délai API (secondes)'));
assert.ok(!html.includes('plugin-retries'));
const payload = editor.pluginConfigurationPayload(plugin);
assert.deepEqual(payload, {enabled: true, configuration: {
    interval_seconds: 120, timeout: 3, maximum_age_seconds: 600,
    sync_config_path: '/etc/ohana-agent/adguardhome-sync.yaml'}});
assert.equal(plugin.configuration.interval_seconds, 60);
assert.ok(editor.pluginConfigurationHint(plugin).includes('Shizune'));
""")


def test_zwave_editor_submits_optional_last_seen_alert_delays() -> None:
    run_module_script(r"""
import assert from 'node:assert/strict';
const {PluginsMethods} = await import(`${process.argv[1]}/configuration/plugins.js`);
globalThis.document = {createElement: () => ({textContent: '',
    get innerHTML() { return this.textContent
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('"', '&quot;'); }})};
const plugin = {id: 'zwave', enabled: true, configuration: {
    interval_seconds: 60, timeout: 3, retries: 1, verify_tls: true,
    last_seen_alert_minutes: 90, sleeping_last_seen_alert_minutes: null}};
const editor = (values) => Object.assign({}, PluginsMethods, {
    value: id => values[id] ?? '',
    checked: id => id !== 'plugin-zwave-verify-tls',
});
const html = editor({}).pluginConfigurationFields(plugin);
assert.ok(html.includes('plugin-zwave-last-seen-alert'));
assert.ok(html.includes('plugin-zwave-sleeping-last-seen-alert'));
assert.ok(html.includes('value="90"'));
const filled = editor({
    'plugin-interval-seconds': '60', 'plugin-timeout': '3',
    'plugin-retries': '1', 'plugin-zwave-last-seen-alert': '45',
    'plugin-zwave-sleeping-last-seen-alert': '1440',
}).pluginConfigurationPayload(plugin).configuration;
assert.equal(filled.last_seen_alert_minutes, 45);
assert.equal(filled.sleeping_last_seen_alert_minutes, 1440);
const cleared = editor({
    'plugin-interval-seconds': '60', 'plugin-timeout': '3',
    'plugin-retries': '1',
}).pluginConfigurationPayload(plugin).configuration;
assert.equal(cleared.last_seen_alert_minutes, null);
assert.equal(cleared.sleeping_last_seen_alert_minutes, null);
assert.equal(plugin.configuration.last_seen_alert_minutes, 90);
""")


def test_power_plug_editor_never_shows_or_drops_the_stored_token() -> None:
    run_module_script(r"""
import assert from 'node:assert/strict';
const {PluginsMethods} = await import(`${process.argv[1]}/configuration/plugins.js`);
const shared = await import(`${process.argv[1]}/configuration/shared.js`);
globalThis.document = {createElement: () => ({textContent: '',
    get innerHTML() { return this.textContent
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('"', '&quot;'); }})};
assert.ok(shared.PLUGIN_ICONS.power_plug.endsWith('plug.svg'));
const plugin = {id: 'power_plug', enabled: true, configuration: {
    home_assistant_url: 'http://192.168.1.20:8123', access_token: null,
    access_token_configured: true,
    switch_entity_id: 'switch.shellyplugsg3_80b54e297538',
    power_entity_id: null, verify_tls: true, boot_delay_seconds: 15,
    shutdown_grace_seconds: 300, idle_watts: 5, idle_confirm_seconds: 30,
    poll_seconds: 15}};
const editor = (values) => Object.assign({}, PluginsMethods, {
    value: id => values[id] ?? '',
    checked: id => id === 'plugin-enabled' || id === 'plugin-power-plug-verify-tls',
});
const html = editor({}).pluginConfigurationFields(plugin);
assert.ok(html.includes('plugin-power-plug-url'));
assert.ok(html.includes('plugin-power-plug-switch'));
assert.ok(html.includes('Un jeton est déjà enregistré'));
// the token field is never pre-filled, and no interval/retries noise
assert.ok(html.includes('id="plugin-power-plug-token" type="password" value=""'));
assert.ok(!html.includes('plugin-retries'));
assert.ok(!html.includes('plugin-interval-seconds'));
assert.equal(editor({}).pluginEnabledLabel(plugin), 'Prise pilotée par Ohana');
assert.ok(editor({}).pluginConfigurationHint(plugin).includes('surtensions'));
const saved = editor({
    'plugin-power-plug-url': ' http://192.168.1.21:8123 ',
    'plugin-power-plug-token': '',
    'plugin-power-plug-switch': 'switch.shellyplugsg3_80b54e297538',
    'plugin-power-plug-power': 'sensor.shellyplugsg3_80b54e297538_power',
    'plugin-power-plug-boot-delay': '20', 'plugin-power-plug-grace': '300',
    'plugin-power-plug-idle-watts': '4.5', 'plugin-power-plug-idle-confirm': '30',
    'plugin-power-plug-poll': '15',
}).pluginConfigurationPayload(plugin);
assert.deepEqual(saved, {enabled: true, configuration: {
    home_assistant_url: 'http://192.168.1.21:8123', access_token: null,
    switch_entity_id: 'switch.shellyplugsg3_80b54e297538',
    power_entity_id: 'sensor.shellyplugsg3_80b54e297538_power',
    verify_tls: true, boot_delay_seconds: 20, shutdown_grace_seconds: 300,
    idle_watts: 4.5, idle_confirm_seconds: 30, poll_seconds: 15}});
const typed = editor({'plugin-power-plug-token': 'new-token'})
    .pluginConfigurationPayload(plugin);
assert.equal(typed.configuration.access_token, 'new-token');
assert.ok(!('access_token_configured' in typed.configuration));
assert.equal(plugin.configuration.access_token_configured, true);
""")


def test_configuration_shared_validators() -> None:
    """Pure helpers keep their network and fingerprint rules."""
    run_module_script(r"""
import assert from 'node:assert/strict';
const shared = await import(`${process.argv[1]}/configuration/shared.js`);
assert(shared.isIpv4Address('192.168.1.254'));
assert(!shared.isIpv4Address('192.168.1.256'));
assert(!shared.isIpv4Address('192.168.1'));
assert(shared.isDnsHostname('infra-01.ohana.lan.'));
assert(!shared.isDnsHostname('infra_01.ohana.lan'));
assert(!shared.isDnsHostname('-infra.ohana.lan'));
assert.equal(shared.endpointTypeForAddress(' 10.0.0.1 '), 'ip');
assert.equal(shared.endpointTypeForAddress('ha-01.ohana.lan'), 'hostname');
assert.equal(shared.servicePortPolicy('mqtt').defaultPort, 1883);
assert.equal(shared.servicePortPolicy('unknown'), shared.SERVICE_PORT_POLICIES.other);
assert.equal(shared.formatTlsFingerprint('ab'.repeat(32)),
    Array(32).fill('AB').join(':'));
assert.equal(shared.formatTlsFingerprint('xyz'), 'Empreinte indisponible');
assert(shared.agentSupportsDistributedJobs('1.16.0'));
assert(shared.agentSupportsDistributedJobs('2.0'));
assert(!shared.agentSupportsDistributedJobs('1.15.9'));
assert(!shared.agentSupportsDistributedJobs(undefined));
assert.equal(
    shared.normalizePluginPresentation({id: 'shelly_telemetry', name: 'x'}).name,
    'Télémétrie Home Assistant');
""")


def test_adguard_capability_editor_masks_passwords_and_separates_activation():
    run_module_script(r"""
import assert from 'node:assert/strict';
const {AdGuardSyncMethods} = await import(
    `${process.argv[1]}/configuration/adguard.js`);
globalThis.document = {createElement: () => ({textContent: '',
    get innerHTML() {return this.textContent;}})};
const editor = Object.assign({adguardSync: {
    installed: true, active: false, enabled: false,
    origin: {url: 'http://192.168.1.11', username: 'admin', password_configured: true},
    replica: {url: 'http://192.168.1.12', username: 'admin',
        password_configured: true}},
    value: (id) => id.endsWith('password') ? '' : id.endsWith('url') ?
        'http://192.168.1.11' : 'admin'}, AdGuardSyncMethods);
const html = editor.adGuardCapabilityFields();
assert(html.includes('Activer la synchronisation'));
assert(html.includes('value="" placeholder="Déjà enregistré'));
assert(html.includes('La surveillance ci-dessous reste indépendante'));
assert.deepEqual(editor.adGuardAccessPayload().origin, {
    url: 'http://192.168.1.11', username: 'admin', password: ''});
editor.adguardSync.origin.username = 'admin" autofocus="';
assert(editor.adGuardCapabilityFields().includes('admin&quot; autofocus=&quot;'));
editor.adguardSync.active = true;
assert(editor.adGuardCapabilityFields().includes('Désactiver la synchronisation'));
assert(editor.adGuardCapabilityFields().includes('id="adguard-save-access" disabled'));
""")
