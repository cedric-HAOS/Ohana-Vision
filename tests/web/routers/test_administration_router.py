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

    def run_backup(self, target_id: str) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "target_id": target_id,
            "status": "accepted",
        }

    def read_worker_pairings(self) -> dict[str, Any]:
        return {
            "protocol_version": 1,
            "pairings": [
                {
                    "pairing_id": "11111111-1111-4111-8111-111111111111",
                    "worker_id": "katsuyu-bubule",
                    "verification_code": "ABCD-2345",
                    "status": "PENDING",
                }
            ],
        }

    def read_workers(self) -> dict[str, Any]:
        return {
            "protocol_version": 1,
            "workers": [
                {
                    "worker_id": "katsuyu-bubule",
                    "availability": "WAKING",
                    "woken_by_ohana": True,
                }
            ],
        }

    def read_companion_pairings(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "pairings": [
                {
                    "pairing_id": "33333333-3333-4333-8333-333333333333",
                    "device_name": "iPhone de Cédric",
                    "verification_code": "OHANA-24",
                    "status": "PENDING",
                }
            ],
        }

    def read_companions(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "devices": [
                {
                    "device_id": "44444444-4444-4444-8444-444444444444",
                    "device_name": "iPhone de Cédric",
                    "status": "ACTIVE",
                }
            ],
        }

    def read_tsunade_incidents(self, state: str = "all") -> dict[str, Any]:
        return {
            "schema_version": 1,
            "state": state,
            "incidents": [
                {
                    "incident_id": "11111111-1111-4111-8111-111111111111",
                    "workflow_state": "in_progress",
                }
            ],
        }

    def read_tsunade_incident(self, incident_id: str) -> dict[str, Any]:
        return {"incident_id": incident_id, "events": []}

    def diagnose_tsunade_incident(self, incident_id: str) -> dict[str, Any]:
        return {"incident_id": incident_id, "status": "AI_QUEUED"}

    def request_tsunade_log_check(self) -> dict[str, Any]:
        return {"type": "logs.health_check", "status": "QUEUED"}

    def request_tsunade_log_investigation(
        self, incident_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            "incident_id": incident_id,
            "type": "logs.investigate",
            "status": "QUEUED",
            "parameters": payload,
        }

    def propose_tsunade_repair(
        self, incident_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return {"incident_id": incident_id, "status": "proposed", **payload}

    def authorize_tsunade_repair(
        self, incident_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return {"incident_id": incident_id, "status": "verifying", **payload}

    def confirm_tsunade_experience(
        self, incident_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return {"incident_id": incident_id, "success_count": 1, **payload}

    def approve_worker_pairing(self, pairing_id: str) -> dict[str, Any]:
        return {"pairing_id": pairing_id, "status": "APPROVED"}

    def reject_worker_pairing(self, pairing_id: str) -> dict[str, Any]:
        return {"pairing_id": pairing_id, "status": "REJECTED"}

    def approve_companion_pairing(self, pairing_id: str) -> dict[str, Any]:
        return {"pairing_id": pairing_id, "status": "APPROVED"}

    def reject_companion_pairing(self, pairing_id: str) -> dict[str, Any]:
        return {"pairing_id": pairing_id, "status": "REJECTED"}

    def revoke_companion(self, device_id: str) -> dict[str, Any]:
        return {"device_id": device_id, "status": "REVOKED"}

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
    pairings = client.get("/api/administration/workers/pairings")
    workers = client.get("/api/administration/workers")
    companion_pairings = client.get("/api/administration/companions/pairings")
    companions = client.get("/api/administration/companions")
    incidents = client.get("/api/administration/tsunade/incidents?state=all")
    incident = client.get(
        "/api/administration/tsunade/incidents/11111111-1111-4111-8111-111111111111"
    )
    diagnosis = client.post(
        "/api/administration/tsunade/incidents/"
        "11111111-1111-4111-8111-111111111111/diagnose"
    )
    log_check = client.post("/api/administration/tsunade/incidents/logs/check")
    log_investigation = client.post(
        "/api/administration/tsunade/incidents/"
        "11111111-1111-4111-8111-111111111111/logs/investigate",
        json={"pattern": "Node 17"},
    )
    repair_proposal = client.post(
        "/api/administration/tsunade/incidents/"
        "11111111-1111-4111-8111-111111111111/repairs",
        json={"operation": "restart_service"},
    )
    repair_authorization = client.post(
        "/api/administration/tsunade/incidents/"
        "11111111-1111-4111-8111-111111111111/repairs/authorize",
        json={"repair_id": "22222222-2222-4222-8222-222222222222"},
    )
    experience = client.post(
        "/api/administration/tsunade/incidents/"
        "11111111-1111-4111-8111-111111111111/experience",
        json={"confirm": True},
    )

    assert capabilities.status_code == 200
    assert "dhcp.read" in capabilities.json()["operations"]
    assert dhcp.json()["server_node_id"] == "infra-01"
    assert network.json()["address"] == "192.168.1.10/24"
    assert network.json()["dns_servers"] == ["192.168.1.11", "192.168.1.12"]
    assert infrastructure.json()["infrastructure"]["id"] == "ohana-house"
    assert plugins.json()["plugins"][0]["id"] == "dns"
    assert plugin.json()["id"] == "dns"
    assert pairings.json()["pairings"][0]["worker_id"] == "katsuyu-bubule"
    assert workers.json()["workers"][0]["availability"] == "WAKING"
    assert companion_pairings.json()["pairings"][0]["verification_code"] == ("OHANA-24")
    assert companions.json()["devices"][0]["status"] == "ACTIVE"
    assert incidents.json()["incidents"][0]["workflow_state"] == "in_progress"
    assert incident.json()["events"] == []
    assert diagnosis.json()["status"] == "AI_QUEUED"
    assert log_check.json()["type"] == "logs.health_check"
    assert log_investigation.json()["parameters"]["pattern"] == "Node 17"
    assert repair_proposal.json()["status"] == "proposed"
    assert repair_authorization.json()["status"] == "verifying"
    assert experience.json()["success_count"] == 1


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
    backup_response = client.post(
        "/api/administration/plugins/backup/targets/ha-01/run",
    )
    pairing_id = "11111111-1111-4111-8111-111111111111"
    pairing_approved = client.post(
        f"/api/administration/workers/pairings/{pairing_id}/approve"
    )
    pairing_rejected = client.post(
        f"/api/administration/workers/pairings/{pairing_id}/reject"
    )
    companion_pairing_id = "33333333-3333-4333-8333-333333333333"
    companion_pairing_approved = client.post(
        f"/api/administration/companions/pairings/{companion_pairing_id}/approve"
    )
    companion_pairing_rejected = client.post(
        f"/api/administration/companions/pairings/{companion_pairing_id}/reject"
    )
    companion_revoked = client.post(
        "/api/administration/companions/44444444-4444-4444-8444-444444444444/revoke"
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
    assert backup_response.json() == {
        "schema_version": 1,
        "target_id": "ha-01",
        "status": "accepted",
    }
    assert pairing_approved.json()["status"] == "APPROVED"
    assert pairing_rejected.json()["status"] == "REJECTED"
    assert companion_pairing_approved.json()["status"] == "APPROVED"
    assert companion_pairing_rejected.json()["status"] == "REJECTED"
    assert companion_revoked.json()["status"] == "REVOKED"


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
