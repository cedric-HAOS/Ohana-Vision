"""Ohana-Vision application package."""

import tomllib
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path


def _source_version() -> str:
    """Read the project version when running directly from a source checkout."""
    pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"

    try:
        project = tomllib.loads(pyproject.read_text(encoding="utf-8"))["project"]
        value = project["version"]
    except (FileNotFoundError, KeyError, TypeError, tomllib.TOMLDecodeError):
        return "unknown"

    return value if isinstance(value, str) and value else "unknown"


def get_application_version() -> str:
    """Return the installed package version or the source project version."""
    try:
        return version("ohana-vision")
    except PackageNotFoundError:
        return _source_version()


__version__ = get_application_version()

__all__ = [
    "__version__",
    "get_application_version",
]
