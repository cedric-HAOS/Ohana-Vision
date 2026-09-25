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
