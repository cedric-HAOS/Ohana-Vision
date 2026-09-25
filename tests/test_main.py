"""Tests for the Ohana-Vision command-line entry point."""

from pathlib import Path
from unittest.mock import Mock

import pytest

from ohana_vision import __version__
from ohana_vision.configuration import (
    ApplicationConfiguration,
    Environment,
    ServerConfiguration,
)
from ohana_vision.main import (
    APPLICATION_VERSION,
    DEFAULT_CONFIGURATION_PATH,
    configure_logging,
    main,
    parse_arguments,
    run,
)


def test_cli_uses_package_version() -> None:
    assert __version__ == APPLICATION_VERSION


def test_parse_arguments_uses_default_configuration() -> None:
    """The CLI must expose the default configuration path."""
    arguments = parse_arguments([])

    assert arguments.config == DEFAULT_CONFIGURATION_PATH


def test_parse_arguments_accepts_configuration_path() -> None:
    """The CLI must accept a custom configuration path."""
    arguments = parse_arguments(
        [
            "--config",
            "custom/vision.yaml",
        ]
    )

    assert arguments.config == Path("custom/vision.yaml")


def test_parse_arguments_rejects_unknown_argument() -> None:
    """Unknown command-line arguments must be rejected."""
    with pytest.raises(SystemExit) as error:
        parse_arguments(["--unknown"])

    assert error.value.code == 2


def test_configure_logging_accepts_known_level() -> None:
    """Logging configuration must accept a valid level."""
    configure_logging("warning")


def test_run_loads_configuration_and_starts_uvicorn(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The runner must build and serve the configured application."""
    configuration_path = tmp_path / "vision.yaml"
    configuration_path.write_text(
        """
name: Packaged Vision
environment: production
debug: false

server:
  host: 0.0.0.0
  port: 8080
  log_level: warning

web:
  documentation_enabled: false
""",
        encoding="utf-8",
    )

    application = object()
    build_application_mock = Mock(
        return_value=application,
    )
    uvicorn_run_mock = Mock()

    monkeypatch.setattr(
        "ohana_vision.main.build_application",
        build_application_mock,
    )
    monkeypatch.setattr(
        "ohana_vision.main.uvicorn.run",
        uvicorn_run_mock,
    )

    result = run(configuration_path)

    assert result == 0

    build_application_mock.assert_called_once()

    supplied_configuration = build_application_mock.call_args.kwargs["configuration"]

    assert supplied_configuration.name == "Packaged Vision"
    assert supplied_configuration.environment is Environment.PRODUCTION
    assert supplied_configuration.server.host == "0.0.0.0"
    assert supplied_configuration.server.port == 8080

    uvicorn_run_mock.assert_called_once_with(
        application,
        host="0.0.0.0",
        port=8080,
        log_level="warning",
        access_log=False,
    )


def test_run_returns_error_for_missing_configuration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A missing configuration must prevent server startup."""
    build_application_mock = Mock()
    uvicorn_run_mock = Mock()

    monkeypatch.setattr(
        "ohana_vision.main.build_application",
        build_application_mock,
    )
    monkeypatch.setattr(
        "ohana_vision.main.uvicorn.run",
        uvicorn_run_mock,
    )

    result = run(
        tmp_path / "missing.yaml",
    )

    assert result == 1
    build_application_mock.assert_not_called()
    uvicorn_run_mock.assert_not_called()


def test_main_forwards_configuration_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The main function must forward the selected configuration."""
    run_mock = Mock(
        return_value=0,
    )

    monkeypatch.setattr(
        "ohana_vision.main.run",
        run_mock,
    )

    result = main(
        [
            "--config",
            "config/production.yaml",
        ]
    )

    assert result == 0
    run_mock.assert_called_once_with(
        configuration_path=Path("config/production.yaml"),
    )


def test_run_passes_configuration_to_application(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The loaded configuration must reach the application factory."""
    configuration_path = tmp_path / "vision.yaml"
    configuration_path.write_text(
        """
environment: test

server:
  host: 127.0.0.1
  port: 9000
  log_level: info
""",
        encoding="utf-8",
    )

    captured_configuration: ApplicationConfiguration | None = None

    def capture_application(
        *,
        configuration: ApplicationConfiguration,
    ) -> object:
        nonlocal captured_configuration
        captured_configuration = configuration
        return object()

    monkeypatch.setattr(
        "ohana_vision.main.build_application",
        capture_application,
    )
    monkeypatch.setattr(
        "ohana_vision.main.uvicorn.run",
        Mock(),
    )

    result = run(configuration_path)

    assert result == 0
    assert captured_configuration is not None
    assert captured_configuration.environment is Environment.TEST
    assert captured_configuration.server == ServerConfiguration(
        host="127.0.0.1",
        port=9000,
        log_level="info",
    )


def test_pyproject_declares_console_entry_point() -> None:
    """The package must install the ohana-vision command."""
    pyproject = Path("pyproject.toml").read_text(
        encoding="utf-8",
    )

    assert "[project.scripts]" in pyproject
    assert 'ohana-vision = "ohana_vision.main:main"' in pyproject
