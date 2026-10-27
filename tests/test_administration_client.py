"""Tests for Vision's Agent administration client."""

from io import BytesIO
from pathlib import Path
from typing import Any

from ohana_vision.administration.client import AgentAdministrationClient


def test_backup_operations_allow_slow_cold_icloud_startup(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    token_path = tmp_path / "administration.token"
    token_path.write_text("secret", encoding="utf-8")
    calls: list[tuple[str, float]] = []

    def fake_urlopen(request: Any, *, timeout: float) -> BytesIO:
        calls.append((request.full_url, timeout))
        return BytesIO(b"{}")

    monkeypatch.setattr(
        "ohana_vision.administration.client.urlopen",
        fake_urlopen,
    )
    client = AgentAdministrationClient(
        base_url="http://127.0.0.1:8765",
        token_file=token_path,
        timeout_seconds=10.0,
    )

    client.test_plugin("backup")
    client.connect_backup_icloud({"apple_id": "user@example.com"})
    client.test_plugin("dns")
    client.run_backup("ha-01")
    client.read_worker_pairings()
    client.read_workers()
    client.read_wake_on_lan()
    client.wake_worker("katsuyu bubule")
    client.read_companion_pairings()
    client.read_companions()
    client.read_tsunade_incidents("all")
    client.read_tsunade_incident("incident id")
    client.diagnose_tsunade_incident("incident id")
    client.request_tsunade_log_check()
    client.read_tsunade_log_policy()
    client.write_tsunade_log_policy({"enabled": True})
    client.read_job("job id")
    client.request_tsunade_log_investigation("incident id", {"pattern": "Node 17"})
    client.extend_tsunade_log_investigation("incident id", {"source": "vision"})
    client.propose_tsunade_repair("incident id", {"operation": "restart_service"})
    client.authorize_tsunade_repair("incident id", {"repair_id": "repair id"})
    client.refuse_tsunade_repair("incident id", {"repair_id": "repair id"})
    client.defer_tsunade_repair("incident id", {"repair_id": "repair id"})
    client.confirm_tsunade_experience("incident id", {"confirm": True})
    client.approve_worker_pairing("pairing id")
    client.reject_worker_pairing("pairing id")
    client.approve_companion_pairing("pairing id")
    client.reject_companion_pairing("pairing id")
    client.revoke_companion("iphone id")

    assert calls == [
        ("http://127.0.0.1:8765/v1/plugins/backup/test", 60.0),
        ("http://127.0.0.1:8765/v1/plugins/backup/icloud/connect", 60.0),
        ("http://127.0.0.1:8765/v1/plugins/dns/test", 10.0),
        (
            "http://127.0.0.1:8765/v1/plugins/backup/targets/ha-01/run",
            10.0,
        ),
        ("http://127.0.0.1:8765/v1/jobs/workers/pairings", 10.0),
        ("http://127.0.0.1:8765/v1/jobs/workers", 10.0),
        ("http://127.0.0.1:8765/v1/jobs/wake-on-lan", 10.0),
        (
            "http://127.0.0.1:8765/v1/jobs/workers/katsuyu%20bubule/wake",
            10.0,
        ),
        ("http://127.0.0.1:8765/v1/pairings/companions", 10.0),
        ("http://127.0.0.1:8765/v1/companions", 10.0),
        ("http://127.0.0.1:8765/v1/incidents/all", 10.0),
        ("http://127.0.0.1:8765/v1/incidents/incident%20id", 10.0),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/diagnose",
            60.0,
        ),
        ("http://127.0.0.1:8765/v1/incidents/logs/check", 10.0),
        ("http://127.0.0.1:8765/v1/incidents/logs", 10.0),
        ("http://127.0.0.1:8765/v1/incidents/logs", 10.0),
        ("http://127.0.0.1:8765/v1/jobs/job%20id", 10.0),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/logs/investigate",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/logs/investigate/extend",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/repairs",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/repairs/authorize",
            60.0,
        ),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/repairs/refuse",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/repairs/defer",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/incidents/incident%20id/experience",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/jobs/workers/pairings/pairing%20id/approve",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/jobs/workers/pairings/pairing%20id/reject",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/pairings/companions/pairing%20id/approve",
            10.0,
        ),
        (
            "http://127.0.0.1:8765/v1/pairings/companions/pairing%20id/reject",
            10.0,
        ),
        ("http://127.0.0.1:8765/v1/companions/iphone%20id/revoke", 10.0),
    ]


def test_adguard_management_uses_bounded_timeouts_and_fixed_paths(
    tmp_path, monkeypatch
):
    token_path = tmp_path / "token"
    token_path.write_text("secret")
    calls = []

    def respond(request, *, timeout):
        calls.append((request.method, request.full_url, timeout))
        return BytesIO(b"{}")

    monkeypatch.setattr("ohana_vision.administration.client.urlopen", respond)
    client = AgentAdministrationClient(
        base_url="http://127.0.0.1:8765", token_file=token_path, timeout_seconds=10
    )
    client.read_adguard_sync()
    client.write_adguard_sync({"origin": {}, "replica": {}})
    client.activate_adguard_sync(True)
    assert calls == [
        ("GET", "http://127.0.0.1:8765/v1/system/adguard-sync", 10),
        ("PUT", "http://127.0.0.1:8765/v1/system/adguard-sync", 40),
        ("PUT", "http://127.0.0.1:8765/v1/system/adguard-sync/activation", 130),
    ]
