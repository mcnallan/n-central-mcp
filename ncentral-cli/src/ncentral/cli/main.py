"""CLI entry point for the N-central MCP client."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from ncentral_core.catalog import (
    CATEGORIES,
    DESTRUCTIVE,
    SEARCH_TARGETS,
    TOOL_BY_NAME,
    TOOLS,
    ArgSpec,
    ToolSpec,
    allowed_scopes,
    counts_by_scope,
)
from ncentral_core.mcp import McpConfig, NcentralMcpError, StreamableHttpMcpClient
from ncentral_core.output import emit, filter_rows, limit_rows, project_fields
from ncentral_core.role import RoleError, resolve_role


def main(argv: list[str] | None = None) -> int:
    try:
        raw_argv = list(argv) if argv is not None else sys.argv[1:]
        reject_removed_auth_flags(raw_argv)
        role = resolve_role(override=extract_role_override(raw_argv))
        parser = build_parser(role)
        args = parser.parse_args(raw_argv)
        role = resolve_role(override=args.role)
        handler = getattr(args, "handler", None)
        if handler is None:
            parser.print_help()
            return 1
        return int(handler(args, role) or 0)
    except (NcentralMcpError, RoleError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        payload = getattr(exc, "payload", None)
        if payload is not None:
            print(json.dumps(payload, indent=2, sort_keys=True), file=sys.stderr)
        return 1


def extract_role_override(argv: list[str]) -> str | None:
    for index, value in enumerate(argv):
        if value == "--role" and index + 1 < len(argv):
            return argv[index + 1]
        if value.startswith("--role="):
            return value.split("=", 1)[1]
    return None


def reject_removed_auth_flags(argv: list[str]) -> None:
    removed = {"--api-key", "--fqdn", "--jwt"}
    for value in argv:
        option = value.split("=", 1)[0]
        if option in removed:
            raise ValueError(f"{option} has been removed; configure authentication in ~/.ncentral-mcp/config.json")


def build_parser(role: str = "read") -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ncentral", description="N-central MCP-backed CLI", allow_abbrev=False)
    parser.add_argument("--url", help="MCP endpoint URL. Default: ~/.ncentral-mcp/config.json endpoint, env, or http://127.0.0.1:3100/mcp")
    parser.add_argument("--timeout", type=float, help="HTTP timeout in seconds.")
    parser.add_argument("--role", choices=("read", "read-write", "destructive", "write", "rw", "full"), help="Override installed role marker.")
    parser.add_argument("--output", choices=("toon", "json", "compact-json", "raw", "table"), default="toon", help="Output format. Default: toon.")
    sub = parser.add_subparsers(dest="command", required=True)

    tools_parser = sub.add_parser("tools", help="List known MCP tools.")
    add_output_arg(tools_parser)
    tools_parser.add_argument("--scope", choices=("read", "write", "destructive"))
    tools_parser.add_argument("--category", choices=CATEGORIES)
    tools_parser.set_defaults(handler=handle_tools)

    call_parser = sub.add_parser("call", help="Call any MCP tool by name.")
    add_output_arg(call_parser)
    call_parser.add_argument("tool")
    add_payload_args(call_parser)
    call_parser.add_argument("--fields", help="Comma-separated fields to keep from JSON results.")
    call_parser.add_argument("--limit", type=int, help="Limit list-like JSON results.")
    call_parser.set_defaults(handler=handle_call)

    search_parser = sub.add_parser("search", help="Search common read endpoints with server filters plus local matching.")
    add_output_arg(search_parser)
    search_parser.add_argument("target", choices=tuple(SEARCH_TARGETS.keys()))
    search_parser.add_argument("query", nargs="?", help="Case-insensitive local text match across returned rows.")
    search_parser.add_argument("--select", help="Server-side FIQL/RSQL filter where supported.")
    search_parser.add_argument("--arg", action="append", default=[], help="Extra tool argument as key=value.")
    search_parser.add_argument("--fields", help="Comma-separated fields to keep.")
    search_parser.add_argument("--limit", type=int, default=25, help="Maximum rows after local matching. Default: 25.")
    search_parser.set_defaults(handler=handle_search)

    resource_parser = sub.add_parser("resource", help="Read an MCP resource URI.")
    add_output_arg(resource_parser)
    resource_parser.add_argument("uri", help="Example: ncentral://org-tree")
    resource_parser.set_defaults(handler=handle_resource)

    org_tree_parser = sub.add_parser("org-tree", help="Read ncentral://org-tree.")
    add_output_arg(org_tree_parser)
    org_tree_parser.add_argument("--fields", help="Comma-separated fields to keep when the resource is tabular.")
    org_tree_parser.set_defaults(handler=handle_org_tree)

    prompts_parser = sub.add_parser("prompts", help="List MCP prompts.")
    add_output_arg(prompts_parser)
    prompts_parser.set_defaults(handler=handle_prompts)

    prompt_parser = sub.add_parser("prompt", help="Get an MCP prompt by name.")
    add_output_arg(prompt_parser)
    prompt_parser.add_argument("name")
    prompt_parser.add_argument("--arg", action="append", default=[], help="Prompt argument as key=value.")
    prompt_parser.set_defaults(handler=handle_prompt)

    visible_scopes = allowed_scopes(role)
    for category in CATEGORIES:
        visible_tools = [tool for tool in TOOLS if tool.category == category and tool.scope in visible_scopes]
        if not visible_tools:
            continue
        category_parser = sub.add_parser(category, help=f"{category} tools")
        category_sub = category_parser.add_subparsers(dest=f"{category}_command", required=True)
        for spec in visible_tools:
            command_name = command_alias(spec)
            tool_parser = category_sub.add_parser(command_name, aliases=[spec.name], help=spec.description, description=spec.description)
            add_output_arg(tool_parser)
            add_tool_args(tool_parser, spec)
            tool_parser.add_argument("--fields", help="Comma-separated fields to keep from JSON results.")
            tool_parser.add_argument("--limit", type=int, help="Limit list-like JSON results.")
            tool_parser.set_defaults(handler=handle_structured_tool, tool_name=spec.name)

    return parser


def handle_tools(args: argparse.Namespace, role: str) -> int:
    scopes = allowed_scopes(role)
    tools = [
        {"name": spec.name, "command": f"{spec.category} {command_alias(spec)}", "category": spec.category, "scope": spec.scope, "description": spec.description}
        for spec in TOOLS
        if spec.scope in scopes
        and (args.scope is None or spec.scope == args.scope)
        and (args.category is None or spec.category == args.category)
    ]
    emit({"role": role, "counts": counts_by_scope(TOOLS), "visible": len(tools), "tools": tools}, output=args.output)
    return 0


def handle_call(args: argparse.Namespace, role: str) -> int:
    spec = TOOL_BY_NAME.get(args.tool)
    if spec is None:
        raise ValueError(f"Unknown tool: {args.tool}")
    enforce_scope(spec, role)
    payload = load_payload(args)
    data = call_tool(args, args.tool, payload)
    data = shape_result(data, args.fields, args.limit)
    emit(data, output=args.output)
    return 0


def handle_structured_tool(args: argparse.Namespace, role: str) -> int:
    spec = TOOL_BY_NAME[args.tool_name]
    enforce_scope(spec, role)
    payload = payload_from_tool_args(args, spec)
    data = call_tool(args, spec.name, payload)
    data = shape_result(data, args.fields, args.limit)
    emit(data, output=args.output)
    return 0


def handle_search(args: argparse.Namespace, role: str) -> int:
    tool_name, defaults = SEARCH_TARGETS[args.target]
    spec = TOOL_BY_NAME[tool_name]
    enforce_scope(spec, role)
    payload = dict(defaults)
    if args.select:
        payload["select"] = args.select
    payload.update(parse_key_values(args.arg))
    data = call_tool(args, tool_name, payload)
    data = filter_rows(data, args.query)
    data = limit_rows(data, args.limit)
    data = project_fields(data, split_fields(args.fields))
    emit({"target": args.target, "tool": tool_name, "query": args.query, "result": data}, output=args.output)
    return 0


def handle_resource(args: argparse.Namespace, role: str) -> int:
    if role not in {"read", "read-write", "destructive"}:
        raise ValueError(f"Unknown role: {role}")
    with client_from_args(args) as client:
        data = client.read_resource(args.uri)
    emit(data, output=args.output)
    return 0


def handle_org_tree(args: argparse.Namespace, role: str) -> int:
    if role not in {"read", "read-write", "destructive"}:
        raise ValueError(f"Unknown role: {role}")
    with client_from_args(args) as client:
        data = client.read_resource("ncentral://org-tree")
    data = project_fields(data, split_fields(args.fields))
    emit(data, output=args.output)
    return 0


def handle_prompts(args: argparse.Namespace, role: str) -> int:
    if role not in {"read", "read-write", "destructive"}:
        raise ValueError(f"Unknown role: {role}")
    with client_from_args(args) as client:
        data = client.list_prompts()
    emit(data, output=args.output)
    return 0


def handle_prompt(args: argparse.Namespace, role: str) -> int:
    if role not in {"read", "read-write", "destructive"}:
        raise ValueError(f"Unknown role: {role}")
    with client_from_args(args) as client:
        data = client.get_prompt(args.name, parse_key_values(args.arg))
    emit(data, output=args.output)
    return 0


def call_tool(args: argparse.Namespace, tool_name: str, payload: dict[str, Any]) -> Any:
    with client_from_args(args) as client:
        return client.call_tool(tool_name, payload)


def client_from_args(args: argparse.Namespace) -> StreamableHttpMcpClient:
    return StreamableHttpMcpClient(
        McpConfig.from_env(
            url=args.url,
            timeout=args.timeout,
        )
    )


def enforce_scope(spec: ToolSpec, role: str) -> None:
    if spec.scope not in allowed_scopes(role):
        raise ValueError(f"Tool {spec.name} requires {spec.scope} scope; current role is {role}")


def add_payload_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--json", help="JSON object payload.")
    parser.add_argument("--input", help="Path to JSON payload, or '-' for stdin.")
    parser.add_argument("--arg", action="append", default=[], help="Tool argument as key=value. May be repeated.")


def add_output_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--output",
        choices=("toon", "json", "compact-json", "raw", "table"),
        default=argparse.SUPPRESS,
        help="Output format. Default: toon.",
    )


def add_tool_args(parser: argparse.ArgumentParser, spec: ToolSpec) -> None:
    for arg in spec.args:
        options = [f"--{kebab(arg.name)}"]
        raw_option = f"--{arg.name}"
        if raw_option not in options:
            options.append(raw_option)
        kwargs: dict[str, Any] = {"dest": arg.name, "required": arg.required, "help": arg.help or None}
        if arg.kind == "bool":
            parser.add_argument(*options, action="store_true", **kwargs)
            continue
        if arg.kind == "int":
            kwargs["type"] = int
        elif arg.kind == "float":
            kwargs["type"] = float
        if arg.choices:
            kwargs["choices"] = arg.choices
        parser.add_argument(*options, **kwargs)
    add_payload_args(parser)


def payload_from_tool_args(args: argparse.Namespace, spec: ToolSpec) -> dict[str, Any]:
    payload = load_payload(args)
    for arg in spec.args:
        value = getattr(args, arg.name, None)
        if value is None:
            continue
        if arg.kind == "json" and isinstance(value, str):
            value = json.loads(value)
        payload[arg.name] = value
    return payload


def load_payload(args: argparse.Namespace) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if getattr(args, "input", None):
        text = sys.stdin.read() if args.input == "-" else Path(args.input).read_text(encoding="utf-8")
        loaded = json.loads(text)
        if not isinstance(loaded, dict):
            raise ValueError("Input JSON payload must be an object")
        payload.update(loaded)
    if getattr(args, "json", None):
        loaded = json.loads(args.json)
        if not isinstance(loaded, dict):
            raise ValueError("--json payload must be an object")
        payload.update(loaded)
    payload.update(parse_key_values(getattr(args, "arg", [])))
    return payload


def parse_key_values(items: list[str]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"Expected key=value argument, got: {item}")
        key, raw = item.split("=", 1)
        values[key] = parse_scalar(raw)
    return values


def parse_scalar(raw: str) -> Any:
    stripped = raw.strip()
    if stripped == "":
        return ""
    if stripped.lower() in {"true", "false"}:
        return stripped.lower() == "true"
    if stripped.lower() == "null":
        return None
    if stripped[:1] in "[{":
        return json.loads(stripped)
    if re.fullmatch(r"-?\d+", stripped):
        return int(stripped)
    if re.fullmatch(r"-?\d+\.\d+", stripped):
        return float(stripped)
    return raw


def shape_result(data: Any, fields: str | None, limit: int | None) -> Any:
    data = limit_rows(data, limit)
    data = project_fields(data, split_fields(fields))
    return data


def split_fields(fields: str | None) -> list[str]:
    if not fields:
        return []
    return [field.strip() for field in fields.split(",") if field.strip()]


def command_alias(spec: ToolSpec) -> str:
    name = spec.name
    if spec.scope != "read":
        return kebab(name)
    explicit = {
        "list_devices": "list",
        "list_devices_by_org_unit": "by-org-unit",
        "get_device": "get",
        "get_appliance_task": "appliance-task",
        "list_org_units": "org-units",
        "get_org_unit": "org-unit",
        "get_org_unit_limits": "org-unit-limits",
        "list_org_unit_children": "org-unit-children",
        "get_server_info": "info",
        "get_server_time": "time",
        "list_device_filters": "device-filters",
        "get_registration_token": "registration-token",
        "get_device_activation_key": "activation-key",
        "get_software_installers": "software-installers",
        "get_maintenance_windows": "maintenance-windows",
        "get_psa_customer_mapping": "customer-mapping",
        "list_psa_customer_mappings": "customer-mappings",
        "get_custom_psa_ticket_detail": "custom-ticket-detail",
    }
    if name in explicit:
        return explicit[name]
    prefixes = {
        "devices": ("list_devices_by_", "list_devices", "get_device_", "get_device", "create_device", "update_device_", "patch_device_", "delete_device"),
        "organizations": ("list_", "get_", "create_", "update_"),
        "scheduled-tasks": ("list_", "get_", "create_"),
        "custom-properties": ("list_", "get_", "update_"),
        "users": ("list_", "get_", "create_"),
        "server-info": ("get_server_", "get_", "list_", "logout"),
        "registration": ("get_", "generate_"),
        "maintenance-windows": ("get_", "create_", "update_", "delete_"),
        "psa": ("list_", "get_", "create_", "update_", "validate_"),
        "notes": ("list_", "add_", "update_", "delete_", "clear_"),
        "reports": ("report_", "list_", "generate_"),
    }.get(spec.category, ())
    for prefix in prefixes:
        if name == prefix:
            return kebab(name)
        if name.startswith(prefix):
            trimmed = name[len(prefix):]
            return kebab(trimmed or name)
    return kebab(name)


def kebab(value: str) -> str:
    value = re.sub(r"(.)([A-Z][a-z]+)", r"\1-\2", value)
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
    return value.replace("_", "-").lower()


if __name__ == "__main__":
    raise SystemExit(main())
