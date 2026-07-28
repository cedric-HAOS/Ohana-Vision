"""Connection settings for the Ohana-Agent administration API."""

from pathlib import Path

from pydantic import AnyHttpUrl, Field, PositiveFloat

from ohana_vision.configuration.base import ConfigurationModel


class AgentConfiguration(ConfigurationModel):
    """Authenticated administration connection to Ohana-Agent."""

    administration_enabled: bool = False
    administration_url: AnyHttpUrl = Field(default=AnyHttpUrl("http://127.0.0.1:8765"))
    token_file: Path = Path("/etc/ohana-vision/management.token")
    timeout_seconds: PositiveFloat = 10.0
