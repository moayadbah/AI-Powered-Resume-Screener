import json
import os
import secrets
from pathlib import Path

import pytest

# Generated rather than a literal: a hardcoded credential-shaped string trips
# secret scanners, and tests read the value back from settings anyway.
os.environ.setdefault("SERVICE_TOKEN", secrets.token_hex(16))
# A dead port: if a test ever reaches Ollama for real it should fail fast rather
# than hang until the suite times out.
os.environ.setdefault("OLLAMA_BASE_URL", "http://127.0.0.1:1")
os.environ.setdefault("OLLAMA_TIMEOUT_SECONDS", "2")

FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "fixtures"

RESUME_NAMES = [
    "strong-backend",
    "partial-backend",
    "career-changer",
    "unrelated-designer",
    "minimal",
]


@pytest.fixture(scope="session")
def resumes() -> dict[str, str]:
    return {name: (FIXTURES / "resumes" / f"{name}.txt").read_text() for name in RESUME_NAMES}


@pytest.fixture(scope="session")
def jobs() -> dict[str, dict]:
    return {path.stem: json.loads(path.read_text()) for path in (FIXTURES / "jobs").glob("*.json")}


@pytest.fixture(scope="session")
def settings():
    from app.config import Settings

    return Settings()


@pytest.fixture(scope="session")
def embedder(settings):
    """Real model. Loaded once for the whole session - it is slow to build."""
    from app.services.embeddings import Embedder

    e = Embedder(settings)
    e.load()
    return e


@pytest.fixture
def auth_headers(settings):
    """Read the token from settings rather than hardcoding it.

    CI sets SERVICE_TOKEN to its own value, and setdefault above leaves that in
    place - a literal here would only match by luck locally and 401 everywhere
    else.
    """
    return {"X-Service-Token": settings.service_token}
