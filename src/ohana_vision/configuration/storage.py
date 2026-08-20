"""Persistent storage configuration for Ohana-Vision."""

from pathlib import Path

from pydantic import Field

from ohana_vision.configuration.base import ConfigurationModel


class StorageConfiguration(ConfigurationModel):
    """Configure the durable local Vision database."""

    database_path: Path | None = None
    retention_days: int = Field(default=2, ge=1, le=365)
    purge_interval_seconds: int = Field(default=3600, ge=60, le=86_400)
    history_max_rows: int = Field(default=50_000, ge=100, le=250_000)
