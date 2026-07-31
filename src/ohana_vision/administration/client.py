"""HTTP client for the Agent-owned administration API."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class AgentAdministrationError(RuntimeError):
    """Raised when Ohana-Agent rejects or cannot serve an operation."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code


class AgentAdministrationClient:
    """Call the versioned administration contract exposed by Agent."""

    def __init__(
        self,
        *,
        base_url: str,
        token_file: Path,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token_file = token_file
        self.timeout_seconds = timeout_seconds

    def capabilities(self) -> dict[str, Any]:
        """Discover operations explicitly supported by Agent."""
        return self._request("GET", "/v1/capabilities")

    def read_dhcp(self) -> dict[str, Any]:
        """Read DHCP settings, reservations and active leases."""
        return self._request("GET", "/v1/dhcp")

    def write_dhcp(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Ask Agent to validate and apply DHCP configuration."""
        return self._request(
            "PUT",
            "/v1/dhcp",
            payload,
        )

    def read_network(self) -> dict[str, Any]:
        """Read the Agent host NetworkManager state."""
        return self._request("GET", "/v1/system/network")

    def write_network(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Apply a candidate Agent host network configuration."""
        return self._request("PUT", "/v1/system/network", payload)

    def confirm_network(self, transaction_id: str) -> dict[str, Any]:
        """Confirm a pending Agent host network change."""
        return self._request(
            "POST",
            f"/v1/system/network/{quote(transaction_id, safe='')}/confirm",
        )

    def rollback_network(self, transaction_id: str) -> dict[str, Any]:
        """Restore the previous Agent host network configuration."""
        return self._request(
            "POST",
            f"/v1/system/network/{quote(transaction_id, safe='')}/rollback",
        )

    def read_plugins(self) -> dict[str, Any]:
        """Read registered plugins and their runtime state."""
        return self._request("GET", "/v1/plugins")

    def read_plugin(self, identifier: str) -> dict[str, Any]:
        """Read one registered plugin."""
        return self._request(
            "GET",
            f"/v1/plugins/{quote(identifier, safe='')}",
        )

    def write_plugin(
        self,
        identifier: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Apply one plugin configuration through Agent."""
        return self._request(
            "PUT",
            f"/v1/plugins/{quote(identifier, safe='')}",
            payload,
        )

    def test_plugin(self, identifier: str) -> dict[str, Any]:
        """Execute one immediate plugin check through Agent."""
        return self._request(
            "POST",
            f"/v1/plugins/{quote(identifier, safe='')}/test",
        )

    def read_infrastructure(self) -> dict[str, Any]:
        """Read the Agent-owned infrastructure configuration."""
        return self._request("GET", "/v1/infrastructure")

    def write_infrastructure(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Ask Agent to validate and apply infrastructure configuration."""
        return self._request(
            "PUT",
            "/v1/infrastructure",
            payload,
        )

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        token = self._read_token()
        data = None

        if payload is not None:
            data = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")

        request = Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
                **(
                    {
                        "Content-Type": "application/json",
                    }
                    if data is not None
                    else {}
                ),
            },
        )

        try:
            with urlopen(  # noqa: S310 - URL is administrator-configured.
                request,
                timeout=self.timeout_seconds,
            ) as response:
                response_payload = json.load(response)
        except HTTPError as error:
            detail = self._http_error_detail(error)
            raise AgentAdministrationError(
                detail,
                status_code=error.code,
            ) from error
        except (OSError, URLError) as error:
            raise AgentAdministrationError(
                f"Ohana-Agent administration is unavailable: {error}"
            ) from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AgentAdministrationError(
                "Ohana-Agent returned an invalid JSON response"
            ) from error

        if not isinstance(response_payload, dict):
            raise AgentAdministrationError(
                "Ohana-Agent returned an invalid administration document"
            )

        return response_payload

    def _read_token(self) -> str:
        try:
            token = self.token_file.read_text(encoding="utf-8").strip()
        except OSError as error:
            raise AgentAdministrationError(
                f"Unable to read the administration token: {error}"
            ) from error

        if not token:
            raise AgentAdministrationError("The Ohana administration token is empty")

        return token

    @staticmethod
    def _http_error_detail(error: HTTPError) -> str:
        try:
            payload = json.load(error)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return f"Ohana-Agent rejected the operation ({error.code})"

        if isinstance(payload, dict) and payload.get("detail"):
            return str(payload["detail"])

        return f"Ohana-Agent rejected the operation ({error.code})"
