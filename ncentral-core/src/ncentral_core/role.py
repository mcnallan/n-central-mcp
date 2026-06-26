"""Install-time role resolution for the N-central CLI."""

from __future__ import annotations

import os
import re
from importlib import metadata
from typing import Iterable

READ_ROLE = "read"
READ_WRITE_ROLE = "read-write"
DESTRUCTIVE_ROLE = "destructive"
SUPPORTED_ROLES = (READ_ROLE, READ_WRITE_ROLE, DESTRUCTIVE_ROLE)

ROLE_MARKER_DISTRIBUTIONS = {
    READ_ROLE: "ncentral-cli-role-read",
    READ_WRITE_ROLE: "ncentral-cli-role-readwrite",
    DESTRUCTIVE_ROLE: "ncentral-cli-role-destructive",
}

_NORMALIZE_PATTERN = re.compile(r"[-_.]+")


class RoleError(RuntimeError):
    pass


def _normalize_distribution_name(value: str) -> str:
    return _NORMALIZE_PATTERN.sub("-", value).strip().lower()


def installed_roles(distribution_names: Iterable[str] | None = None) -> set[str]:
    if distribution_names is None:
        distribution_names = (dist.metadata.get("Name", "") for dist in metadata.distributions())
    normalized = {_normalize_distribution_name(name) for name in distribution_names}
    return {
        role
        for role, dist_name in ROLE_MARKER_DISTRIBUTIONS.items()
        if _normalize_distribution_name(dist_name) in normalized
    }


def resolve_role(distribution_names: Iterable[str] | None = None, override: str | None = None) -> str:
    env_role = override or os.environ.get("NCENTRAL_CLI_ROLE")
    if env_role:
        normalized = env_role.strip().lower().replace("_", "-")
        aliases = {"rw": READ_WRITE_ROLE, "write": READ_WRITE_ROLE, "full": DESTRUCTIVE_ROLE}
        normalized = aliases.get(normalized, normalized)
        if normalized in SUPPORTED_ROLES:
            return normalized
        raise RoleError(f"Unknown N-central CLI role: {env_role}")

    roles = installed_roles(distribution_names)
    if len(roles) == 1:
        return next(iter(roles))
    if not roles:
        return READ_ROLE

    marker_list = ", ".join(ROLE_MARKER_DISTRIBUTIONS[role] for role in SUPPORTED_ROLES)
    raise RoleError(
        "Conflicting N-central CLI role markers are installed. "
        f"Remove extras and install exactly one of: {marker_list}"
    )
