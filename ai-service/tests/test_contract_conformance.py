"""Validate real responses against docs/contracts/ai-service.openapi.yaml.

The failure this guards against: we rename a field, our own tests still pass
because they were updated alongside, and api-service finds out at runtime three
days later.

Required by docs/08-TESTING.md.
"""

from pathlib import Path

import httpx
import pytest
import respx
import yaml
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from app.main import app

SPEC_PATH = Path(__file__).resolve().parents[2] / "docs" / "contracts" / "ai-service.openapi.yaml"
GENERATE = "http://127.0.0.1:1/api/generate"


@pytest.fixture(scope="module")
def spec() -> dict:
    return yaml.safe_load(SPEC_PATH.read_text())


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def validate(spec: dict, schema_name: str, payload) -> None:
    """Check a payload against a named component schema.

    OpenAPI 3.0 uses `nullable: true` where JSON Schema uses a null type, so
    convert as we go rather than pulling in a full OAS validator.
    """

    def convert(node):
        if isinstance(node, list):
            return [convert(x) for x in node]
        if not isinstance(node, dict):
            return node

        out = {}
        for key, value in node.items():
            if key == "$ref":
                target = value.rsplit("/", 1)[-1]
                return convert(spec["components"]["schemas"][target])
            if key == "nullable":
                continue
            out[key] = convert(value)

        if node.get("nullable") and "type" in out:
            out["type"] = [out["type"], "null"]
            # An enum on a nullable field must admit null too.
            if "enum" in out and None not in out["enum"]:
                out["enum"] = [*out["enum"], None]
        return out

    schema = convert(spec["components"]["schemas"][schema_name])
    Draft202012Validator(schema).validate(payload)


def test_score_response_conforms(client, spec, auth_headers, jobs, resumes):
    job = jobs["backend-engineer"]
    body = {
        "jobDescription": job["description"],
        "requiredSkills": [s.lower() for s in job["requiredSkills"]],
        "resumes": [{"resumeId": "a", "text": resumes["strong-backend"]}],
    }
    payload = client.post("/score", json=body, headers=auth_headers).json()
    validate(spec, "ScoreResponse", payload)


def test_summarize_degraded_response_conforms(client, spec, auth_headers, jobs, resumes):
    body = {
        "resumeId": "a",
        "resumeText": resumes["strong-backend"],
        "jobDescription": jobs["backend-engineer"]["description"],
    }
    payload = client.post("/summarize", json=body, headers=auth_headers).json()
    assert payload["degraded"] is True
    validate(spec, "SummarizeResponse", payload)


def test_summarize_success_response_conforms(client, spec, auth_headers, jobs, resumes):
    body = {
        "resumeId": "a",
        "resumeText": resumes["strong-backend"],
        "jobDescription": jobs["backend-engineer"]["description"],
    }
    with respx.mock:
        respx.post(GENERATE).mock(
            return_value=httpx.Response(
                200,
                json={
                    "response": '{"summary": "Good match.", "strengths": ["x"], "concerns": ["y"]}'
                },
            )
        )
        payload = client.post("/summarize", json=body, headers=auth_headers).json()

    assert payload["degraded"] is False
    validate(spec, "SummarizeResponse", payload)


def test_health_response_conforms(client, spec):
    validate(spec, "HealthResponse", client.get("/health").json())


def test_model_info_response_conforms(client, spec, auth_headers):
    validate(spec, "ModelInfo", client.get("/model-info", headers=auth_headers).json())


def test_error_envelope_conforms(client, spec):
    payload = client.post("/score", json={}).json()
    validate(spec, "ErrorResponse", payload)


def test_every_documented_path_exists(client, spec):
    """A path in the spec that the app does not serve is drift.

    Read the app's own generated schema rather than walking `app.routes` - the
    shape of that list is a FastAPI internal and has changed between versions.
    """
    served = set(app.openapi()["paths"])
    for path in spec["paths"]:
        assert path in served, f"{path} is in the spec but not served"
