"""Persistent storage configuration for Ohana-Vision."""

from pathlib import Path

from ohana_vision.configuration.base import ConfigurationModel


class StorageConfiguration(ConfigurationModel):
    """Configure the durable local Vision database."""

    database_path: Path | None = None
