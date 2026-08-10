"""Tests for the Ohana-Vision configuration loader."""

from pathlib import Path

import pytest

from ohana_vision.configuration import (
    ConfigurationError,
    ConfigurationLoader,
    Environment,
)


def write_configuration(
    path: Path,
    content: str,
) -> Path:
    """Write a temporary YAML configuration."""
    path.write_text(
        content,
        encoding="utf-8",
    )
    return path


def test_loader_reads_yaml_configuration(
    tmp_path: Path,
) -> None:
    """The loader must read and validate a YAML file."""
    path = write_configuration(
        tmp_path / "vision.yaml",
        """
name: Production Vision
environment: production
debug: false

server:
  host: 0.0.0.0
  port: 8080
  log_level: warning

web:
  documentation_enabled: false

storage:
  database_path: /var/lib/ohana-vision/vision.db
""",
    )

    configuration = ConfigurationLoader.load(path)

    assert configuration.name == "Production Vision"
    assert configuration.environment is Environment.PRODUCTION
    assert configuration.debug is False
    assert configuration.server.host == "0.0.0.0"
    assert configuration.server.port == 8080
    assert configuration.server.log_level == "warning"
    assert configuration.web.documentation_enabled is False
    assert configuration.storage.database_path == Path(
        "/var/lib/ohana-vision/vision.db"
    )


def test_loader_reads_development_administration_profile() -> None:
    configuration = ConfigurationLoader.load(Path("config/vision.development.yaml"))

    assert configuration.agent.administration_enabled is True
    assert str(configuration.agent.administration_url) == ("http://127.0.0.1:8765/")
    assert configuration.agent.token_file == Path(
        "../Ohana-Agent/config/management.development.token"
    )


def test_loader_accepts_empty_configuration(
    tmp_path: Path,
) -> None:
    """An empty YAML file must use configuration defaults."""
    path = write_configuration(
        tmp_path / "vision.yaml",
        "",
    )

    configuration = ConfigurationLoader.load(path)

    assert configuration.name == "Ohana Vision"
    assert configuration.environment is Environment.DEVELOPMENT


def test_loader_rejects_missing_file(
    tmp_path: Path,
) -> None:
    """The loader must report a missing configuration file."""
    path = tmp_path / "missing.yaml"

    with pytest.raises(
        ConfigurationError,
        match="Configuration file does not exist",
    ):
        ConfigurationLoader.load(path)


def test_loader_rejects_invalid_yaml(
    tmp_path: Path,
) -> None:
    """The loader must reject syntactically invalid YAML."""
    path = write_configuration(
        tmp_path / "vision.yaml",
        "server: [",
    )

    with pytest.raises(
        ConfigurationError,
        match="Invalid YAML configuration",
    ):
        ConfigurationLoader.load(path)


def test_loader_rejects_non_mapping_root(
    tmp_path: Path,
) -> None:
    """The YAML root must be an object."""
    path = write_configuration(
        tmp_path / "vision.yaml",
        "- development\n- production\n",
    )

    with pytest.raises(
        ConfigurationError,
        match="configuration root must be a mapping",
    ):
        ConfigurationLoader.load(path)


def test_loader_rejects_invalid_configuration(
    tmp_path: Path,
) -> None:
    """The loader must wrap model validation failures."""
    path = write_configuration(
        tmp_path / "vision.yaml",
        """
environment: production
debug: true
""",
    )

    with pytest.raises(
        ConfigurationError,
        match="Invalid application configuration",
    ):
        ConfigurationLoader.load(path)
