"""Command-line entry point for Ohana-Vision."""

from __future__ import annotations

import argparse
import logging
from collections.abc import Sequence
from pathlib import Path

import uvicorn

from ohana_vision import __version__
from ohana_vision.configuration import (
    ConfigurationError,
    ConfigurationLoader,
)
from ohana_vision.web.bootstrap import build_application

APPLICATION_VERSION = __version__

DEFAULT_CONFIGURATION_PATH = Path("config/vision.yaml")

LOGGER = logging.getLogger(__name__)


def create_argument_parser() -> argparse.ArgumentParser:
    """Create the Ohana-Vision command-line argument parser."""
    parser = argparse.ArgumentParser(
        prog="ohana-vision",
        description="Run Ohana-Vision.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIGURATION_PATH,
        help=(
            f"Application configuration file (default: {DEFAULT_CONFIGURATION_PATH})."
        ),
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {APPLICATION_VERSION}",
    )

    return parser


def parse_arguments(
    arguments: Sequence[str] | None = None,
) -> argparse.Namespace:
    """Parse Ohana-Vision command-line arguments."""
    parser = create_argument_parser()
    return parser.parse_args(arguments)


def configure_logging(level: str) -> None:
    """Configure console logging for production execution."""
    resolved_level = getattr(
        logging,
        level.upper(),
        logging.INFO,
    )

    logging.basicConfig(
        level=resolved_level,
        format=("%(asctime)s %(levelname)s %(name)s — %(message)s"),
    )


def run(
    configuration_path: Path,
) -> int:
    """Load the configuration and run Ohana-Vision."""
    try:
        configuration = ConfigurationLoader.load(configuration_path)
    except ConfigurationError as error:
        logging.basicConfig(
            level=logging.ERROR,
            format=("%(asctime)s %(levelname)s %(name)s — %(message)s"),
        )
        LOGGER.error("%s", error)
        return 1

    configure_logging(configuration.server.log_level)

    LOGGER.info(
        "Starting %s in %s mode",
        configuration.name,
        configuration.environment.value,
    )
    LOGGER.info(
        "Listening on %s:%s",
        configuration.server.host,
        configuration.server.port,
    )

    application = build_application(
        configuration=configuration,
    )

    uvicorn.run(
        application,
        host=configuration.server.host,
        port=configuration.server.port,
        log_level=configuration.server.log_level.lower(),
        # Every Agent observation export and UI refresh was an INFO line in
        # the INFRA-01 journal; refused and failed requests are logged by the
        # application middleware instead.
        access_log=False,
    )

    return 0


def main(
    arguments: Sequence[str] | None = None,
) -> int:
    """Run the Ohana-Vision command-line application."""
    parsed_arguments = parse_arguments(arguments)

    return run(
        configuration_path=parsed_arguments.config,
    )


if __name__ == "__main__":
    raise SystemExit(main())
