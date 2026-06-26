# Agent Notes

This repository is an N-central MCP server plus an agent-first Python CLI that
uses the MCP server as its only API gateway.

For full CLI implementation context, read:

- [docs/CLI-ARCHITECTURE.md](docs/CLI-ARCHITECTURE.md)

## Key Points

- Do not make the Python CLI call N-central REST endpoints directly. It should
  call the MCP server at `/mcp`.
- Keep upstream JavaScript MCP server changes minimal unless the server itself
  is wrong. The CLI is meant to sit beside the server without making future
  upstream pulls painful.
- Auth is config-file based:

```json
{
  "endpoint": "http://127.0.0.1:3100/mcp",
  "api_key": "replace-with-mcp-api-key"
}
```

The path is `~/.ncentral-mcp/config.json`. The CLI intentionally does not have
`--api-key`, `--fqdn`, or `--jwt` options.

## Python Packages

- `ncentral-core`: shared catalog, MCP transport, output, and role logic.
- `ncentral-cli`: the `ncentral` command.
- `ncentral-cli-role-read`: read-only marker package.
- `ncentral-cli-role-readwrite`: read/write marker package.
- `ncentral-cli-role-destructive`: read/write/destructive marker package.

Install globally with pipx from local wheels:

```bash
./tools/build_python_packages.py --outdir ./dist
pipx install --force --pip-args="--find-links $(pwd)/dist" "ncentral-cli[read]"
```

Use exactly one role extra: `read`, `readwrite`, or `destructive`.

## Verification

Run the stdlib test suite:

```bash
PYTHONPATH=ncentral-core/src:ncentral-cli/src python3 -m unittest discover -s ncentral-cli/tests -v
```

Live smoke test, assuming `~/.ncentral-mcp/config.json` is present:

```bash
PYTHONPATH=ncentral-core/src:ncentral-cli/src python3 -m ncentral.cli.main \
  --output json call get_server_info --arg level=health
```

## Working Rules

- Prefer TOON output for agent-facing retrieval.
- Use `--fields`, `--limit`, `--page-size`, and server `--select` filters to
  keep responses small.
- If adding MCP tools, update `ncentral_core.catalog.TOOLS` and the expected
  count tests.
- Clean generated `build/`, `*.egg-info`, and `__pycache__` directories before
  finishing. These are gitignored but should not clutter status output.
