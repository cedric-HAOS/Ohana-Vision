"""SQLite-backed lifecycle store for capability incidents."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from threading import RLock
from uuid import UUID, uuid4

from ohana_vision.domain.health import HealthStatus
from ohana_vision.domain.incident import Incident, IncidentTransition
from ohana_vision.domain.observation import Observation

INCIDENT_STATUSES = {
    HealthStatus.STALE,
    HealthStatus.DEGRADED,
    HealthStatus.UNAVAILABLE,
}


class IncidentNotFoundError(LookupError):
    """Raised when an incident identifier is unknown."""


class IncidentStore:
    """Persist incident transitions, acknowledgements and silences."""

    def __init__(self, database_path: Path | str | None = None) -> None:
        self.database_path = Path(database_path) if database_path is not None else None
        if self.database_path is not None:
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._connection = sqlite3.connect(
            self.database_path if self.database_path is not None else ":memory:",
            check_same_thread=False,
        )
        self._connection.row_factory = sqlite3.Row
        self._closed = False
        self._initialize_database()

    @property
    def incident_count(self) -> int:
        """Return the total number of recorded incidents."""
        with self._lock:
            row = self._connection.execute(
                "SELECT COUNT(*) AS count FROM incidents"
            ).fetchone()
            return int(row["count"])

    def process(self, observation: Observation) -> IncidentTransition | None:
        """Open, update or resolve an incident from one observation."""
        with self._lock:
            if self._was_processed(observation.observation_id):
                return None

            try:
                transition = self._apply(observation)
                self._record_processed(observation.observation_id)
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

            return transition

    def rebuild(self, observations: Iterable[Observation]) -> None:
        """Replay observations not yet reflected in persistent incidents."""
        for observation in sorted(
            observations,
            key=lambda item: (item.observed_at, str(item.observation_id)),
        ):
            self.process(observation)

    def list(
        self,
        *,
        state: str = "active",
        limit: int = 100,
    ) -> tuple[Incident, ...]:
        """Return incidents in reverse chronological order."""
        if state not in {"active", "resolved", "all"}:
            raise ValueError("state must be active, resolved, or all.")
        if limit <= 0:
            raise ValueError("limit must be greater than zero.")

        condition = {
            "active": "ended_at IS NULL",
            "resolved": "ended_at IS NOT NULL",
            "all": "1 = 1",
        }[state]
        with self._lock:
            rows = self._connection.execute(
                f"""
                SELECT * FROM incidents
                WHERE {condition}
                ORDER BY (ended_at IS NULL) DESC, started_at DESC
                LIMIT ?
                """,  # noqa: S608 - condition is selected from fixed constants.
                (limit,),
            ).fetchall()

        return tuple(self._from_row(row) for row in rows)

    def get(self, incident_id: UUID) -> Incident:
        """Return one incident by identifier."""
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM incidents WHERE incident_id = ?",
                (str(incident_id),),
            ).fetchone()
        if row is None:
            raise IncidentNotFoundError(str(incident_id))
        return self._from_row(row)

    def acknowledge(
        self,
        incident_id: UUID,
        *,
        acknowledged_at: datetime,
        note: str | None = None,
    ) -> Incident:
        """Acknowledge one incident while preserving its lifecycle."""
        self.get(incident_id)
        with self._lock:
            self._connection.execute(
                """
                UPDATE incidents
                SET acknowledged_at = ?, acknowledgement_note = ?
                WHERE incident_id = ?
                """,
                (acknowledged_at.isoformat(), note, str(incident_id)),
            )
            self._connection.commit()
        return self.get(incident_id)

    def silence(self, incident_id: UUID, *, until: datetime | None) -> Incident:
        """Set or clear one incident silence deadline."""
        self.get(incident_id)
        with self._lock:
            self._connection.execute(
                "UPDATE incidents SET silenced_until = ? WHERE incident_id = ?",
                (until.isoformat() if until is not None else None, str(incident_id)),
            )
            self._connection.commit()
        return self.get(incident_id)

    def close(self) -> None:
        """Close the incident database."""
        with self._lock:
            if not self._closed:
                self._connection.close()
                self._closed = True

    def _initialize_database(self) -> None:
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA synchronous=NORMAL")
        self._connection.execute("PRAGMA busy_timeout=5000")
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                incident_id TEXT PRIMARY KEY,
                node_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                capability_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                last_observed_at TEXT NOT NULL,
                ended_at TEXT,
                message TEXT,
                occurrence_count INTEGER NOT NULL,
                acknowledged_at TEXT,
                acknowledgement_note TEXT,
                silenced_until TEXT
            )
            """
        )
        self._connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS active_incident_capability
            ON incidents(node_id, service_id, capability_id)
            WHERE ended_at IS NULL
            """
        )
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS incident_observations (
                observation_id TEXT PRIMARY KEY
            )
            """
        )
        self._connection.commit()

    def _apply(self, observation: Observation) -> IncidentTransition | None:
        """Apply one observation inside the caller's transaction."""
        current = self._active_for_observation(observation)

        if observation.status in INCIDENT_STATUSES:
            if current is None:
                incident = self._open(observation)
                return IncidentTransition(kind="opened", incident=incident)

            if observation.observed_at < current.last_observed_at:
                return None

            incident = self._update(current, observation)
            return IncidentTransition(kind="updated", incident=incident)

        if current is None or observation.observed_at < current.last_observed_at:
            return None

        incident = self._resolve(current, observation)
        return IncidentTransition(kind="resolved", incident=incident)

    def _was_processed(self, observation_id: UUID) -> bool:
        row = self._connection.execute(
            "SELECT 1 FROM incident_observations WHERE observation_id = ?",
            (str(observation_id),),
        ).fetchone()
        return row is not None

    def _record_processed(self, observation_id: UUID) -> None:
        self._connection.execute(
            "INSERT INTO incident_observations (observation_id) VALUES (?)",
            (str(observation_id),),
        )

    def _active_for_observation(self, observation: Observation) -> Incident | None:
        row = self._connection.execute(
            """
            SELECT * FROM incidents
            WHERE node_id = ? AND service_id = ? AND capability_id = ?
              AND ended_at IS NULL
            """,
            (
                observation.node_id,
                observation.service_id,
                observation.capability_id,
            ),
        ).fetchone()
        return self._from_row(row) if row is not None else None

    def _open(self, observation: Observation) -> Incident:
        incident_id = uuid4()
        self._connection.execute(
            """
            INSERT INTO incidents (
                incident_id, node_id, service_id, capability_id, status,
                started_at, last_observed_at, message, occurrence_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                str(incident_id),
                observation.node_id,
                observation.service_id,
                observation.capability_id,
                observation.status.value,
                observation.observed_at.isoformat(),
                observation.observed_at.isoformat(),
                observation.message,
            ),
        )
        return self.get(incident_id)

    def _update(self, incident: Incident, observation: Observation) -> Incident:
        self._connection.execute(
            """
            UPDATE incidents
            SET status = ?, last_observed_at = ?, message = ?,
                occurrence_count = occurrence_count + 1
            WHERE incident_id = ?
            """,
            (
                observation.status.value,
                observation.observed_at.isoformat(),
                observation.message,
                str(incident.incident_id),
            ),
        )
        return self.get(incident.incident_id)

    def _resolve(self, incident: Incident, observation: Observation) -> Incident:
        self._connection.execute(
            """
            UPDATE incidents
            SET ended_at = ?,
                last_observed_at = ?
            WHERE incident_id = ?
            """,
            (
                observation.observed_at.isoformat(),
                observation.observed_at.isoformat(),
                str(incident.incident_id),
            ),
        )
        return self.get(incident.incident_id)

    @staticmethod
    def _from_row(row: sqlite3.Row) -> Incident:
        def timestamp(name: str) -> datetime | None:
            value = row[name]
            return datetime.fromisoformat(value) if value is not None else None

        return Incident(
            incident_id=UUID(row["incident_id"]),
            node_id=row["node_id"],
            service_id=row["service_id"],
            capability_id=row["capability_id"],
            status=HealthStatus(row["status"]),
            started_at=datetime.fromisoformat(row["started_at"]),
            last_observed_at=datetime.fromisoformat(row["last_observed_at"]),
            ended_at=timestamp("ended_at"),
            message=row["message"],
            occurrence_count=int(row["occurrence_count"]),
            acknowledged_at=timestamp("acknowledged_at"),
            acknowledgement_note=row["acknowledgement_note"],
            silenced_until=timestamp("silenced_until"),
        )
