"""Tests for the Ohana-Vision application configuration."""

import pytest
from pydantic import ValidationError

from ohana_vision.configuration import (
    ApplicationConfiguration,
    Environment,
)


def test_application_configuration_has_safe_defaults() -> None:
    """Default configuration must be suitable for development."""
    configuration = ApplicationConfiguration()

    assert configuration.name == "Ohana Vision"
    assert configuration.environment is Environment.DEVELOPMENT
    assert configuration.debug is False
    assert configuration.server.host == "127.0.0.1"
    assert configuration.server.port == 8000
    assert configuration.server.log_level == "info"
    assert configuration.web.documentation_enabled is True
    assert configuration.storage.database_path is None
    assert configuration.agent.companion_enabled is False
    assert str(configuration.agent.companion_url) == (
        "https://infra-01.ohana.lan:8767/"
    )
    assert configuration.agent.companion_ca_file.as_posix() == (
        "/etc/ohana-vision/companion-ca.crt"
    )


def test_application_configuration_is_immutable() -> None:
    """Application configuration must not change at runtime."""
    configuration = ApplicationConfiguration()

    with pytest.raises(ValidationError):
        configuration.debug = True


def test_application_configuration_rejects_unknown_fields() -> None:
    """Unknown configuration properties must be rejected."""
    with pytest.raises(ValidationError):
        ApplicationConfiguration.model_validate(
            {
                "unknown": "value",
            }
        )


def test_production_configuration_rejects_debug_mode() -> None:
    """Production must never start with debug enabled."""
    with pytest.raises(
        ValidationError,
        match="Debug mode cannot be enabled in production",
    ):
        ApplicationConfiguration(
            environment=Environment.PRODUCTION,
            debug=True,
        )


def test_production_configuration_accepts_disabled_debug() -> None:
    """Production must accept a safe debug configuration."""
    configuration = ApplicationConfiguration(
        environment=Environment.PRODUCTION,
        debug=False,
    )

    assert configuration.environment is Environment.PRODUCTION
    assert configuration.debug is False
