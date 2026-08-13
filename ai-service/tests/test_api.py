"""API surface: status codes, the error envelope, auth, and camelCase on the wire.

These are the shapes api-service depends on. Breaking one here breaks Marwan's
half at runtime, which is exactly the failure the contract exists to prevent.
"""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app

GENERATE = "http://127.0.0.1:1/api/generate"


@pytest.fixture(scope="module")
def client():
    # Enters the lifespan, so the real model loads once for this module.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def score_body(jobs, resumes):
    job = jobs["backend-engineer"]
    return {
        "jobDescription": job["description"],
        "requiredSkills": [s.lower() for s in job["requiredSkills"]],
        "resumes": [
            {"resumeId": "a", "text": resumes["strong-backend"]},
            {"resumeId": "b", "text": resumes["unrelated-designer"]},
        ],
    }


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------


def test_health_needs_no_token(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["modelLoaded"] is True
    assert set(body) == {"status", "modelLoaded", "ollamaReachable"}


def test_ollama_being_down_does_not_make_us_unhealthy(client):
    # Nothing is listening on the configured port during tests.
    body = client.get("/health").json()
    assert body["ollamaReachable"] is False
    assert body["status"] == "ok"


@pytest.mark.parametrize("path", ["/score", "/summarize"])
def test_missing_token_is_401_in_the_envelope(client, path):
    r = client.post(path, json={})
    assert r.status_code == 401
    err = r.json()["error"]
    assert err["code"] == "INVALID_SERVICE_TOKEN"
    assert len(err["traceId"]) == 16
    assert set(err) == {"code", "message", "traceId", "details"}


def test_wrong_token_is_401(client):
    r = client.get("/model-info", headers={"X-Service-Token": "nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_SERVICE_TOKEN"


def test_model_info_requires_a_token(client):
    assert client.get("/model-info").status_code == 401


# Auth is checked before validation, so a bad token on a bad body still says 401.
def test_auth_precedes_validation(client):
    r = client.post("/score", json={"nonsense": True})
    assert r.status_code == 401


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def test_validation_failure_shape(client, auth_headers):
    r = client.post("/score", json={"jobDescription": "too short"}, headers=auth_headers)
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_FAILED"
    assert err["details"]


def test_malformed_json(client, auth_headers):
    r = client.post(
        "/score",
        content=b"{not json",
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "MALFORMED_JSON"


def test_unknown_fields_are_rejected(client, auth_headers, score_body):
    r = client.post("/score", json={**score_body, "surpriseField": 1}, headers=auth_headers)
    assert r.status_code == 400


def test_too_many_resumes_rejected(client, auth_headers, score_body):
    body = {**score_body, "resumes": [{"resumeId": str(i), "text": "x"} for i in range(51)]}
    assert client.post("/score", json=body, headers=auth_headers).status_code == 400


# --------------------------------------------------------------------------
# /score
# --------------------------------------------------------------------------


def test_score_response_matches_the_contract(client, auth_headers, score_body):
    r = client.post("/score", json=score_body, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()

    assert set(body) == {"results", "modelVersion", "weights", "durationMs"}
    assert body["weights"] == {"semantic": 0.7, "skill": 0.3}
    assert body["modelVersion"].startswith("all-MiniLM-L6-v2@")
    assert isinstance(body["durationMs"], int)

    # Same order as the request, one per input.
    assert [x["resumeId"] for x in body["results"]] == ["a", "b"]

    first = body["results"][0]
    assert set(first) == {
        "resumeId",
        "score",
        "semanticScore",
        "skillScore",
        "matchedSkills",
        "missingSkills",
    }
    assert isinstance(first["score"], int)
    assert first["score"] > body["results"][1]["score"]


def test_score_is_camel_case_on_the_wire(client, auth_headers, score_body):
    raw = client.post("/score", json=score_body, headers=auth_headers).text
    assert "semanticScore" in raw
    assert "semantic_score" not in raw


# --------------------------------------------------------------------------
# /summarize
# --------------------------------------------------------------------------


def test_summarize_returns_200_when_ollama_is_down(client, auth_headers, jobs, resumes):
    body = {
        "resumeId": "a",
        "resumeText": resumes["strong-backend"],
        "jobDescription": jobs["backend-engineer"]["description"],
        "matchedSkills": ["java"],
        "missingSkills": [],
    }
    r = client.post("/summarize", json=body, headers=auth_headers)

    # 200, not 5xx - this is the contract.
    assert r.status_code == 200
    payload = r.json()
    assert payload["degraded"] is True
    assert payload["degradedReason"] == "ollama_unreachable"
    assert payload["summary"] is None


def test_summarize_success_shape(client, auth_headers, jobs, resumes):
    body = {
        "resumeId": "a",
        "resumeText": resumes["strong-backend"],
        "jobDescription": jobs["backend-engineer"]["description"],
        "matchedSkills": ["java"],
        "missingSkills": ["rest api"],
    }
    with respx.mock:
        respx.post(GENERATE).mock(
            return_value=httpx.Response(
                200,
                json={
                    "response": '{"summary": "Good match.", "strengths": ["a"], "concerns": ["b"]}'
                },
            )
        )
        r = client.post("/summarize", json=body, headers=auth_headers)

    assert r.status_code == 200
    payload = r.json()
    assert set(payload) == {
        "resumeId",
        "summary",
        "strengths",
        "concerns",
        "degraded",
        "degradedReason",
        "promptVersion",
        "model",
    }
    assert payload["degraded"] is False
    assert payload["summary"] == "Good match."


# --------------------------------------------------------------------------
# /model-info
# --------------------------------------------------------------------------


def test_model_info_reports_what_is_loaded(client, auth_headers):
    r = client.get("/model-info", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()

    # Real values from the loaded model, not hardcoded strings.
    assert body["dimensions"] == 384
    assert body["maxSequenceLength"] == 256
    assert body["embeddingModel"] == "sentence-transformers/all-MiniLM-L6-v2"
    assert body["weights"] == {"semantic": 0.7, "skill": 0.3}


def test_model_version_agrees_with_score(client, auth_headers, score_body):
    info = client.get("/model-info", headers=auth_headers).json()
    scored = client.post("/score", json=score_body, headers=auth_headers).json()
    assert info["modelVersion"] == scored["modelVersion"]
