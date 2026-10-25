"""Vision reports its own resident memory so the Agent can name what grows."""

from __future__ import annotations

from pathlib import Path

import pytest

from ohana_vision.runtime.process_memory import process_rss_bytes


def test_resident_memory_is_read_from_the_kernel_status(tmp_path: Path) -> None:
    status = tmp_path / "status"
    status.write_text("Name:\tpython3\nVmRSS:\t  90496 kB\n")

    assert process_rss_bytes(status) == 90496 * 1024


@pytest.mark.parametrize("content", ["Name:\tx\n", "VmRSS: lots kB\n", ""])
def test_a_status_without_a_usable_value_gives_nothing(tmp_path, content) -> None:
    status = tmp_path / "status"
    status.write_text(content)

    assert process_rss_bytes(status) is None
    assert process_rss_bytes(tmp_path / "missing") is None


def test_the_runtime_vitals_carry_the_process_memory(monkeypatch) -> None:
    from ohana_vision.runtime import BackendRuntime, backend_runtime

    monkeypatch.setattr(backend_runtime, "process_rss_bytes", lambda: 94_000_000)

    assert BackendRuntime().vitals()["process"] == {"rss_bytes": 94_000_000}
