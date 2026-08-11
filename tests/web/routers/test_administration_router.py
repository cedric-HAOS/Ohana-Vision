"""Tests for Vision's Agent administration proxy."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from ohana_vision.administration import AgentAdministrationError
from ohana_vision.web import create_app


class FakeAdministrationClient:
    """Return deterministic administration documents."""

    def capabilities(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "operations": [
                "dhcp.read",
                "infrastructure.read",
            ],
        }

    def read_dhcp(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "server_node_id": "infra-01",
        }

    def read_network(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "interface": "eth0",
            "connection_name": "ohana-static",
            "method": "manual",
            "address": "192.168.1.10/24",
            "gateway": "192.168.1.1",
            "dns_servers": ["192.168.1.11", "192.168.1.12"],
            "active": True,
            "pending_change": None,
        }

    def write_network(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "transaction_id": "network-transaction",
            "expires_at": "2026-07-30T14:00:00+02:00",
            "state": {
                **self.read_network(),
                **payload["settings"],
            },
        }

    def confirm_network(self, transaction_id: str) -> dict[str, Any]:
        return {
            **self.read_network(),
            "confirmed_transaction_id": transaction_id,
        }

    def rollback_network(self, transaction_id: str) -> dict[str, Any]:
        return {
            **self.read_network(),
            "rolled_back_transaction_id": transaction_id,
        }

    def write_dhcp(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return payload

    def read_plugins(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "plugins": [
                {
                    "id": "dns",
                    "name": "DNS",
                }
            ],
        }

    def read_plugin(self, identifier: str) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "id": identifier,
        }

    def write_plugin(
        self,
        identifier: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": identifier,
            **payload,
        }

    def test_plugin(self, identifier: str) -> dict[str, Any]:
        return {
            "plugin_id": identifier,
            "success": True,
        }

    def connect_backup_icloud(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "configured": False,
            "requires_two_factor": True,
            "apple_id_received": payload.get("apple_id"),
        }

    def read_infrastructure(self) -> dict[str, Any]:
        return {
            "infrastructure": {
                "id": "ohana-house",
            },
        }

    def write_infrastructure(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return payload


def make_client(
    administration_client: Any = None,
) -> TestClient:
    return TestClient(
        create_app(
            administration_client=(administration_client),
        )
    )


def test_administration_routes_require_configured_agent() -> None:
    response = make_client().get("/api/administration/capabilities")

    assert response.status_code == 503


def test_administration_routes_proxy_agent_documents() -> None:
    client = make_client(FakeAdministrationClient())

    capabilities = client.get("/api/administration/capabilities")
    dhcp = client.get("/api/administration/dhcp")
    network = client.get("/api/administration/network")
    infrastructure = client.get("/api/administration/infrastructure")
    plugins = client.get("/api/administration/plugins")
    plugin = client.get("/api/administration/plugins/dns")

    assert capabilities.status_code == 200
    assert "dhcp.read" in capabilities.json()["operations"]
    assert dhcp.json()["server_node_id"] == "infra-01"
    assert network.json()["address"] == "192.168.1.10/24"
    assert network.json()["dns_servers"] == ["192.168.1.11", "192.168.1.12"]
    assert infrastructure.json()["infrastructure"]["id"] == "ohana-house"
    assert plugins.json()["plugins"][0]["id"] == "dns"
    assert plugin.json()["id"] == "dns"


def test_administration_routes_proxy_writes() -> None:
    client = make_client(FakeAdministrationClient())

    dhcp_response = client.put(
        "/api/administration/dhcp",
        json={"schema_version": 1},
    )
    network_response = client.put(
        "/api/administration/network",
        json={
            "schema_version": 1,
            "rollback_seconds": 90,
            "settings": {
                "interface": "eth0",
                "method": "manual",
                "address": "192.168.1.20/24",
                "gateway": "192.168.1.1",
                "dns_servers": ["192.168.1.11"],
            },
        },
    )
    network_confirm_response = client.post(
        "/api/administration/network/network-transaction/confirm",
    )
    network_rollback_response = client.post(
        "/api/administration/network/network-transaction/rollback",
    )
    infrastructure_response = client.put(
        "/api/administration/infrastructure",
        json={"nodes": []},
    )
    plugin_response = client.put(
        "/api/administration/plugins/dns",
        json={
            "enabled": False,
            "configuration": {},
        },
    )
    plugin_test_response = client.post(
        "/api/administration/plugins/dns/test",
    )
    icloud_response = client.post(
        "/api/administration/plugins/backup/icloud/connect",
        json={"apple_id": "user@example.com", "password": "secret"},
    )

    assert dhcp_response.json() == {"schema_version": 1}
    assert network_response.json()["transaction_id"] == "network-transaction"
    assert network_response.json()["state"]["address"] == "192.168.1.20/24"
    assert network_confirm_response.json()["confirmed_transaction_id"] == (
        "network-transaction"
    )
    assert network_rollback_response.json()["rolled_back_transaction_id"] == (
        "network-transaction"
    )
    assert infrastructure_response.json() == {"nodes": []}
    assert plugin_response.json()["id"] == "dns"
    assert plugin_response.json()["enabled"] is False
    assert plugin_test_response.json() == {
        "plugin_id": "dns",
        "success": True,
    }
    assert icloud_response.json() == {
        "configured": False,
        "requires_two_factor": True,
        "apple_id_received": "user@example.com",
    }


def test_administration_routes_translate_agent_errors() -> None:
    class FailingClient(FakeAdministrationClient):
        def read_dhcp(self) -> dict[str, Any]:
            raise AgentAdministrationError(
                "invalid DHCP configuration",
                status_code=422,
            )

    response = make_client(FailingClient()).get("/api/administration/dhcp")

    assert response.status_code == 422
    assert response.json()["detail"] == ("invalid DHCP configuration")
