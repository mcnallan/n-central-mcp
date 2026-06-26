import contextlib
import io
import json
import os
import tempfile
import unittest
from unittest import mock

from ncentral.cli.main import build_parser, main
from ncentral_core.catalog import DESTRUCTIVE, READ, TOOLS, WRITE, counts_by_scope, tools_for_role
from ncentral_core.mcp import McpConfig, load_config_file
from ncentral_core.output import to_toon
from ncentral_core.role import resolve_role


class CatalogTests(unittest.TestCase):
    def test_catalog_matches_readme_tool_counts(self):
        counts = counts_by_scope(TOOLS)
        self.assertEqual(len(TOOLS), 87)
        self.assertEqual(counts, {READ: 56, WRITE: 26, DESTRUCTIVE: 5})
        self.assertEqual(len(tools_for_role("read")), 56)
        self.assertEqual(len(tools_for_role("read-write")), 82)
        self.assertEqual(len(tools_for_role("destructive")), 87)

    def test_role_filtered_parser_hides_destructive_commands(self):
        build_parser("read").parse_args(["devices", "list", "--all", "--fields", "deviceId,longName"])
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                build_parser("read").parse_args(["devices", "delete-device", "--device-id", "1"])
        build_parser("destructive").parse_args(["devices", "delete-device", "--device-id", "1"])
        build_parser("destructive").parse_args(["devices", "delete_device", "--deviceId", "1"])

    def test_role_marker_distribution_resolution(self):
        self.assertEqual(resolve_role(["ncentral-cli-role-read"]), "read")
        self.assertEqual(resolve_role(["ncentral-cli-role-readwrite"]), "read-write")
        self.assertEqual(resolve_role(["ncentral-cli-role-destructive"]), "destructive")

    def test_toon_encoder_uses_local_cli(self):
        encoded = to_toon({"a": 1, "rows": [{"x": 2}]})
        self.assertIn("a: 1", encoded)
        self.assertIn("rows[1,]{x}", encoded)

    def test_mcp_config_reads_home_config(self):
        with tempfile.TemporaryDirectory() as home:
            config_dir = os.path.join(home, ".ncentral-mcp")
            os.makedirs(config_dir)
            with open(os.path.join(config_dir, "config.json"), "w", encoding="utf-8") as handle:
                json.dump({"endpoint": "http://example.test/mcp", "api_key": "abc123"}, handle)

            with mock.patch.dict(os.environ, {"HOME": home}, clear=True):
                self.assertEqual(load_config_file(), {"endpoint": "http://example.test/mcp", "api_key": "abc123"})
                config = McpConfig.from_env()

        self.assertEqual(config.url, "http://example.test/mcp")
        self.assertEqual(config.api_key, "abc123")

    def test_mcp_config_cli_url_overrides_home_config(self):
        with tempfile.TemporaryDirectory() as home:
            config_dir = os.path.join(home, ".ncentral-mcp")
            os.makedirs(config_dir)
            with open(os.path.join(config_dir, "config.json"), "w", encoding="utf-8") as handle:
                json.dump({"endpoint": "http://config.test/mcp", "api_key": "config-key"}, handle)

            with mock.patch.dict(os.environ, {"HOME": home}, clear=True):
                config = McpConfig.from_env(url="http://cli.test/mcp")

        self.assertEqual(config.url, "http://cli.test/mcp")
        self.assertEqual(config.api_key, "config-key")

    def test_auth_flags_are_not_exposed(self):
        for flag in ("--api-key", "--fqdn", "--jwt"):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                result = main([flag, "value", "tools"])
            self.assertEqual(result, 1)
            self.assertIn("~/.ncentral-mcp/config.json", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
