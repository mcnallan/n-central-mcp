"""Output shaping for agent-efficient CLI responses."""

from __future__ import annotations

import json
import subprocess
import sys
from typing import Any, Iterable


def emit(data: Any, *, output: str = "toon") -> None:
    if output == "raw":
        if isinstance(data, str):
            print(data)
        else:
            print(json.dumps(data, indent=2, sort_keys=True))
        return
    if output == "json":
        print(json.dumps(data, indent=2, sort_keys=True))
        return
    if output == "compact-json":
        print(json.dumps(data, separators=(",", ":"), sort_keys=True))
        return
    if output == "table":
        print_table(data)
        return
    if output == "toon":
        print(to_toon(data))
        return
    raise ValueError(f"Unknown output format: {output}")


def to_toon(data: Any) -> str:
    try:
        from toon import encode

        return encode(data)
    except Exception:
        pass

    raw = json.dumps(data, separators=(",", ":"), sort_keys=True)
    try:
        proc = subprocess.run(
            ["toon", "-"],
            input=raw,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError:
        return raw
    if proc.returncode != 0:
        print(proc.stderr.strip(), file=sys.stderr)
        return raw
    return proc.stdout.strip()


def print_table(data: Any) -> None:
    rows = _rows(data)
    if not rows:
        return
    keys = list(dict.fromkeys(key for row in rows for key in row.keys()))
    widths = {key: max(len(key), *(len(_cell(row.get(key))) for row in rows)) for key in keys}
    print("  ".join(key.ljust(widths[key]) for key in keys))
    print("  ".join("-" * widths[key] for key in keys))
    for row in rows:
        print("  ".join(_cell(row.get(key)).ljust(widths[key]) for key in keys))


def _rows(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        data = data["data"]
    if isinstance(data, list):
        return [row if isinstance(row, dict) else {"value": row} for row in data]
    if isinstance(data, dict):
        return [data]
    return [{"value": data}]


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"))
    return str(value)


def project_fields(data: Any, fields: Iterable[str] | None) -> Any:
    selected = [field.strip() for field in fields or [] if field.strip()]
    if not selected:
        return data
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return {**data, "data": [_project_row(row, selected) for row in data["data"]]}
    if isinstance(data, list):
        return [_project_row(row, selected) for row in data]
    if isinstance(data, dict):
        return _project_row(data, selected)
    return data


def limit_rows(data: Any, limit: int | None) -> Any:
    if limit is None or limit < 0:
        return data
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return {**data, "data": data["data"][:limit]}
    if isinstance(data, list):
        return data[:limit]
    return data


def filter_rows(data: Any, query: str | None) -> Any:
    if not query:
        return data
    q = query.casefold()
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return {**data, "data": [row for row in data["data"] if _matches(row, q)]}
    if isinstance(data, list):
        return [row for row in data if _matches(row, q)]
    return data if _matches(data, q) else None


def _project_row(row: Any, fields: list[str]) -> dict[str, Any]:
    if not isinstance(row, dict):
        return {"value": row}
    return {field: _dig(row, field) for field in fields}


def _dig(row: dict[str, Any], path: str) -> Any:
    current: Any = row
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _matches(value: Any, query: str) -> bool:
    if isinstance(value, dict):
        return any(_matches(v, query) for v in value.values())
    if isinstance(value, list):
        return any(_matches(v, query) for v in value)
    return query in str(value).casefold()
