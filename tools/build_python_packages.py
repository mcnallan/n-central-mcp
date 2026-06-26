#!/usr/bin/env python3
"""Build Python wheel artifacts for all package projects at the repo root."""

from __future__ import annotations

import argparse
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
BUILD_VENV = REPO_ROOT / ".build-tools-venv"


def find_package_dirs() -> list[Path]:
    return sorted(
        path
        for path in REPO_ROOT.iterdir()
        if path.is_dir() and (path / "pyproject.toml").exists()
    )


def _venv_python(venv_dir: Path) -> Path:
    if sys.platform == "win32":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _has_build_module(python_executable: Path) -> bool:
    result = subprocess.run(
        [str(python_executable), "-c", "import build"],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def ensure_build_python() -> Path:
    if importlib.util.find_spec("build") is not None:
        return Path(sys.executable)

    build_python = _venv_python(BUILD_VENV)
    if not build_python.exists():
        print(f"Bootstrapping local build environment in {BUILD_VENV.relative_to(REPO_ROOT)}")
        subprocess.run([sys.executable, "-m", "venv", str(BUILD_VENV)], check=True, cwd=str(REPO_ROOT))

    if not _has_build_module(build_python):
        subprocess.run(
            [str(build_python), "-m", "pip", "install", "--upgrade", "pip", "build"],
            check=True,
            cwd=str(REPO_ROOT),
        )
    return build_python


def build_package(package_dir: Path, output_dir: Path, *, build_python: Path) -> None:
    shutil.rmtree(package_dir / "build", ignore_errors=True)
    subprocess.run(
        [str(build_python), "-m", "build", "--wheel", str(package_dir), "--outdir", str(output_dir)],
        check=True,
        cwd=str(REPO_ROOT),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build all Python package projects at the repo root")
    parser.add_argument(
        "--outdir",
        default=str(REPO_ROOT / "dist"),
        help="Directory to place built artifacts into.",
    )
    args = parser.parse_args(argv)

    output_dir = Path(args.outdir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    package_dirs = find_package_dirs()
    if not package_dirs:
        raise SystemExit("No Python package projects found at the repo root")

    build_python = ensure_build_python()
    for package_dir in package_dirs:
        print(f"Building {package_dir.relative_to(REPO_ROOT)}")
        build_package(package_dir, output_dir, build_python=build_python)

    print(f"Built wheels are in {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
