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
    infrastructure = client.get("/api/administration/infrastructure")
    plugins = client.get("/api/administration/plugins")
    plugin = client.get("/api/administration/plugins/dns")

    assert capabilities.status_code == 200
    assert "dhcp.read" in capabilities.json()["operations"]
    assert dhcp.json()["server_node_id"] == "infra-01"
    assert infrastructure.json()["infrastructure"]["id"] == "ohana-house"
    assert plugins.json()["plugins"][0]["id"] == "dns"
    assert plugin.json()["id"] == "dns"


def test_administration_routes_proxy_writes() -> None:
    client = make_client(FakeAdministrationClient())

    dhcp_response = client.put(
        "/api/administration/dhcp",
        json={"schema_version": 1},
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

    assert dhcp_response.json() == {"schema_version": 1}
    assert infrastructure_response.json() == {"nodes": []}
    assert plugin_response.json()["id"] == "dns"
    assert plugin_response.json()["enabled"] is False
    assert plugin_test_response.json() == {
        "plugin_id": "dns",
        "success": True,
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
