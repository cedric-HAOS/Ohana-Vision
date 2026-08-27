"""Bounded gateway client for Agent's Shizune companion contract."""

from __future__ import annotations

import json
import ssl
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class AgentCompanionError(RuntimeError):
    """Raised when Agent's companion listener rejects a request."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class AgentCompanionClient:
    """Call only the synthetic API intended for Shizune."""

    def __init__(
        self,
        *,
        base_url: str,
        ca_certificate_file: Path,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.ca_certificate_file = ca_certificate_file
        self.timeout_seconds = timeout_seconds

    def create_pairing(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/pairings/companions", payload)

    def poll_pairing(
        self,
        pairing_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        identifier = quote(pairing_id, safe="")
        return self._request(
            "POST",
            f"/v1/pairings/companions/{identifier}/poll",
            payload,
        )

    def read_summary(self, device_id: str, token: str) -> dict[str, Any]:
        return self._request(
            "GET",
            "/v1/incidents/summary",
            device_id=device_id,
            token=token,
        )

    def read_requests(self, device_id: str, token: str) -> dict[str, Any]:
        return self._request(
            "GET",
            "/v1/incidents/requests",
            device_id=device_id,
            token=token,
        )

    def read_activity(self, device_id: str, token: str) -> dict[str, Any]:
        return self._request(
            "GET",
            "/v1/incidents/activity",
            device_id=device_id,
            token=token,
        )

    def read_suggestions(self, device_id: str, token: str) -> dict[str, Any]:
        return self._request(
            "GET",
            "/v1/incidents/suggestions",
            device_id=device_id,
            token=token,
        )

    def respond(
        self,
        request_id: str,
        payload: dict[str, Any],
        device_id: str,
        token: str,
    ) -> dict[str, Any]:
        identifier = quote(request_id, safe="")
        return self._request(
            "POST",
            f"/v1/incidents/requests/{identifier}/response",
            payload,
            device_id=device_id,
            token=token,
        )

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        *,
        device_id: str | None = None,
        token: str | None = None,
    ) -> dict[str, Any]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if device_id is not None:
            headers["X-Ohana-Companion-Id"] = device_id
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(
            f"{self.base_url}{path}",
            method=method,
            data=data,
            headers=headers,
        )
        try:
            context = ssl.create_default_context(cafile=str(self.ca_certificate_file))
            with urlopen(
                request,
                timeout=self.timeout_seconds,
                context=context,
            ) as response:
                document = json.load(response)
        except HTTPError as error:
            message = self._error_message(error)
            raise AgentCompanionError(message, status_code=error.code) from error
        except (OSError, URLError, ValueError) as error:
            raise AgentCompanionError(
                f"Le canal Shizune vers Agent est indisponible : {error}"
            ) from error
        if not isinstance(document, dict):
            raise AgentCompanionError("Agent a renvoyé une réponse compagnon invalide")
        return document

    @staticmethod
    def _error_message(error: HTTPError) -> str:
        try:
            document = json.load(error)
        except (OSError, ValueError):
            return f"Agent a refusé la requête Shizune ({error.code})"
        if isinstance(document, dict):
            return str(document.get("error") or document.get("detail") or error.reason)
        return f"Agent a refusé la requête Shizune ({error.code})"
