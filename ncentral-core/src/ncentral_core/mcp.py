"""Minimal Streamable HTTP MCP client for the N-central CLI."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_MCP_URL = "http://127.0.0.1:3100/mcp"
DEFAULT_CONFIG_PATH = Path("~/.ncentral-mcp/config.json")
MCP_PROTOCOL_VERSION = "2025-06-18"


class NcentralMcpError(RuntimeError):
    """Raised when the MCP endpoint returns an error."""

    def __init__(self, message: str, payload: Any | None = None) -> None:
        super().__init__(message)
        self.payload = payload


@dataclass(frozen=True)
class McpConfig:
    url: str
    api_key: str | None = None
    timeout: float = 60.0

    @classmethod
    def from_env(
        cls,
        url: str | None = None,
        timeout: float | None = None,
    ) -> "McpConfig":
        config = load_config_file()
        return cls(
            url=url or config.get("endpoint") or os.environ.get("NCENTRAL_MCP_URL") or os.environ.get("MCP_URL") or DEFAULT_MCP_URL,
            api_key=config.get("api_key"),
            timeout=timeout or float(os.environ.get("NCENTRAL_MCP_TIMEOUT", "60")),
        )


def config_path() -> Path:
    return DEFAULT_CONFIG_PATH.expanduser()


def load_config_file() -> dict[str, str]:
    path = config_path()
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}") from exc
    if not isinstance(loaded, dict):
        raise ValueError(f"{path} must contain a JSON object")

    config: dict[str, str] = {}
    for key in ("endpoint", "api_key"):
        value = loaded.get(key)
        if value is None:
            continue
        if not isinstance(value, str):
            raise ValueError(f"{path} field {key!r} must be a string")
        stripped = value.strip()
        if stripped:
            config[key] = stripped
    return config


class StreamableHttpMcpClient:
    """Small JSON-RPC client for MCP Streamable HTTP servers."""

    def __init__(self, config: McpConfig) -> None:
        self.config = config
        self.session_id: str | None = None
        self._next_id = 1

    def __enter__(self) -> "StreamableHttpMcpClient":
        self.initialize()
        return self

    def __exit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        self.close()

    def initialize(self) -> dict[str, Any]:
        response, headers = self._rpc(
            "initialize",
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "ncentral-cli", "version": "0.1.0"},
            },
            include_session=False,
            capture_headers=True,
        )
        self.session_id = headers.get("mcp-session-id") or headers.get("Mcp-Session-Id")
        if not self.session_id:
            raise NcentralMcpError("MCP initialize succeeded but did not return mcp-session-id", response)
        self._notification("notifications/initialized", {})
        return response

    def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        result = self._rpc("tools/call", {"name": name, "arguments": arguments})
        if result.get("isError"):
            text = _content_text(result)
            raise NcentralMcpError(text or f"MCP tool failed: {name}", result)
        return _parse_content(result)

    def read_resource(self, uri: str) -> Any:
        result = self._rpc("resources/read", {"uri": uri})
        return _parse_resource(result)

    def list_prompts(self) -> Any:
        return self._rpc("prompts/list", {})

    def get_prompt(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        params: dict[str, Any] = {"name": name}
        if arguments:
            params["arguments"] = arguments
        return self._rpc("prompts/get", params)

    def close(self) -> None:
        if not self.session_id:
            return
        headers = self._headers(include_session=True)
        request = Request(self.config.url, method="DELETE", headers=headers)
        try:
            urlopen(request, timeout=self.config.timeout).read()
        except Exception:
            pass
        finally:
            self.session_id = None

    def _notification(self, method: str, params: dict[str, Any]) -> None:
        payload = {"jsonrpc": "2.0", "method": method, "params": params}
        self._request(payload, include_session=True)

    def _rpc(
        self,
        method: str,
        params: dict[str, Any],
        *,
        include_session: bool = True,
        capture_headers: bool = False,
    ) -> Any:
        request_id = self._next_id
        self._next_id += 1
        payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
        response, headers = self._request(payload, include_session=include_session)
        if response is None:
            raise NcentralMcpError(f"MCP {method} returned no response")
        if "error" in response:
            error = response["error"]
            message = error.get("message") if isinstance(error, dict) else str(error)
            raise NcentralMcpError(message or f"MCP {method} failed", response)
        result = response.get("result")
        return (result, headers) if capture_headers else result

    def _request(self, payload: dict[str, Any], *, include_session: bool) -> tuple[dict[str, Any] | None, dict[str, str]]:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = self._headers(include_session=include_session)
        request = Request(self.config.url, data=body, method="POST", headers=headers)
        try:
            with urlopen(request, timeout=self.config.timeout) as response:
                raw = response.read().decode("utf-8", errors="replace")
                response_headers = dict(response.headers.items())
                status = getattr(response, "status", 200)
                if status == 202 or not raw.strip():
                    return None, response_headers
                return _decode_http_body(raw, response_headers.get("content-type", "")), response_headers
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = raw
            raise NcentralMcpError(f"HTTP {exc.code} from MCP endpoint", payload) from exc
        except URLError as exc:
            raise NcentralMcpError(f"Could not reach MCP endpoint: {exc.reason}") from exc

    def _headers(self, *, include_session: bool) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        if include_session:
            if not self.session_id:
                raise NcentralMcpError("MCP session has not been initialized")
            headers["mcp-session-id"] = self.session_id
        return headers


def _decode_http_body(raw: str, content_type: str) -> dict[str, Any]:
    if "text/event-stream" in content_type or raw.lstrip().startswith("event:"):
        data_lines: list[str] = []
        for line in raw.splitlines():
            if line.startswith("data:"):
                data_lines.append(line[5:].strip())
        raw = "\n".join(data_lines)
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise NcentralMcpError("MCP endpoint returned invalid JSON", raw) from exc
    if not isinstance(decoded, dict):
        raise NcentralMcpError("MCP endpoint returned a non-object JSON-RPC response", decoded)
    return decoded


def _content_text(result: dict[str, Any]) -> str:
    parts = result.get("content") or []
    texts = [part.get("text", "") for part in parts if isinstance(part, dict) and part.get("type") == "text"]
    return "\n".join(texts).strip()


def _parse_content(result: dict[str, Any]) -> Any:
    text = _content_text(result)
    if not text:
        return result
    stripped = text.strip()
    if stripped.startswith("Error:"):
        raise NcentralMcpError(stripped, result)
    if stripped[:1] in "[{":
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            return text
    return text


def _parse_resource(result: dict[str, Any]) -> Any:
    contents = result.get("contents")
    if not isinstance(contents, list):
        return result
    parsed = []
    for item in contents:
        if not isinstance(item, dict):
            parsed.append(item)
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip()[:1] in "[{":
            try:
                item = {**item, "text": json.loads(text)}
            except json.JSONDecodeError:
                pass
        parsed.append(item)
    return parsed[0].get("text") if len(parsed) == 1 and isinstance(parsed[0], dict) else parsed
