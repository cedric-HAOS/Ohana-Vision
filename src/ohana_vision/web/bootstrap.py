"""Application composition for Ohana-Vision."""

from pathlib import Path

from fastapi import FastAPI

from ohana_vision.administration import AgentAdministrationClient, AgentCompanionClient
from ohana_vision.configuration import (
    ApplicationConfiguration,
    ConfigurationLoader,
    Environment,
)
from ohana_vision.domain import IncidentStore, ObservationStore
from ohana_vision.runtime import BackendRuntime, ObservationProcessor
from ohana_vision.timeline import TimelineEngine
from ohana_vision.web.app import create_app
from ohana_vision.web.application_context import ApplicationContext

DEFAULT_PRODUCTION_DATABASE_PATH = Path("/var/lib/ohana-vision/vision.db")


def build_application_context(
    *,
    database_path: Path | None = None,
    retention_days: int | None = None,
    purge_interval_seconds: int = 3600,
    history_max_rows: int = 50_000,
) -> ApplicationContext:
    """Build the default Ohana-Vision application context."""
    runtime = BackendRuntime()
    observation_store = ObservationStore(
        database_path=database_path,
        retention_days=retention_days,
        purge_interval_seconds=purge_interval_seconds,
        history_max_rows=history_max_rows,
    )
    incident_store = IncidentStore(database_path=database_path)
    if database_path is None:
        incident_store.rebuild(observation_store.observations)
    else:
        while recovery_batch := observation_store.unprocessed_for_incidents():
            incident_store.rebuild(recovery_batch)
    timeline_engine = TimelineEngine()
    observation_processor = ObservationProcessor(
        runtime=runtime,
        observation_store=observation_store,
        incident_store=incident_store,
        timeline_engine=timeline_engine,
    )

    runtime.start()

    return ApplicationContext(
        runtime=runtime,
        observation_store=observation_store,
        incident_store=incident_store,
        timeline_engine=timeline_engine,
        observation_processor=observation_processor,
    )


def build_application(
    *,
    configuration_path: Path | None = None,
    configuration: ApplicationConfiguration | None = None,
) -> FastAPI:
    """Build the fully configured Ohana-Vision application."""
    if configuration is not None and configuration_path is not None:
        raise ValueError(
            "Configuration and configuration_path cannot be provided together."
        )

    if configuration is not None:
        resolved_configuration = configuration
    elif configuration_path is not None:
        resolved_configuration = ConfigurationLoader.load(configuration_path)
    else:
        resolved_configuration = ApplicationConfiguration()

    database_path = resolved_configuration.storage.database_path
    if (
        database_path is None
        and resolved_configuration.environment is Environment.PRODUCTION
    ):
        database_path = DEFAULT_PRODUCTION_DATABASE_PATH

    context = build_application_context(
        database_path=database_path,
        retention_days=resolved_configuration.storage.retention_days,
        purge_interval_seconds=(resolved_configuration.storage.purge_interval_seconds),
        history_max_rows=resolved_configuration.storage.history_max_rows,
    )
    administration_client = None
    companion_client = None

    if resolved_configuration.agent.administration_enabled:
        administration_client = AgentAdministrationClient(
            base_url=str(resolved_configuration.agent.administration_url),
            token_file=resolved_configuration.agent.token_file,
            timeout_seconds=(resolved_configuration.agent.timeout_seconds),
        )

    if resolved_configuration.agent.companion_enabled:
        companion_client = AgentCompanionClient(
            base_url=str(resolved_configuration.agent.companion_url),
            ca_certificate_file=resolved_configuration.agent.companion_ca_file,
            timeout_seconds=resolved_configuration.agent.timeout_seconds,
        )

    return create_app(
        context=context,
        configuration=resolved_configuration,
        administration_client=administration_client,
        companion_client=companion_client,
    )


app = build_application()
