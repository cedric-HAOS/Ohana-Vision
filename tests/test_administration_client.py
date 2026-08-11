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

    assert calls == [
        ("http://127.0.0.1:8765/v1/plugins/backup/test", 60.0),
        ("http://127.0.0.1:8765/v1/plugins/backup/icloud/connect", 60.0),
        ("http://127.0.0.1:8765/v1/plugins/dns/test", 10.0),
        (
            "http://127.0.0.1:8765/v1/plugins/backup/targets/ha-01/run",
            10.0,
        ),
    ]
